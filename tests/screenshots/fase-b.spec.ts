// Capturas de la Fase B. La única pantalla nueva era el panel de datos de demostración en Perfil.
// Desde B3 del plan del cambio vive en Datos de demostración del admin (5.4), así que las capturas
// toman esa pantalla y conservan sus nombres de la Fase B.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { adminText } from '@/i18n/admin';
import { t } from '@/i18n/es-MX';
import { escapeRegExp, switchDatabase } from '../e2e/support/b1';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-b');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  await page
    .getByText(t.ai.badge.checking)
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({ path: join(OUT_DIR, `${name}--${projectName}.png`), fullPage: true });
}

test('panel de datos de demostración, vacío y generado', async ({ page }, info) => {
  test.setTimeout(240_000);
  await switchDatabase(page, 'demo', { stayAsAdmin: true });
  await page.goto(SCREENS.demoData.path);
  const text = adminText.adminDemo;
  const panel = page.getByRole('region', { name: text.adjust.title });
  await panel.getByText(text.adjust.empty).waitFor();
  await capture(page, '01-perfil-demo-vacia', info.project.name);
  await panel.getByRole('button', { name: text.generate }).click();
  await panel
    .getByText(new RegExp(escapeRegExp(text.done.generate(0)).replace('0', '[\\d,]+')))
    .waitFor({ timeout: 200_000 });
  await capture(page, '02-perfil-demo-generada', info.project.name);
});
