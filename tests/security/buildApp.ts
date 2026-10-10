// Construye la app como producción en una carpeta temporal, para las pruebas que revisan el build.
// Vitest corre con NODE_ENV=test, que armaría un build de desarrollo más grande que el que se
// publica y pasaría el límite de tamaño de lo que el service worker guarda. Se construye como
// producción, que es lo que interesa revisar.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ROOT = join(import.meta.dirname, '..', '..');
const VITE_BIN = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

export function buildApp(env: Record<string, string> = {}): string {
  const outDir = mkdtempSync(join(tmpdir(), 'enarm-build-'));
  execFileSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'production', ...env },
  });
  return outDir;
}
