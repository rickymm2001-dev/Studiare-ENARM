// Flujo 1 de 14.1. Onboarding completo, de la portada a una cuenta con sesión abierta, y de vuelta
// a entrar con el correo. Sin Supabase la cuenta vive solo en este navegador (D-060)
import { SCREENS } from '@/app/screens';
import { ENARM_EXAM } from '@/config/exam';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

/** El año del ENARM que ya tiene la plataforma, el mismo que dice el panel marino (D-150) */
const examYear = new Date(`${ENARM_EXAM.date}T12:00:00`).getFullYear();

test('de la portada a una cuenta con sesión, con validación, y vuelve a entrar con el correo', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await page.getByRole('link', { name: t.landing.cta }).first().click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.onboarding.path}$`));
  // El h1 vive en el panel marino, en dos líneas con el año del ENARM. Crear cuenta es la pestaña
  // abierta y el formulario va al lado (D-150)
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).toContainText(t.onboarding.panel.titleLead);
  await expect(title).toContainText(t.onboarding.panel.titleExam(examYear));
  await expect(page.getByRole('tab', { name: t.onboarding.createTab })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    page.getByRole('heading', { level: 2, name: t.onboarding.createTitle }),
  ).toBeVisible();
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
  await page.getByLabel(t.accounts.signup.adultAccept(18)).check();
  await page.getByLabel(t.onboarding.privacyAccept).check();
  await page.getByRole('button', { name: t.onboarding.create }).click();

  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
  const goal = page.getByRole('region', { name: t.widgets.names.daily_goal });
  await expect(goal).toContainText(t.widgets.goal.ratio(0, 12));
  await expect(goal).toContainText(t.widgets.goal.metricNames.questions);
  await expectNoSeriousA11yViolations(page);

  // La sesión se recuerda al recargar
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();

  // Cerrar sesión lleva a la portada, y con el correo se vuelve a entrar al mismo perfil. La sesión
  // se cierra en Configuración, donde vive el Perfil desde B3
  await page.goto(SCREENS.settings.path);
  await page.getByRole('button', { name: t.session.signOut }).click();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
  await page.goto(SCREENS.onboarding.path);
  // Entra aquí, debajo del formulario, abre Ya tengo cuenta y el panel cambia a Sigue donde te quedaste
  await page.getByRole('button', { name: t.onboarding.enterHere }).click();
  await expect(page.getByRole('tab', { name: t.onboarding.loginTab })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    t.onboarding.loginPanel.titleTail,
  );
  await page.getByLabel(t.account.email, { exact: true }).fill('ana@ejemplo.mx');
  await page.getByRole('button', { name: t.onboarding.signIn }).click();
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
});
