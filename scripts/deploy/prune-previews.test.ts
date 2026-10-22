// El script que limpia vistas previas viejas de Cloudflare Pages (B17, 1.5). Se corre con un npx falso que contesta
// la lista y anota cada borrado, así que no toca Cloudflare. Lo importante: no borra nada si no se le pide, nunca
// toca producción y no usa nada de afuera dentro de un comando
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = join(import.meta.dirname, 'prune-previews.sh');
const id = (n: number) =>
  `${String(n).padStart(8, '0')}-aaaa-bbbb-cccc-${String(n).padStart(12, '0')}`;
const preview = (n: number, branch = `rama-${String(n)}`) => ({
  Id: id(n),
  Environment: 'Preview',
  Branch: branch,
  Source: 'abc1234',
  Deployment: `https://x${String(n)}.studiare.pages.dev`,
  Status: '3 days ago',
});

let dir = '';
let bin = '';
let log = '';
let listFile = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'enarm-prune-'));
  bin = join(dir, 'bin');
  mkdirSync(bin);
  log = join(dir, 'calls.log');
  listFile = join(dir, 'lista.json');
  // npx falso. Anota los argumentos y contesta la lista cuando se la piden. FAKE_FAIL_DELETE hace fallar un borrado
  writeFileSync(
    join(bin, 'npx'),
    [
      '#!/usr/bin/env bash',
      'printf "%s\\n" "$*" >> "$FAKE_LOG"',
      'case "$*" in',
      '  *"deployment list"*)',
      '    if [ "${FAKE_FAIL_LIST:-}" = 1 ]; then exit 1; fi',
      '    cat "$FAKE_LIST" ;;',
      '  *"deployment delete"*)',
      '    if [ -n "${FAKE_FAIL_DELETE:-}" ] && [[ "$*" == *"$FAKE_FAIL_DELETE"* ]]; then exit 1; fi ;;',
      'esac',
      '',
    ].join('\n'),
  );
  chmodSync(join(bin, 'npx'), 0o755);
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
beforeEach(() => {
  writeFileSync(log, '');
});

function run(args: string[], env: Record<string, string> = {}, rows: unknown = []) {
  writeFileSync(listFile, typeof rows === 'string' ? rows : JSON.stringify(rows));
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
      CLOUDFLARE_API_TOKEN: 'token-falso',
      CLOUDFLARE_ACCOUNT_ID: '0123456789abcdef0123456789abcdef',
      FAKE_LOG: log,
      FAKE_LIST: listFile,
      ...env,
    },
  });
  const calls = readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '');
  return { ...result, calls, deletes: calls.filter((call) => call.includes('deployment delete')) };
}

const twelve = Array.from({ length: 12 }, (_, index) => preview(index + 1));

describe('prune-previews.sh', () => {
  it('por omisión solo muestra qué borraría y no borra nada', () => {
    const result = run([], {}, twelve);
    expect(result.status, result.stderr).toBe(0);
    expect(result.deletes).toEqual([]);
    expect(result.stdout).toContain(
      'Borraría 2 vistas previas viejas de studiare (se conservan las 10 más nuevas).',
    );
    expect(result.stdout).toContain(id(11));
    expect(result.stdout).toContain(id(12));
    expect(result.stdout).not.toContain(id(10));
    expect(result.stdout).toContain('No se borró nada');
  });

  it('con --apply borra solo las que pasan de las más nuevas, con --force y el proyecto', () => {
    const result = run(['--apply'], {}, twelve);
    expect(result.status, result.stderr).toBe(0);
    expect(result.deletes).toEqual([
      `--yes wrangler@4.146.0 pages deployment delete ${id(11)} --project-name studiare --force`,
      `--yes wrangler@4.146.0 pages deployment delete ${id(12)} --project-name studiare --force`,
    ]);
    expect(result.stdout).toContain('Listo. Borradas 2 de 2, con 0 fallas.');
  });

  it('la lista se pide solo del ambiente preview y con el proyecto de la variable', () => {
    const result = run(['--keep', '11'], { CLOUDFLARE_PAGES_PROJECT: 'mi-proyecto' }, twelve);
    expect(result.status, result.stderr).toBe(0);
    expect(result.calls[0]).toBe(
      '--yes wrangler@4.146.0 pages deployment list --project-name mi-proyecto --environment preview --json',
    );
    expect(result.stdout).toContain('Borraría 1 vistas previas');
  });

  it('con pocas vistas previas no hay nada que borrar', () => {
    const result = run(['--apply'], {}, twelve.slice(0, 3));
    expect(result.status).toBe(0);
    expect(result.deletes).toEqual([]);
    expect(result.stdout).toContain('No hay vistas previas de sobra');
  });

  it('--keep 0 propone todas y --keep acepta el valor con otro orden de opciones', () => {
    const result = run(['--apply', '--keep', '0'], {}, twelve.slice(0, 2));
    expect(result.deletes).toHaveLength(2);
  });

  it('nunca borra un despliegue de producción, aunque venga en la lista', () => {
    const rows = [
      preview(1),
      { ...preview(2), Environment: 'Production', Branch: 'main' },
      { ...preview(3), Environment: 'production' },
      preview(4),
    ];
    const result = run(['--apply', '--keep', '1'], {}, rows);
    expect(result.deletes).toEqual([
      `--yes wrangler@4.146.0 pages deployment delete ${id(4)} --project-name studiare --force`,
    ]);
  });

  it('descarta un ID que no es un UUID y limpia la rama antes de imprimirla', () => {
    const rows = [
      preview(1),
      { ...preview(2), Id: '$(touch pwned)' },
      { ...preview(3), Id: 'abc; rm -rf' },
      { ...preview(4), Branch: 'rama;\nmala `id`' },
    ];
    const result = run(['--keep', '1'], {}, rows);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(id(4));
    expect(result.stdout).not.toContain('touch pwned');
    expect(result.stdout).not.toContain('rm -rf');
    expect(result.stdout).not.toContain('`id`');
  });

  it('si un borrado falla sigue con los demás, lo dice y termina con 1', () => {
    const result = run(['--apply', '--keep', '0'], { FAKE_FAIL_DELETE: id(1) }, twelve.slice(0, 3));
    expect(result.deletes).toHaveLength(3);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`No se pudo borrar ${id(1)}`);
    expect(result.stdout).toContain('Borradas 2 de 3, con 1 fallas.');
  });

  it('si no puede leer la lista, o no tiene el formato, sale con 1 sin borrar nada', () => {
    const noList = run(['--apply'], { FAKE_FAIL_LIST: '1' }, twelve);
    expect(noList.status).toBe(1);
    expect(noList.deletes).toEqual([]);
    expect(noList.stderr).toContain('No se pudo leer la lista');
    const notJson = run(['--apply'], {}, 'esto no es json');
    expect(notJson.status).toBe(1);
    expect(notJson.deletes).toEqual([]);
    const notArray = run(['--apply'], {}, '{"a":1}');
    expect(notArray.status).toBe(1);
    expect(notArray.stderr).toContain('no tiene el formato esperado');
  });

  it('sin credenciales dice cuál falta por nombre, sin llamar a Cloudflare y sin imprimir valores', () => {
    const result = run([], { CLOUDFLARE_API_TOKEN: '' }, twelve);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Falta la variable de entorno CLOUDFLARE_API_TOKEN');
    expect(result.stderr).not.toContain('CLOUDFLARE_ACCOUNT_ID');
    expect(result.calls).toEqual([]);
  });

  it('rechaza opciones raras, un --keep que no es número y un nombre de proyecto raro', () => {
    for (const [args, env] of [
      [['--borrar-todo'], {}],
      [['--keep'], {}],
      [['--keep', 'diez'], {}],
      [['--keep', '-1'], {}],
      [['--keep', '1; echo hola'], {}],
      [[], { CLOUDFLARE_PAGES_PROJECT: 'Mi Proyecto; ls' }],
    ] as [string[], Record<string, string>][]) {
      const result = run(args, env, twelve);
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.calls, args.join(' ')).toEqual([]);
      expect(result.stdout).not.toContain('hola');
    }
  });
});
