// La dirección del despliegue que escribe wrangler (B17, 1.3). El formato sale del código de wrangler:
// pages-deploy-detailed con pages_project, deployment_id, url, alias, environment y production_branch
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outputLines, pagesDevUrlOf, parseWranglerOutput } from './deploy-url.ts';

const line = (entry: Record<string, unknown>) =>
  JSON.stringify({ version: 1, timestamp: '2026-10-22T00:00:00.000Z', ...entry });
const SESSION = line({ type: 'wrangler-session', wrangler_version: '4.146.0' });
const SIMPLE = line({
  type: 'pages-deploy',
  pages_project: 'studiare',
  deployment_id: 'd-1',
  url: 'https://a1b2c3d4.studiare.pages.dev',
});
const DETAILED = line({
  type: 'pages-deploy-detailed',
  pages_project: 'studiare',
  deployment_id: 'd-1',
  url: 'https://a1b2c3d4.studiare.pages.dev',
  alias: 'https://mi-rama.studiare.pages.dev',
  environment: 'preview',
  production_branch: 'main',
  deployment_trigger: { metadata: { commit_hash: 'abc' } },
});

describe('parseWranglerOutput', () => {
  it('toma la dirección, el alias y el ambiente de la entrada detallada', () => {
    expect(parseWranglerOutput([SESSION, SIMPLE, DETAILED, ''].join('\n'))).toEqual({
      url: 'https://a1b2c3d4.studiare.pages.dev',
      alias: 'https://mi-rama.studiare.pages.dev',
      environment: 'preview',
    });
  });

  it('con solo la entrada sencilla da la dirección sin alias', () => {
    expect(parseWranglerOutput(`${SESSION}\n${SIMPLE}\n`)).toEqual({
      url: 'https://a1b2c3d4.studiare.pages.dev',
    });
  });

  it('el orden de las dos entradas no cambia el resultado', () => {
    expect(parseWranglerOutput(`${DETAILED}\n${SIMPLE}`)).toEqual(
      parseWranglerOutput(`${SIMPLE}\n${DETAILED}`),
    );
  });

  it('si hubo dos publicaciones se queda con la última', () => {
    const second = line({
      type: 'pages-deploy',
      url: 'https://ffff0000.studiare.pages.dev',
    });
    expect(parseWranglerOutput([SIMPLE, DETAILED, second].join('\n'))).toEqual({
      url: 'https://ffff0000.studiare.pages.dev',
    });
  });

  it('el ambiente production se reconoce', () => {
    const production = line({
      type: 'pages-deploy-detailed',
      url: 'https://a1b2c3d4.studiare.pages.dev',
      environment: 'production',
    });
    expect(parseWranglerOutput(production)?.environment).toBe('production');
  });

  it.each([
    ['archivo vacío', ''],
    ['solo la sesión', SESSION],
    ['líneas que no son JSON', 'esto no es json\n{roto'],
    ['otra entrada con url', line({ type: 'deploy', url: 'https://x.studiare.pages.dev' })],
    [
      'una dirección que no es de pages.dev',
      line({ type: 'pages-deploy', url: 'https://malo.example' }),
    ],
    ['http', line({ type: 'pages-deploy', url: 'http://x.studiare.pages.dev' })],
    [
      'pages.dev como sufijo de otro dominio',
      line({ type: 'pages-deploy', url: 'https://x.pages.dev.malo.mx' }),
    ],
    [
      'una dirección con ruta',
      line({ type: 'pages-deploy', url: 'https://x.studiare.pages.dev/otra' }),
    ],
    [
      'una dirección con usuario',
      line({ type: 'pages-deploy', url: 'https://u@x.studiare.pages.dev' }),
    ],
    ['una url que no es texto', line({ type: 'pages-deploy', url: 12 })],
    [
      'un salto de línea que arma otra dirección',
      line({ type: 'pages-deploy', url: 'https://x.pages.dev\n.pages.dev' }),
    ],
    [
      'saltos de línea escondidos',
      line({ type: 'pages-deploy', url: 'https://x.pages.dev\nmalo=1' }),
    ],
  ])('%s no da ninguna dirección', (_label, text) => {
    expect(parseWranglerOutput(text)).toBeNull();
  });

  it('un alias raro se ignora pero la dirección buena se conserva', () => {
    const odd = line({
      type: 'pages-deploy-detailed',
      url: 'https://a1b2c3d4.studiare.pages.dev',
      alias: 'https://malo.example',
    });
    expect(parseWranglerOutput(odd)).toEqual({ url: 'https://a1b2c3d4.studiare.pages.dev' });
  });
});

describe('pagesDevUrlOf y outputLines', () => {
  it('deja el origen sin diagonal final', () => {
    expect(pagesDevUrlOf('https://studiare.pages.dev/')).toBe('https://studiare.pages.dev');
    expect(pagesDevUrlOf(' https://a.b.pages.dev ')).toBe('https://a.b.pages.dev');
    expect(pagesDevUrlOf('https://pages.dev')).toBeUndefined();
  });

  it('las salidas del paso son líneas nombre=valor sin saltos escondidos', () => {
    const lines = outputLines({
      url: 'https://a.studiare.pages.dev',
      alias: 'https://b.studiare.pages.dev',
      environment: 'preview',
    });
    expect(lines).toEqual([
      'url=https://a.studiare.pages.dev',
      'alias=https://b.studiare.pages.dev',
      'environment=preview',
    ]);
    expect(outputLines({ url: 'https://a.studiare.pages.dev' })).toEqual([
      'url=https://a.studiare.pages.dev',
    ]);
  });
});

describe('línea de comandos', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/smoke/deploy-url.ts', ...args], {
      cwd: join(import.meta.dirname, '..', '..'),
      encoding: 'utf8',
    });

  it('imprime las salidas con el archivo bueno y sale con 1 sin imprimir nada si no hay dirección', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enarm-wrangler-'));
    try {
      const good = join(dir, 'bueno.ndjson');
      const bad = join(dir, 'malo.ndjson');
      writeFileSync(good, `${SESSION}\n${DETAILED}\n`);
      writeFileSync(bad, `${SESSION}\n`);
      const ok = run(good);
      expect(ok.status).toBe(0);
      expect(ok.stdout).toBe(
        'url=https://a1b2c3d4.studiare.pages.dev\nalias=https://mi-rama.studiare.pages.dev\nenvironment=preview\n',
      );
      const missing = run(bad);
      expect(missing.status).toBe(1);
      expect(missing.stdout).toBe('');
      expect(run(join(dir, 'no-existe.ndjson')).status).toBe(1);
      expect(run().status).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
