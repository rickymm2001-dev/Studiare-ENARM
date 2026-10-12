// Inicio con el diseño fijo de Ricardo (D-116). Saludo, Tus repasos, Tus simuladores, el plan con su
// botón para mejorarlo, misiones, Party y el heatmap. Sin tablero que editar, sin desborde en el
// teléfono y sin violaciones de accesibilidad, en claro y en oscuro.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  expect,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

test('Inicio muestra cada parte del diseño y el plan lleva a Suscripción', async ({ page }) => {
  await signUp(page, 'Ana');
  await expect(
    page.getByRole('heading', { level: 1, name: t.home.welcome('Ana', null) }),
  ).toBeVisible();
  await expect(page).toHaveTitle(t.app.documentTitle(t.screens.home.title));
  await expect(page.getByRole('heading', { level: 2, name: t.home.simulatorsTitle })).toBeVisible();
  for (const name of [
    t.widgets.names.daily_goal,
    t.home.dueTitle,
    t.home.load.title,
    t.home.topicsTitle,
    t.home.plan.title,
    t.widgets.names.missions,
    t.widgets.names.party_challenge,
    t.widgets.names.heatmap,
  ]) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Editar tablero' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // El plan actual está a la vista y su botón abre Suscripción en un toque
  const plan = page.getByRole('region', { name: t.home.plan.title });
  await expect(plan.getByText(t.billing.plans.free)).toBeVisible();
  await plan.getByRole('link', { name: t.home.plan.upgrade }).click();
  await expect(page).toHaveURL(new RegExp(`${SCREENS.subscription.path}$`));
});

test('Inicio en modo oscuro pasa la revisión de accesibilidad', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await signUp(page);
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
