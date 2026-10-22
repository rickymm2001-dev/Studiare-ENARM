// La revisión de credenciales del flujo de Cloudflare (B17, 1.3 y 1.4). Los valores de estas pruebas son de mentira
// y tienen la forma de un ID de cuenta y de un token, sin ser ninguno de verdad
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT,
  checkCloudflareEnv,
  outputLines,
  reportLines,
  summaryLines,
} from './cloudflare-preflight.ts';

const FAKE_ACCOUNT = '0123456789abcdef0123456789abcdef';
const FAKE_TOKEN = 'token-de-prueba-que-no-sirve-en-ninguna-cuenta';
const complete = {
  CLOUDFLARE_API_TOKEN: FAKE_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT,
  PROJECT: 'studiare',
  SITE_URL: 'https://tudominio.mx',
  PRODUCTION: 'true',
};

describe('checkCloudflareEnv', () => {
  it('con todo completo está listo, publica en studiare y la humo de producción usa el dominio', () => {
    const result = checkCloudflareEnv(complete);
    expect(result).toEqual({
      ready: true,
      project: 'studiare',
      siteUrl: 'https://tudominio.mx',
      smokeMode: 'production',
      problems: [],
      notes: [],
    });
  });

  it('sin ningún dato dice qué secretos faltan por nombre y no está listo, sin lanzar nada', () => {
    const result = checkCloudflareEnv({});
    expect(result.ready).toBe(false);
    expect(result.problems).toEqual([
      'Falta el secreto CLOUDFLARE_API_TOKEN',
      'Falta el secreto CLOUDFLARE_ACCOUNT_ID',
    ]);
    // El proyecto cae al nombre de siempre y la prueba de humo es de vista previa
    expect(result.project).toBe(DEFAULT_PROJECT);
    expect(result.smokeMode).toBe('preview');
  });

  it('dice cuál falta cuando falta uno solo', () => {
    expect(checkCloudflareEnv({ ...complete, CLOUDFLARE_API_TOKEN: '' }).problems).toEqual([
      'Falta el secreto CLOUDFLARE_API_TOKEN',
    ]);
    expect(checkCloudflareEnv({ ...complete, CLOUDFLARE_ACCOUNT_ID: undefined }).problems).toEqual([
      'Falta el secreto CLOUDFLARE_ACCOUNT_ID',
    ]);
  });

  it('un ID de cuenta o un token con forma rara se señala sin repetir su valor', () => {
    const badAccount = checkCloudflareEnv({ ...complete, CLOUDFLARE_ACCOUNT_ID: 'mi-cuenta' });
    expect(badAccount.ready).toBe(false);
    expect(JSON.stringify(badAccount)).not.toContain('mi-cuenta');
    const badToken = checkCloudflareEnv({
      ...complete,
      CLOUDFLARE_API_TOKEN: 'abc def\nghi',
    });
    expect(badToken.ready).toBe(false);
    expect(JSON.stringify(badToken)).not.toContain('abc');
  });

  it('el nombre del proyecto se valida, y vacío es studiare', () => {
    expect(checkCloudflareEnv({ ...complete, PROJECT: '' }).project).toBe('studiare');
    expect(checkCloudflareEnv({ ...complete, PROJECT: 'mi-proyecto-2' }).project).toBe(
      'mi-proyecto-2',
    );
    for (const bad of [
      'Mayusculas',
      'con espacio',
      '-empieza',
      'termina-',
      'a;b',
      '$(id)',
      'x'.repeat(59),
      'a/b',
    ]) {
      const result = checkCloudflareEnv({ ...complete, PROJECT: bad });
      expect(result.ready, bad).toBe(false);
      expect(result.project, bad).toBe('');
      expect(result.problems.join(' '), bad).toContain('CLOUDFLARE_PAGES_PROJECT');
      expect(JSON.stringify(result), bad).not.toContain(bad);
    }
  });

  it('SITE_URL solo vale si es https y de producción; si no, se ignora con un aviso y no impide publicar', () => {
    for (const bad of [
      'tudominio.mx',
      'http://tudominio.mx',
      'http://127.0.0.1:4173',
      'https://tudominio.mx/?a=1',
    ]) {
      const result = checkCloudflareEnv({ ...complete, SITE_URL: bad });
      expect(result.ready, bad).toBe(true);
      expect(result.siteUrl, bad).toBe('');
      expect(result.smokeMode, bad).toBe('preview');
      expect(result.notes.join(' '), bad).toContain('SITE_URL');
    }
    expect(checkCloudflareEnv({ ...complete, SITE_URL: 'https://tudominio.mx/' }).siteUrl).toBe(
      'https://tudominio.mx',
    );
  });

  it('una vista previa nunca usa el modo de producción, aunque haya dirección', () => {
    const preview = checkCloudflareEnv({ ...complete, PRODUCTION: 'false' });
    expect(preview.smokeMode).toBe('preview');
    expect(preview.notes).toEqual([]);
    // Y la primera publicación de main, sin dominio todavía, avisa y prueba como vista previa
    const first = checkCloudflareEnv({ ...complete, SITE_URL: '' });
    expect(first.ready).toBe(true);
    expect(first.smokeMode).toBe('preview');
    expect(first.notes).toHaveLength(1);
  });
});

describe('lo que imprime y lo que deja como salida', () => {
  it('las salidas son líneas nombre=valor sin saltos escondidos', () => {
    expect(outputLines(checkCloudflareEnv(complete))).toEqual([
      'ready=true',
      'project=studiare',
      'site_url=https://tudominio.mx',
      'smoke_mode=production',
    ]);
    const hostile = checkCloudflareEnv({
      ...complete,
      PROJECT: 'x\nready=true',
      SITE_URL: 'https://tudominio.mx\nready=true',
    });
    expect(outputLines(hostile).every((line) => !line.includes('\n'))).toBe(true);
    expect(outputLines(hostile)).toEqual([
      'ready=false',
      'project=',
      'site_url=',
      'smoke_mode=preview',
    ]);
  });

  it('avisa con ::warning:: y nunca con ::error::, para que el flujo termine en verde', () => {
    const lines = reportLines(checkCloudflareEnv({}));
    expect(lines.filter((line) => line.startsWith('::warning'))).toHaveLength(2);
    expect(lines.join('\n')).not.toContain('::error');
    expect(lines.at(-1)).toContain('docs/PUBLICACION.md');
  });

  it('nunca imprime un secreto aunque lo haya', () => {
    const everything = [
      ...reportLines(checkCloudflareEnv(complete)),
      ...summaryLines(checkCloudflareEnv(complete)),
      ...outputLines(checkCloudflareEnv(complete)),
    ].join('\n');
    expect(everything).not.toContain(FAKE_TOKEN);
    expect(everything).not.toContain(FAKE_ACCOUNT);
    const missing = [
      ...reportLines(checkCloudflareEnv({ ...complete, CLOUDFLARE_API_TOKEN: '' })),
    ].join('\n');
    expect(missing).not.toContain(FAKE_ACCOUNT);
  });

  it('el resumen de GitHub solo aparece cuando falta algo', () => {
    expect(summaryLines(checkCloudflareEnv(complete))).toEqual([]);
    expect(summaryLines(checkCloudflareEnv({})).join('\n')).toContain('CLOUDFLARE_API_TOKEN');
  });
});

describe('como lo corre el flujo', () => {
  it('termina con 0 aunque falten los secretos, y escribe las salidas y el resumen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enarm-preflight-'));
    try {
      const output = join(dir, 'output');
      const summary = join(dir, 'summary');
      const run = spawnSync(process.execPath, ['scripts/deploy/cloudflare-preflight.ts'], {
        cwd: join(import.meta.dirname, '..', '..'),
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
      });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain(
        '::warning title=Cloudflare apagado::Falta el secreto CLOUDFLARE_API_TOKEN',
      );
      expect(readFileSync(output, 'utf8')).toBe(
        'ready=false\nproject=studiare\nsite_url=\nsmoke_mode=preview\n',
      );
      expect(readFileSync(summary, 'utf8')).toContain('listo pero apagado');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('con todo completo escribe ready=true y no imprime los secretos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'enarm-preflight-'));
    try {
      const output = join(dir, 'output');
      const run = spawnSync(process.execPath, ['scripts/deploy/cloudflare-preflight.ts'], {
        cwd: join(import.meta.dirname, '..', '..'),
        encoding: 'utf8',
        env: { PATH: process.env.PATH ?? '', GITHUB_OUTPUT: output, ...complete },
      });
      expect(run.status).toBe(0);
      expect(readFileSync(output, 'utf8')).toContain('ready=true\n');
      expect(run.stdout + run.stderr).not.toContain(FAKE_TOKEN);
      expect(run.stdout + run.stderr).not.toContain(FAKE_ACCOUNT);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
