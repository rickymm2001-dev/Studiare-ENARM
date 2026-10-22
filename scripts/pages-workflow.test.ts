// El workflow de GitHub Pages pasa al build las variables que PENDIENTES_DE_RICARDO.md le pide a Ricardo poner
// (B15, pasos B15.4, B15.9 y B15.11). Sin esto, seguir los pasos no prendía nada: el build nunca las leía.
// Se lee el texto del workflow, sin interpretarlo, y se revisa que cada variable llegue de donde debe.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { workflowTriggers } from './workflow-triggers.ts';

const ROOT = resolve(import.meta.dirname, '..');
const workflow = readFileSync(resolve(ROOT, '.github/workflows/pages.yml'), 'utf8');
const pending = readFileSync(resolve(ROOT, 'docs/PENDIENTES_DE_RICARDO.md'), 'utf8');

/** Las variables públicas, que van como variables de GitHub (vars) */
const PUBLIC = [
  'VITE_POSTHOG_KEY',
  'VITE_POSTHOG_HOST',
  'VITE_SENTRY_DSN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
] as const;

describe('pages.yml pasa al build las variables de B15', () => {
  it.each(PUBLIC)('%s viene de las variables de GitHub', (name) => {
    expect(workflow).toMatch(new RegExp(`^\\s+${name}: \\$\\{\\{ vars\\.${name} \\}\\}\\s*$`, 'm'));
  });

  it('el token de Sentry viene de los secretos y no de una variable pública', () => {
    expect(workflow).toMatch(/^\s+SENTRY_AUTH_TOKEN: \$\{\{ secrets\.SENTRY_AUTH_TOKEN \}\}\s*$/m);
    expect(workflow).not.toMatch(/vars\.SENTRY_AUTH_TOKEN/);
    // Una variable VITE_ llega al bundle del navegador, y el token nunca debe
    expect(workflow).not.toMatch(/VITE_SENTRY_AUTH_TOKEN|VITE_SENTRY_TOKEN/);
  });

  it('todas van en el paso de build, con el resto del entorno', () => {
    const build = workflow.slice(workflow.indexOf('- run: npm run build'));
    const end = build.indexOf('- run: cp dist/index.html');
    const step = build.slice(0, end);
    for (const name of [...PUBLIC, 'SENTRY_AUTH_TOKEN']) expect(step).toContain(`${name}:`);
  });

  it('PENDIENTES le pide a Ricardo cada una de las que el workflow lee', () => {
    for (const name of [...PUBLIC, 'SENTRY_AUTH_TOKEN']) expect(pending).toContain(name);
  });
});

// pages.yml publica con permisos de escritura de Pages y de id-token. Si lo disparara un evento que corre con secretos
// sobre código ajeno (pull_request_target, workflow_run), un fork podría publicar en la demo
describe('pages.yml, eventos que lo disparan', () => {
  it('solo lo disparan push a main y Run workflow', () => {
    expect(workflowTriggers(workflow)).toEqual(['push', 'workflow_dispatch']);
  });

  it('ningún flujo del repositorio se dispara con pull_request_target ni con workflow_run', () => {
    const folder = resolve(ROOT, '.github/workflows');
    const files = readdirSync(folder).filter((name) => name.endsWith('.yml'));
    expect(files).toEqual(
      expect.arrayContaining(['calibration.yml', 'check.yml', 'cloudflare.yml', 'pages.yml']),
    );
    for (const name of files) {
      const triggers = workflowTriggers(readFileSync(resolve(folder, name), 'utf8'));
      expect(triggers, name).not.toContain('pull_request_target');
      expect(triggers, name).not.toContain('workflow_run');
    }
  });
});

// El modo de mudanza (B17, 3 del plan de B17). Con PAGES_MOVED_TO, pages.yml publica el sitio de mudanza y deja de
// construir la app. Sin la variable queda como siempre, que es lo que revisan las pruebas de arriba
describe('pages.yml, modo de mudanza (B17, 3.4)', () => {
  /** Los renglones del paso que empieza en el texto dado, hasta el siguiente paso */
  const stepFrom = (start: string): string => {
    const from = workflow.indexOf(start);
    expect(from, start).toBeGreaterThan(-1);
    const next = workflow.indexOf('\n      - ', from + 1);
    return workflow.slice(from, next === -1 ? undefined : next);
  };

  it('el sitio de mudanza se construye solo con la variable, y la app solo sin ella', () => {
    expect(stepFrom('- name: Construir el sitio de mudanza')).toContain(
      "if: vars.PAGES_MOVED_TO != ''",
    );
    for (const start of ['- run: npm ci', '- run: npm run build', '- run: cp dist/index.html']) {
      expect(stepFrom(start), start).toContain("if: vars.PAGES_MOVED_TO == ''");
    }
  });

  it('el comando de la mudanza no lleva expresiones de GitHub: la dirección y la ruta pasan por el entorno', () => {
    const step = stepFrom('- name: Construir el sitio de mudanza');
    const run = /run: (.+)/.exec(step)?.[1] ?? '';
    expect(run).toBe(
      'node scripts/deploy/moved-site.ts --to "$MOVED_TO" --base "$BASE_PATH" --out dist',
    );
    expect(run).not.toContain('${{');
    expect(step).toContain('MOVED_TO: ${{ vars.PAGES_MOVED_TO }}');
    expect(step).toContain('BASE_PATH: ${{ steps.pages.outputs.base_path }}');
  });

  it('el aviso de catorce días viene de variables de GitHub, que son públicas, y no de secretos', () => {
    expect(workflow).toMatch(/^\s+VITE_MOVED_TO: \$\{\{ vars\.VITE_MOVED_TO \}\}\s*$/m);
    expect(workflow).toMatch(/^\s+VITE_MOVED_ON: \$\{\{ vars\.VITE_MOVED_ON \}\}\s*$/m);
    // Y van en el paso de build de la app
    const build = stepFrom('- run: npm run build');
    expect(build).toContain('VITE_MOVED_TO:');
    expect(build).toContain('VITE_MOVED_ON:');
  });

  it('el sitio de mudanza se sube igual que la app: la carpeta dist', () => {
    expect(stepFrom('- uses: actions/upload-pages-artifact@v5')).toContain('path: dist');
  });

  it('corrido en seco, el paso escribe el sitio de mudanza con las variables que pondría GitHub', () => {
    const run = /run: (.+)/.exec(stepFrom('- name: Construir el sitio de mudanza'))?.[1] ?? '';
    const out = mkdtempSync(join(tmpdir(), 'enarm-pages-moved-'));
    try {
      // La carpeta de salida es dist en el flujo; aquí se cambia por una temporal para no escribir en el repositorio
      const result = spawnSync(
        'bash',
        ['-eo', 'pipefail', '-c', run.replace('--out dist', `--out ${out}/dist`)],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '',
            MOVED_TO: 'https://tudominio.mx',
            BASE_PATH: '/Studiare-ENARM',
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(readdirSync(join(out, 'dist')).sort()).toEqual([
        '404.html',
        'favicon-64x64.png',
        'index.html',
        'manifest.webmanifest',
        'moved.css',
        'moved.js',
        'pwa-192x192.png',
        'sw.js',
      ]);
      expect(readFileSync(join(out, 'dist', 'moved.js'), 'utf8')).toContain('"/Studiare-ENARM/"');
      // Con una dirección que no sirve el paso falla en rojo y no publica una mudanza a ningún lado
      const bad = spawnSync(
        'bash',
        ['-eo', 'pipefail', '-c', run.replace('--out dist', `--out ${out}/malo`)],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: {
            PATH: process.env.PATH ?? '',
            MOVED_TO: 'http://tudominio.mx',
            BASE_PATH: '/Studiare-ENARM',
          },
        },
      );
      expect(bad.status).toBe(2);
      expect(() => readdirSync(join(out, 'malo'))).toThrow();
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it('PENDIENTES o PUBLICACION le dicen a Ricardo cómo prender la mudanza', () => {
    const publication = readFileSync(resolve(ROOT, 'docs/PUBLICACION.md'), 'utf8');
    for (const name of ['PAGES_MOVED_TO', 'VITE_MOVED_TO', 'VITE_MOVED_ON']) {
      expect(publication).toContain(name);
    }
  });
});
