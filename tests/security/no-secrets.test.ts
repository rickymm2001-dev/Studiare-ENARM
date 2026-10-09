// Ningún secreto en el build del cliente (criterio de la Fase A, 14.3).
// Construye la app en una carpeta temporal y busca el nombre de la variable de la clave,
// el nombre prohibido, el prefijo sk-ant- y, si existe server/.env.local, el valor de la clave.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultNeedles, findSecrets, findServiceKeys } from '../../scripts/secrets.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
let buildDir = '';

beforeAll(() => {
  buildDir = mkdtempSync(join(tmpdir(), 'enarm-build-'));
  // Vitest corre con NODE_ENV=test, que armaría un build de desarrollo más grande que el que se
  // publica y pasaría el límite de tamaño de lo que el service worker guarda. Se construye como
  // producción, que es lo que interesa revisar
  execFileSync(process.execPath, [VITE_BIN, 'build', '--outDir', buildDir, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production' },
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

  // Recorre todo dist, que pesa decenas de megas, y con la suite completa en paralelo pasa de 5 s
  it('dist, si existe, tampoco contiene secretos', { timeout: 60_000 }, () => {
    const dist = join(ROOT, 'dist');
    if (!existsSync(dist)) return;
    expect(findSecrets(dist, defaultNeedles())).toEqual([]);
  });

  it('el escáner detecta llaves de servicio de Supabase y deja pasar la pública', () => {
    const jwt = (role: string) =>
      [
        Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
        Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url'),
        'firma-de-prueba-0123456789',
      ].join('.');
    expect(findServiceKeys(`const k="${jwt('service_role')}";`)).toEqual([
      'llave JWT con rol service_role',
    ]);
    expect(findServiceKeys(`const k="sb_secret_${'a'.repeat(24)}";`)).toEqual([
      'llave secreta de Supabase (sb_secret_)',
    ]);
    // La llave pública anterior es un JWT con rol anon y puede ir en el build. El texto del guardia
    // del cliente, que solo nombra el prefijo, tampoco cuenta
    expect(findServiceKeys(`const k="${jwt('anon')}";`)).toEqual([]);
    expect(findServiceKeys("if (key.startsWith('sb_secret_')) return null;")).toEqual([]);

    const planted = mkdtempSync(join(tmpdir(), 'enarm-service-'));
    try {
      writeFileSync(join(planted, 'app.js'), `const k = "${jwt('service_role')}";`);
      expect(findSecrets(planted, defaultNeedles()).map((finding) => finding.needle)).toEqual([
        'llave JWT con rol service_role',
      ]);
    } finally {
      rmSync(planted, { recursive: true, force: true });
    }
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
