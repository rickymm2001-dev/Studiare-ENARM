// Capturas de cierre de las Fases E y F (15.1 paso 2). Privacidad y borrado en Configuración, y las
// pantallas del médico 19, 20, 21 y 22. Teléfono y escritorio, en claro y oscuro. Las imágenes
// quedan en docs/screenshots/fase-e-f, en JPEG para no pesar de más.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { signUp } from '../e2e/support/fixtures';

const OUT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'screenshots', 'fase-e-f');
mkdirSync(OUT_DIR, { recursive: true });

async function capture(page: Page, name: string, projectName: string) {
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // La barra fija del teléfono sale a media imagen en una captura de página completa
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({
    path: join(OUT_DIR, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage: true,
  });
}

test('privacidad y borrado en Configuración', async ({ page }, info) => {
  test.setTimeout(120_000);
  await signUp(page);

  await page.goto(`${SCREENS.settings.path}?seccion=privacy`);
  await expect(page.getByRole('heading', { name: t.settings.privacy.consentsTitle })).toBeVisible();
  await page.getByLabel(t.settings.privacy.score, { exact: true }).fill('72.5');
  await page.getByRole('button', { name: t.settings.privacy.saveScore }).click();
  await expect(
    page.getByText(t.settings.privacy.current(new Date().getFullYear(), 72.5)),
  ).toBeVisible();
  await capture(page, 'configuracion-privacidad', info.project.name);

  await page.goto(`${SCREENS.settings.path}?seccion=account`);
  await expect(page.getByRole('heading', { name: t.settings.deleteTitle })).toBeVisible();
  await capture(page, 'configuracion-cuenta', info.project.name);
});

test('pantallas del médico', async ({ page }, info) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names.physician) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names.physician) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const screens = [
    ['acuerdo', SCREENS.agreement.path],
    ['reportes', SCREENS.contentReports.path],
    ['borradores', SCREENS.aiDrafts.path],
    ['importar', SCREENS.bankImport.path],
  ] as const;
  for (const [name, path] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await capture(page, `medico-${name}`, info.project.name);
  }
});
