// Corre la CLI de Playwright con los navegadores guardados dentro del proyecto
// (node_modules/playwright-core/.local-browsers) en lugar de la carpeta global del usuario.
// Así no se instala nada global (CLAUDE.md, Reglas). Ver DECISIONES.md D-033.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cli = require.resolve('@playwright/test/cli');

const env = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? '0',
};

const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => {
  process.exit(code ?? 1);
});
