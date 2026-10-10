// Selector de rol sin login (pantalla 26) e interruptor de base real o demo (D-024).
import { HOME_BY_ROLE } from '@/app/navigation';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

/** La base activa vive en Configuración, en la sección Cuenta y datos (D-065, D-078) */
const ACCOUNT_SETTINGS = `${SCREENS.settings.path}?seccion=account`;

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
  await page.goto(ACCOUNT_SETTINGS);
  await expect(page.getByText(t.database.storedIn('enarm_real'))).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await expect(page.getByText(t.database.storedIn('enarm_demo'))).toBeVisible();

  for (const key of ['home', 'review', 'progress', 'tutor'] as const) {
    await page.goto(SCREENS[key].path);
    const banner = page.getByRole('region', { name: t.labels.simulatedData, exact: true });
    await expect(banner).toContainText(t.labels.simulatedData);
    await expect(banner).toContainText(t.database.banner);
  }
  await expectNoSeriousA11yViolations(page);

  await page.getByRole('button', { name: t.database.backToReal }).click();
  await expect(page.getByRole('region', { name: t.labels.simulatedData, exact: true })).toHaveCount(
    0,
  );
  await page.goto(ACCOUNT_SETTINGS);
  await expect(page.getByText(t.database.storedIn('enarm_real'))).toBeVisible();
});

test('las dos bases existen por separado en IndexedDB', async ({ page }) => {
  await page.goto(ACCOUNT_SETTINGS);
  await expect(page.getByText(t.database.users(0))).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(t.database.demo) }).click();
  await expect(page.getByText(t.database.storedIn('enarm_demo'))).toBeVisible();
  await expect(page.getByText(t.database.users(0))).toBeVisible();
  const names = await page.evaluate(async () =>
    (await indexedDB.databases()).map((database) => database.name).sort(),
  );
  expect(names).toEqual(['enarm_demo', 'enarm_real']);
});
