// Selector de rol sin login (pantalla 26) e interruptor de base real o demo (D-024).
import { HOME_BY_ROLE } from '@/app/navigation';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { enterAs } from './support/b1';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

test('elegir Médico lleva al banco con la navegación del médico y se recuerda', async ({
  page,
}) => {
  await page.goto(SCREENS.roleSelector.path);
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('radio', { name: new RegExp(t.roles.names.physician) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names.physician) }).click();

  await expect(page).toHaveURL(new RegExp(`${HOME_BY_ROLE.physician}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.questionBank.title);
  const nav = page.getByRole('navigation', { name: t.nav.label });
  await expect(nav.getByRole('link', { name: t.navItems.agreement })).toBeVisible();
  await expect(nav.getByRole('link', { name: t.navItems.review })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.questionBank.title);
});

test('el alumno no entra al área de admin', async ({ page }) => {
  await page.goto(SCREENS.aiCosts.path);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.access.adminTitle);
  await expect(page.getByText(t.access.description)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('Demostración marca Datos simulados en toda pantalla y se puede volver', async ({ page }) => {
  // La base activa vive en Datos de demostración del admin (B3 del plan del cambio, 5.4)
  await enterAs(page, 'admin');
  await page.goto(SCREENS.demoData.path);
  await expect(page.getByText(t.database.storedIn('enarm_real'))).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await expect(page.getByText(t.database.storedIn('enarm_demo'))).toBeVisible();
  // Lo demás se recorre como alumno
  await enterAs(page, 'student');

  for (const key of ['home', 'review', 'progress', 'tutor'] as const) {
    await page.goto(SCREENS[key].path);
    const banner = page.getByRole('region', { name: t.labels.simulatedData, exact: true });
    await expect(banner).toContainText(t.labels.simulatedData);
    await expect(banner).toContainText(t.database.banner);
  }
  await expectNoSeriousA11yViolations(page);

  // La demostración sigue vacía, así que el alumno ve el aviso que lo regresa a Mi cuenta y no uno que
  // lo mande a Datos de demostración, que no puede abrir
  const empty = page.getByRole('region', { name: t.session.demoEmptyTitle });
  await expect(empty.getByRole('link', { name: t.settingsPage.demoEmpty.link })).toHaveCount(0);
  await expect(empty.getByRole('button', { name: t.database.backToReal })).toBeVisible();
  // Se vuelve desde la franja de arriba
  await page
    .getByRole('region', { name: t.labels.simulatedData, exact: true })
    .getByRole('button', { name: t.database.backToReal })
    .click();
  await expect(page.getByRole('region', { name: t.labels.simulatedData, exact: true })).toHaveCount(
    0,
  );
  await enterAs(page, 'admin');
  await page.goto(SCREENS.demoData.path);
  await expect(page.getByText(t.database.storedIn('enarm_real'))).toBeVisible();
});

test('las dos bases existen por separado en IndexedDB', async ({ page }) => {
  await enterAs(page, 'admin');
  await page.goto(SCREENS.demoData.path);
  await expect(page.getByText(t.database.users(0))).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await expect(page.getByText(t.database.storedIn('enarm_demo'))).toBeVisible();
  await expect(page.getByText(t.database.users(0))).toBeVisible();
  // Dexie crea la base de demostración al abrirla por primera vez, un momento después del cambio, y
  // el conteo de usuarios ya decía 0 con la base real, así que se espera a que exista
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await indexedDB.databases()).map((database) => database.name).sort(),
      ),
    )
    .toEqual(['enarm_demo', 'enarm_real']);
});
