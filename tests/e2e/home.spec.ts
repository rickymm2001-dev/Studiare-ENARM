// Inicio con el diseño fijo de Ricardo (D-116). Saludo, Tus repasos, Tus simuladores, el plan con su
// botón para mejorarlo, misiones, Party y el heatmap. Sin tablero que editar, sin desborde en el
// teléfono y sin violaciones de accesibilidad, en claro y en oscuro. En computadora, la barra blanca
// de arriba con el saludo y el nivel, el menú lateral que se oculta y el heatmap a todo el ancho
// (D-117).
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

test('en computadora el saludo va en la barra, el menú se oculta y el heatmap cabe completo', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'La barra y el riel son de computadora');
  await signUp(page, 'Ana');
  const title = page.getByRole('heading', { level: 1, name: t.home.welcome('Ana', null) });
  const titleBox = await title.boundingBox();
  // La barra mide 4rem, 64 px. El saludo y el nivel quedan dentro de ella
  expect(titleBox?.y ?? 999).toBeLessThan(64);
  const level = page.getByRole('button', { name: new RegExp(t.headerStats.openLevels) });
  expect((await level.boundingBox())?.y ?? 999).toBeLessThan(64);

  // El año entero cabe sin desplazarse y las celdas llenan el ancho de la tarjeta
  const heatmap = page.getByRole('region', { name: t.widgets.names.heatmap });
  await expect(heatmap.getByText('L', { exact: true })).toBeVisible();
  const fits = await heatmap
    .locator('.overflow-x-auto')
    .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(fits).toBe(true);

  // Las tres barras ocultan el riel, el contenido usa todo el ancho y se recuerda al volver
  const nav = page.getByRole('navigation', { name: t.nav.label });
  const toggle = page.getByRole('button', { name: t.nav.toggle });
  await expect(nav).toBeVisible();
  const before = (await heatmap.boundingBox())?.width ?? 0;
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  await expect.poll(async () => (await heatmap.boundingBox())?.width ?? 0).toBeGreaterThan(before);
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: t.home.reviewsTitle })).toBeVisible();
  await expect(page.getByRole('navigation', { name: t.nav.label })).toBeHidden();
  await page.getByRole('button', { name: t.nav.toggle }).click();
  await expect(page.getByRole('navigation', { name: t.nav.label })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
