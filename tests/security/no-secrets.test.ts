// Ningún secreto en el build del cliente (criterio de la Fase A, 14.3).
// Construye la app en una carpeta temporal y busca el nombre de la variable de la clave,
// el nombre prohibido, el prefijo sk-ant- y, si existe server/.env.local, el valor de la clave.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultNeedles, findSecrets } from '../../scripts/secrets.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
let buildDir = '';

beforeAll(() => {
  buildDir = mkdtempSync(join(tmpdir(), 'enarm-build-'));
  execFileSync(process.execPath, [VITE_BIN, 'build', '--outDir', buildDir, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'pipe',
  });
}, 180_000);

afterAll(() => {
  if (buildDir) rmSync(buildDir, { recursive: true, force: true });
});

describe('secretos en el build', () => {
  it('el build recién hecho no contiene secretos', () => {
    expect(existsSync(join(buildDir, 'index.html'))).toBe(true);
    expect(findSecrets(buildDir, defaultNeedles())).toEqual([]);
  });

  it('dist, si existe, tampoco contiene secretos', () => {
    const dist = join(ROOT, 'dist');
    if (!existsSync(dist)) return;
    expect(findSecrets(dist, defaultNeedles())).toEqual([]);
  });

  it('el escáner sí detecta un secreto plantado', () => {
    const planted = mkdtempSync(join(tmpdir(), 'enarm-planted-'));
    try {
      writeFileSync(join(planted, 'app.js'), 'const k = "sk-ant-' + 'falsa";');
      writeFileSync(join(planted, '.env.local'), 'X=1');
      const findings = findSecrets(planted, defaultNeedles());
      expect(findings.map((finding) => finding.needle)).toEqual(
        expect.arrayContaining(['prefijo de claves de Anthropic', 'archivo .env dentro del build']),
      );
    } finally {
      rmSync(planted, { recursive: true, force: true });
    }
  });
});
