// Flujo 1 de 14.1. Onboarding completo, de la portada a una cuenta con sesión abierta, y de vuelta
// a entrar con el correo. Sin Supabase la cuenta vive solo en este navegador (D-060)
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

test('de la portada a una cuenta con sesión, con validación, y vuelve a entrar con el correo', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await page.getByRole('link', { name: t.landing.cta }).first().click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.onboarding.path}$`));
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.onboarding.title);
  await expectNoSeriousA11yViolations(page);

  // Sin llenar nada el formulario explica qué falta, y no crea la cuenta
  await page.getByRole('button', { name: t.onboarding.create }).click();
  await expect(page.getByText(t.onboarding.aliasError)).toBeVisible();
  await expect(page.getByText(t.account.emailError)).toBeVisible();
  await expect(page.getByText(t.onboarding.privacyError)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.onboarding.path}$`));

  // Con todo lleno entra a Inicio con la meta diaria que eligió
  await page.getByLabel(t.onboarding.alias, { exact: true }).fill('Ana');
  await page.getByLabel(t.account.email, { exact: true }).fill('ana@ejemplo.mx');
  await page.getByLabel(t.onboarding.goalMetric).selectOption('questions');
  await page.getByLabel(t.onboarding.goalValue).fill('12');
  await page.getByLabel(t.onboarding.privacyAccept).check();
  await page.getByRole('button', { name: t.onboarding.create }).click();

  await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();
  const goal = page.getByRole('region', { name: t.widgets.names.daily_goal });
  await expect(goal).toContainText(t.widgets.goal.ratio(0, 12));
  await expect(goal).toContainText(t.widgets.goal.metricNames.questions);
  await expectNoSeriousA11yViolations(page);

  // La sesión se recuerda al recargar
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();

  // Cerrar sesión lleva a la portada, y con el correo se vuelve a entrar al mismo perfil
  await page.goto(SCREENS.profile.path);
  await page.getByRole('button', { name: t.session.signOut }).click();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await page.goto(SCREENS.onboarding.path);
  await page.getByRole('tab', { name: t.onboarding.loginTab }).click();
  await page.getByLabel(t.account.email, { exact: true }).fill('ana@ejemplo.mx');
  await page.getByRole('button', { name: t.onboarding.signIn }).click();
  await expect(page.getByRole('heading', { level: 1, name: t.screens.home.title })).toBeVisible();
});
