// Capturas de cierre de B3 del plan del cambio (navegación, Configuración y Perfil, D-122). La barra
// del teléfono con Más, el menú lateral, Configuración en una sola página con Editar perfil, el panel
// de ajustes del repaso, Progreso con la semana del plan, Apuntes en el menú y Datos de demostración
// del admin, en docs/screenshots/v3/b3. El recorrido completo va en teléfono claro y computadora clara
// y oscura, y las pantallas clave además en 1920 y en el teléfono oscuro, como en b2.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterAs, generateDemo } from '../../e2e/support/b1';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('b3');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

/** Abre una ruta, espera su título y captura. Un retraso en una región opcional no detiene el resto */
async function shot(page: Page, project: string, name: string, path: string, settle?: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  if (settle) {
    await page
      .getByRole('region', { name: settle })
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
  }
  await capture(page, OUT_DIR, name, project);
}

/** Abre Más en la barra del teléfono y captura la hoja con el resto de las secciones */
async function shotMore(page: Page, project: string, name: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page
    .getByRole('navigation', { name: t.nav.label })
    .getByRole('button', { name: t.navItems.more })
    .click();
  await expect(page.getByRole('dialog', { name: t.nav.more })).toBeVisible();
  await page.screenshot({ path: `${OUT_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
  await page.keyboard.press('Escape');
}

test('navegación, Configuración y Progreso de B3', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(900_000);
  const project = info.project.name;

  // Configuración sin sesión, antes de crear la demostración
  await shot(page, project, '01-configuracion-sin-sesion', SCREENS.settings.path);

  await generateDemo(page);
  await shot(page, project, '02-inicio', '/', t.home.topicsTitle);
  if (project.startsWith('390')) await shotMore(page, project, '03-mas');
  await shot(page, project, '04-configuracion', SCREENS.settings.path);
  await page.getByRole('button', { name: t.settingsPage.profile.edit }).click();
  await capture(page, OUT_DIR, '05-editar-perfil', project);
  await page.getByRole('button', { name: t.settingsPage.profile.cancel }).click();

  await page.goto(`${SCREENS.review.path}?ajustes=1`);
  await expect(page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title })).toBeVisible(
    { timeout: 60_000 },
  );
  await page.screenshot({
    path: `${OUT_DIR}/06-ajustes-del-repaso--${project}.jpg`,
    type: 'jpeg',
    quality: 60,
  });
  await page.goto(`${SCREENS.review.path}?ajustes=pomodoro`);
  await expect(page.getByRole('dialog', { name: t.settingsPage.reviewSettings.title })).toBeVisible(
    { timeout: 60_000 },
  );
  await page.screenshot({
    path: `${OUT_DIR}/07-ajustes-pomodoro--${project}.jpg`,
    type: 'jpeg',
    quality: 60,
  });

  await shot(page, project, '08-progreso', SCREENS.progress.path, t.progress.futureLoad.title);
  await shot(page, project, '09-apuntes', SCREENS.outlines.path);
  await shot(page, project, '10-repasar', SCREENS.review.path);

  // Admin con Datos de demostración en su menú
  await enterAs(page, 'admin');
  await shot(page, project, '11-admin-usuarios', SCREENS.adminUsers.path);
  await shot(page, project, '12-admin-demo', SCREENS.demoData.path);
});

test('pantallas clave de B3 en 1920 y en el teléfono oscuro', async ({ page }, info) => {
  test.skip(FULL_WALK(info.project.name), 'El recorrido completo ya cubre este proyecto');
  test.setTimeout(600_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, project, '02-inicio', '/', t.home.topicsTitle);
  if (project.startsWith('390')) await shotMore(page, project, '03-mas');
  await shot(page, project, '04-configuracion', SCREENS.settings.path);
  await shot(page, project, '08-progreso', SCREENS.progress.path, t.progress.futureLoad.title);
});
