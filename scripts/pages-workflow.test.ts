// El workflow de GitHub Pages pasa al build las variables que PENDIENTES_DE_RICARDO.md le pide a Ricardo poner
// (B15, pasos B15.4, B15.9 y B15.11). Sin esto, seguir los pasos no prendía nada: el build nunca las leía.
// Se lee el texto del workflow, sin interpretarlo, y se revisa que cada variable llegue de donde debe.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
