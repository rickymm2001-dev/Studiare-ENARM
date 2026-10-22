// Prueba en seco del flujo de Cloudflare (B17, 1.3). No hay actionlint en esta máquina y no se puede llamar a
// Cloudflare ni a GitHub, así que se hacen dos cosas con el texto del flujo
//   1. Se revisan sus reglas de seguridad leyendo el archivo, como hace pages-workflow.test.ts
//   2. Se corren de verdad, en bash y con un npx falso, los pasos que hablan con wrangler y la prueba de humo, con
//      los valores que GitHub pondría en las expresiones ${{ }}. Así se ve qué comando sale, que una rama con
//      comillas o signos de dólar llegue como un solo argumento y que el flujo termine donde debe
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildHeadersFile } from '../src/config/csp.ts';
import { applySiteMetadata, siteFiles } from './site-files.ts';
import { startPagesServer, type RunningPagesServer } from './smoke/local-pages.ts';
import { workflowTriggers } from './workflow-triggers.ts';

const ROOT = resolve(import.meta.dirname, '..');
const text = readFileSync(join(ROOT, '.github/workflows/cloudflare.yml'), 'utf8');

interface Step {
  name: string;
  /** El texto completo del paso, tal como está en el archivo */
  block: string;
  condition: string | undefined;
  /** El comando, si el paso trae run */
  run: string | undefined;
  /** Las variables de entorno del paso, con las expresiones sin resolver */
  env: Record<string, string>;
}

/** Lee los pasos del trabajo por su sangría. Basta para este archivo, que no usa anclas ni listas anidadas */
function readSteps(source: string): Step[] {
  const start = source.indexOf('\n    steps:\n');
  const body = source.slice(start + '\n    steps:\n'.length);
  return body
    .split(/^ {6}- /m)
    .slice(1)
    .map((chunk) => {
      const block = `      - ${chunk}`;
      const lines = block.split('\n');
      const field = (key: string): string | undefined =>
        lines.find((line) => line.startsWith(`        ${key}: `))?.slice(`        ${key}: `.length);
      const first = (lines[0] ?? '').replace(/^ {6}- /, '');
      const name = first.startsWith('name: ') ? first.slice(6) : (first.split(': ')[1] ?? first);
      const runIndex = lines.findIndex((line) => /^ {8}run: /.test(line));
      let run: string | undefined;
      if (runIndex >= 0) {
        const head = (lines[runIndex] ?? '').replace(/^ {8}run: /, '');
        if (head === '|') {
          const rest: string[] = [];
          for (const line of lines.slice(runIndex + 1)) {
            if (line.trim() !== '' && !line.startsWith('          ')) break;
            rest.push(line.slice(10));
          }
          run = rest.join('\n').trimEnd();
        } else run = head;
      }
      const env: Record<string, string> = {};
      const envIndex = lines.findIndex((line) => line === '        env:');
      if (envIndex >= 0) {
        for (const line of lines.slice(envIndex + 1)) {
          const match = /^ {10}([A-Z_]+): (.*)$/.exec(line);
          if (!match) {
            if (line.trim() === '' || line.trim().startsWith('#')) continue;
            break;
          }
          env[match[1] ?? ''] = (match[2] ?? '').replace(/^'(.*)'$/, '$1');
        }
      }
      return { name: name || first, block, condition: field('if'), run, env };
    });
}

const steps = readSteps(text);
const step = (name: string): Step => {
  const found = steps.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`No hay un paso llamado ${name}`);
  return found;
};

describe('reglas del flujo de Cloudflare', () => {
  it('está apagado sin la variable CLOUDFLARE_DEPLOY y no corre para pull requests de otro repositorio', () => {
    expect(text).toMatch(
      /^ {4}if: vars\.CLOUDFLARE_DEPLOY == 'true' && \(github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository\)$/m,
    );
  });

  it('los pasos que hablan con Cloudflare siguen a la revisión de credenciales y solo corren si está lista', () => {
    const names = steps.map((candidate) => candidate.name);
    const check = names.indexOf('Revisar credenciales');
    expect(check).toBeGreaterThan(-1);
    for (const name of ['Crear el proyecto', 'Publicar']) {
      expect(names.indexOf(name), name).toBeGreaterThan(check);
      expect(step(name).condition, name).toContain("steps.creds.outputs.ready == 'true'");
    }
    // La revisión misma nunca se salta ni lleva condición que la haga fallar
    expect(step('Revisar credenciales').condition).toBeUndefined();
  });

  it('solo lo disparan push, pull_request y workflow_dispatch, nunca un evento que corra con secretos sobre código ajeno', () => {
    // pull_request_target y workflow_run corren con los secretos del repositorio aunque el cambio venga de un fork,
    // y con ellos github.event_name != 'pull_request' deja de excluir a los forks de la guarda del trabajo
    expect(workflowTriggers(text)).toEqual(['push', 'pull_request', 'workflow_dispatch']);
  });

  it('la vigilancia de eventos atrapa los eventos peligrosos en cualquiera de las formas de escribir on:', () => {
    const block = (events: string) => `name: x\non:\n${events}\npermissions:\n  contents: read\n`;
    expect(
      workflowTriggers(block('  push:\n    branches: [main]\n  pull_request_target:')),
    ).toEqual(['push', 'pull_request_target']);
    expect(workflowTriggers(block('  workflow_run:\n    workflows: [check]'))).toEqual([
      'workflow_run',
    ]);
    expect(workflowTriggers('on: pull_request_target\njobs:\n  a:\n')).toEqual([
      'pull_request_target',
    ]);
    expect(workflowTriggers('on: [push, pull_request_target] # nota\njobs:\n')).toEqual([
      'push',
      'pull_request_target',
    ]);
    expect(() => workflowTriggers('name: sin eventos\n')).toThrow();
  });

  it('solo permite leer el contenido y no usa acciones de terceros', () => {
    expect(text).toMatch(/^permissions:\n {2}contents: read\n/m);
    const uses = [...text.matchAll(/^\s+- uses: (\S+)/gm)].map((match) => match[1]);
    expect(uses).toEqual(['actions/checkout@v7', 'actions/setup-node@v7']);
    expect(text).not.toMatch(/cloudflare\/wrangler-action/);
  });

  it('wrangler solo se corre por npx, con la misma versión exacta y sin instalarse', () => {
    const calls = [...text.matchAll(/wrangler@[^\s]+/g)].map((match) => match[0]);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(new Set(calls)).toEqual(new Set(['wrangler@4.146.0']));
    expect(text).not.toMatch(/npm (?:i|install) .*wrangler|npm (?:i|install) -g|yarn global/);
    expect(text).not.toMatch(/(?:^|\s)wrangler (?:pages|deploy)/m);
  });

  it('nunca copia index.html a 404.html, que en Cloudflare haría que las rutas respondan 404', () => {
    const code = text.replace(/^\s*#.*$/gm, '');
    expect(code).not.toContain('404.html');
    expect(code).not.toMatch(/\bcp\b[^\n]*index\.html/);
  });

  it('ningún comando lleva expresiones de GitHub: todo pasa por variables de entorno', () => {
    for (const candidate of steps) {
      if (candidate.run !== undefined) {
        expect(candidate.run, candidate.name).not.toContain('${{');
      }
    }
    // La rama, que es lo que más fácil trae signos raros, solo aparece en un env
    const uses = [...text.matchAll(/github\.head_ref/g)];
    expect(uses).toHaveLength(1);
    expect(step('Publicar').env.BRANCH).toBe('${{ github.head_ref || github.ref_name }}');
    expect(step('Publicar').run).toContain('--branch="$BRANCH"');
    expect(step('Publicar').run).toContain('--project-name="$PROJECT"');
    expect(step('Publicar').run).not.toContain('--commit-message');
  });

  it('el token de Cloudflare solo lo reciben los pasos que hablan con Cloudflare', () => {
    const withToken = steps
      .filter((candidate) => candidate.block.includes('secrets.CLOUDFLARE_API_TOKEN'))
      .map((candidate) => candidate.name);
    expect(withToken).toEqual(['Revisar credenciales', 'Crear el proyecto', 'Publicar']);
    // Ni npm ci ni los builds lo ven, así ningún script de una dependencia puede leerlo. Y el env del trabajo,
    // que ven todos los pasos, no lleva ningún secreto
    const jobEnv = text.slice(text.indexOf('\n    env:\n'), text.indexOf('\n    steps:\n'));
    expect(jobEnv).toContain('PRODUCTION:');
    expect(jobEnv).not.toContain('secrets.');
  });

  it('el token de Sentry solo llega al build de producción', () => {
    const withSentry = steps
      .filter((candidate) => candidate.block.includes('secrets.SENTRY_AUTH_TOKEN'))
      .map((candidate) => candidate.name);
    expect(withSentry).toEqual(['Construir producción']);
  });

  it('la vista previa se construye como demo, sin variables de la nube, de pagos ni de medición', () => {
    const preview = step('Construir vista previa');
    expect(preview.env).toEqual({ VITE_APP_ENV: 'demo' });
    expect(preview.block).not.toMatch(/secrets\.|VITE_SUPABASE|STRIPE|POSTHOG|SENTRY|SITE_URL/);
    expect(preview.condition).toContain("env.PRODUCTION != 'true'");
  });

  it('producción pasa VITE_APP_ENV=production, SITE_URL ya validada y las variables públicas', () => {
    const build = step('Construir producción');
    expect(build.condition).toContain("env.PRODUCTION == 'true'");
    expect(build.env.VITE_APP_ENV).toBe('production');
    expect(build.env.SITE_URL).toBe('${{ steps.creds.outputs.site_url }}');
    for (const name of [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VITE_LEGAL_NAME',
      'VITE_LEGAL_ADDRESS',
      'VITE_PRIVACY_EMAIL',
      'VITE_SUPPORT_EMAIL',
      'VITE_POSTHOG_KEY',
      'VITE_POSTHOG_HOST',
      'VITE_SENTRY_DSN',
      'VITE_STRIPE_PUBLISHABLE_KEY',
    ]) {
      expect(build.env[name], name).toBe(`\${{ vars.${name} }}`);
    }
    // Una variable VITE_ llega al navegador: ninguna toma su valor de un secreto
    for (const [name, value] of Object.entries(build.env)) {
      if (name.startsWith('VITE_')) expect(value, name).not.toContain('secrets.');
    }
  });

  it('el proyecto se crea solo con la casilla y sin publicar en esa corrida', () => {
    expect(text).toMatch(
      /workflow_dispatch:\n {4}inputs:\n {6}crear_proyecto:\n(?: {8}.*\n)*? {8}type: boolean/,
    );
    expect(step('Crear el proyecto').condition).toContain('inputs.crear_proyecto == true');
    expect(step('Crear el proyecto').run).toBe(
      'npx --yes wrangler@4.146.0 pages project create "$PROJECT" --production-branch=main',
    );
    for (const name of ['Construir producción', 'Construir vista previa', 'Publicar']) {
      expect(step(name).condition, name).toContain('inputs.crear_proyecto != true');
    }
  });

  it('producción es el push a main y una producción nunca se cancela a la mitad', () => {
    expect(text).toContain(
      "PRODUCTION: ${{ github.event_name != 'pull_request' && github.ref == 'refs/heads/main' }}",
    );
    expect(text).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
  });
});

// -------------------------------------------------------------------------------------------------------------
// Corrida en seco de los pasos, en bash
// -------------------------------------------------------------------------------------------------------------

/** Cambia las expresiones ${{ }} por los valores que GitHub pondría. Una expresión desconocida es un error */
function resolveExpressions(value: string, context: Record<string, string>): string {
  return value.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_match, expression: string) => {
    const resolved = context[expression];
    if (resolved === undefined) throw new Error(`Falta el valor de la expresión ${expression}`);
    return resolved;
  });
}

describe('corrida en seco de los pasos del flujo', () => {
  let dir = '';
  let bin = '';
  let server: RunningPagesServer;
  let site = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'enarm-cloudflare-'));
    bin = join(dir, 'bin');
    mkdirSync(bin);
    // npx falso. Anota cada argumento en una línea del registro y, si le piden el archivo de salida de wrangler,
    // escribe lo que escribiría wrangler al publicar
    writeFileSync(
      join(bin, 'npx'),
      [
        '#!/usr/bin/env bash',
        'for argument in "$@"; do printf "%s\\n" "$argument" >> "$FAKE_LOG"; done',
        'printf -- "--fin--\\n" >> "$FAKE_LOG"',
        'if [ -n "$WRANGLER_OUTPUT_FILE_PATH" ]; then',
        '  printf \'{"type":"pages-deploy","version":1,"url":"%s"}\\n\' "$FAKE_DEPLOY_URL" > "$WRANGLER_OUTPUT_FILE_PATH"',
        'fi',
        '',
      ].join('\n'),
    );
    // sleep falso, para que los reintentos de la prueba de humo no esperen de verdad
    writeFileSync(
      join(bin, 'sleep'),
      '#!/usr/bin/env bash\nprintf "dormir %s\\n" "$1" >> "$FAKE_LOG"\n',
    );
    chmodSync(join(bin, 'npx'), 0o755);
    chmodSync(join(bin, 'sleep'), 0o755);

    // Un sitio de vista previa bueno para la prueba de humo
    const dist = join(dir, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(
      join(dist, 'index.html'),
      applySiteMetadata(
        [
          '<!doctype html><meta property="og:image" content="/og-image.png" />',
          '<!--seo--><title>%BRAND_TITLE%</title>',
          '<script type="module" src="/assets/index-AbC123.js"></script>',
        ].join('\n'),
        { site: undefined, base: '/' },
      ),
    );
    writeFileSync(join(dist, 'assets', 'index-AbC123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'sw.js'), 'self.skipWaiting()');
    writeFileSync(join(dist, 'manifest.webmanifest'), '{"scope":"/","start_url":"/"}');
    const png = Buffer.alloc(2000);
    png[0] = 0x89;
    writeFileSync(join(dist, 'og-image.png'), png);
    for (const file of siteFiles({
      appEnv: 'demo',
      siteUrl: undefined,
      supportEmail: undefined,
      now: new Date(),
    })) {
      writeFileSync(join(dist, file.fileName), file.source);
    }
    writeFileSync(join(dist, '_headers'), buildHeadersFile());
    server = await startPagesServer(dist);
    site = server.url;
  });
  afterAll(async () => {
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Corre el comando de un paso con bash, con su env resuelto y el PATH con los falsos al frente */
  async function runStep(
    name: string,
    context: Record<string, string>,
    extraEnv: Record<string, string> = {},
  ) {
    const target = step(name);
    if (target.run === undefined) throw new Error(`${name} no tiene run`);
    const log = join(dir, `${name.replaceAll(' ', '-')}.log`);
    writeFileSync(log, '');
    const env: Record<string, string> = {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      RUNNER_TEMP: dir,
      GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567',
      GITHUB_OUTPUT: join(dir, 'github-output'),
      GITHUB_STEP_SUMMARY: join(dir, 'summary'),
      FAKE_LOG: log,
      FAKE_DEPLOY_URL: 'https://a1b2c3d4.studiare.pages.dev',
      ...extraEnv,
    };
    for (const [key, value] of Object.entries(target.env)) {
      env[key] = resolveExpressions(value, context);
    }
    // Asíncrono: el servidor de la prueba vive en este mismo proceso y un spawnSync lo dejaría sin atender
    const result = await new Promise<{ status: number | null; stdout: string; stderr: string }>(
      (done) => {
        const child = spawn('bash', ['-eo', 'pipefail', '-c', target.run ?? ''], {
          cwd: ROOT,
          env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on('close', (status) => {
          done({ status, stdout, stderr });
        });
      },
    );
    const calls = readFileSync(log, 'utf8')
      .split('--fin--\n')
      .filter((call) => call !== '')
      .map((call) => call.split('\n').filter((line) => line !== ''));
    return { ...result, calls, log };
  }

  const baseContext = {
    'secrets.CLOUDFLARE_API_TOKEN': 'token-falso',
    'secrets.CLOUDFLARE_ACCOUNT_ID': '0123456789abcdef0123456789abcdef',
    'steps.creds.outputs.project': 'studiare',
    'github.head_ref || github.ref_name': 'main',
    'steps.deployed.outputs.url': 'https://a1b2c3d4.studiare.pages.dev',
    'steps.deployed.outputs.alias': '',
    'steps.deployed.outputs.environment': 'production',
    'steps.creds.outputs.smoke_mode': 'preview',
    'steps.creds.outputs.site_url': '',
  };

  it('Publicar corre wrangler pages deploy con la carpeta dist, el proyecto, la rama y el commit', async () => {
    const run = await runStep('Publicar', baseContext);
    expect(run.status, run.stderr).toBe(0);
    expect(run.calls).toEqual([
      [
        '--yes',
        'wrangler@4.146.0',
        'pages',
        'deploy',
        'dist',
        '--project-name=studiare',
        '--branch=main',
        '--commit-hash=0123456789abcdef0123456789abcdef01234567',
        '--commit-dirty=true',
      ],
    ]);
    // Le pide a wrangler que escriba su salida donde la lee deploy-url.ts
    expect(readFileSync(join(dir, 'wrangler.ndjson'), 'utf8')).toContain('pages.dev');
  });

  it('una rama con comillas, signos de dólar o punto y coma llega como un solo argumento y no se ejecuta', async () => {
    const hostile = 'x"; touch pwned; echo "$(id)`id`';
    const run = await runStep('Publicar', {
      ...baseContext,
      'github.head_ref || github.ref_name': hostile,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.calls).toHaveLength(1);
    expect(run.calls[0]).toContain(`--branch=${hostile}`);
    expect(run.calls[0]).toHaveLength(9);
    expect(() => readFileSync(join(ROOT, 'pwned'))).toThrow();
  });

  it('Crear el proyecto corre wrangler pages project create con la rama de producción main', async () => {
    const run = await runStep('Crear el proyecto', baseContext);
    expect(run.status, run.stderr).toBe(0);
    expect(run.calls).toEqual([
      [
        '--yes',
        'wrangler@4.146.0',
        'pages',
        'project',
        'create',
        'studiare',
        '--production-branch=main',
      ],
    ]);
  });

  it('Dirección del despliegue deja la dirección validada en GITHUB_OUTPUT', async () => {
    rmSync(join(dir, 'github-output'), { force: true });
    writeFileSync(
      join(dir, 'wrangler.ndjson'),
      '{"type":"pages-deploy-detailed","version":1,"url":"https://a1b2c3d4.studiare.pages.dev","alias":"https://mi-rama.studiare.pages.dev","environment":"preview"}\n',
    );
    const run = await runStep('Dirección del despliegue', baseContext);
    expect(run.status, run.stderr).toBe(0);
    expect(readFileSync(join(dir, 'github-output'), 'utf8')).toBe(
      'url=https://a1b2c3d4.studiare.pages.dev\nalias=https://mi-rama.studiare.pages.dev\nenvironment=preview\n',
    );
  });

  it('Dirección del despliegue falla si wrangler no dejó una dirección de pages.dev', async () => {
    writeFileSync(
      join(dir, 'wrangler.ndjson'),
      '{"type":"pages-deploy","url":"https://malo.example"}\n',
    );
    const run = await runStep('Dirección del despliegue', baseContext);
    expect(run.status).not.toBe(0);
  });

  it('Prueba de humo pasa con un sitio bueno, a la primera y sin dormir', async () => {
    const run = await runStep('Prueba de humo', {
      ...baseContext,
      'steps.deployed.outputs.url': site,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('Todo en verde');
    expect(run.calls).toEqual([]);
  });

  it('Prueba de humo reintenta con pausas y termina en rojo si el sitio nunca queda bien', async () => {
    // Pide el modo de producción a un sitio que no se deja indexar: nunca va a pasar
    const run = await runStep('Prueba de humo', {
      ...baseContext,
      'steps.deployed.outputs.url': site,
      'steps.creds.outputs.smoke_mode': 'production',
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('FALLA');
    // Cuatro intentos y tres pausas entre ellos, sin dormir de más después del último
    expect(run.calls.flat()).toEqual(['dormir 15', 'dormir 15', 'dormir 15']);
    expect(run.stderr.match(/FALLA GET \/\n/g)).toHaveLength(4);
  });

  it('Resumen escribe la dirección en el resumen de GitHub', async () => {
    rmSync(join(dir, 'summary'), { force: true });
    const run = await runStep('Resumen', {
      ...baseContext,
      'steps.deployed.outputs.alias': 'https://mi-rama.studiare.pages.dev',
      'steps.deployed.outputs.environment': 'preview',
    });
    expect(run.status, run.stderr).toBe(0);
    const summary = readFileSync(join(dir, 'summary'), 'utf8');
    expect(summary).toContain('### Publicado en Cloudflare Pages');
    expect(summary).toContain('- Ambiente: preview');
    expect(summary).toContain('- Dirección: https://a1b2c3d4.studiare.pages.dev');
    expect(summary).toContain('- Alias de la rama: https://mi-rama.studiare.pages.dev');
  });
});
