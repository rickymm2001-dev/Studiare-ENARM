// Inicio con el diseño de Ricardo (D-116, D-150). Saludo, Tus repasos, Tus simuladores, el plan con su
// botón para mejorarlo, misiones, Party, indicadores, tarjetas por rama, preguntas por día y el heatmap.
// Sin tablero que editar, sin desborde en el teléfono y sin violaciones de accesibilidad, en claro y
// en oscuro. En computadora, la barra pizarra de arriba con el nivel y el menú en línea, el título en
// el contenido y el heatmap a todo el ancho.
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
    t.home.cards.title,
    t.home.goal.title,
    t.home.pulse.title,
    t.home.topicsTitle,
    t.home.plan.title,
    t.widgets.names.missions,
    t.widgets.names.party_challenge,
    t.home.yearTitle,
  ]) {
    await expect(page.getByRole('region', { name })).toBeVisible();
  }
  await expect(page.getByRole('heading', { level: 3, name: t.home.load.title })).toBeVisible();
  // Las misiones de hoy siguen en Inicio con su avance aunque Logros se quitó (4.12, B3)
  await expect(
    page.getByRole('region', { name: t.widgets.names.missions }).getByRole('progressbar').first(),
  ).toBeVisible();
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

test('en computadora el nivel va en la barra, el saludo en el contenido y el heatmap cabe completo', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'La barra en línea es de computadora');
  await signUp(page, 'Ana');
  const title = page.getByRole('heading', { level: 1, name: t.home.welcome('Ana', null) });
  const titleBox = await title.boundingBox();
  // La barra mide 4rem, 64 px. El nivel queda dentro de ella y el saludo debajo, en el contenido (D-150)
  expect(titleBox?.y ?? 0).toBeGreaterThanOrEqual(64);
  const level = page.getByRole('button', { name: new RegExp(t.headerStats.openLevels) });
  expect((await level.boundingBox())?.y ?? 999).toBeLessThan(64);

  // El año entero cabe sin desplazarse y las celdas llenan el ancho de la tarjeta
  const heatmap = page.getByRole('region', { name: t.home.yearTitle });
  await expect(heatmap.getByText('L', { exact: true })).toBeVisible();
  const fits = await heatmap
    .locator('.overflow-x-auto')
    .evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(fits).toBe(true);

  // El menú va en línea en la barra pizarra de arriba (D-150)
  await expect(page.getByRole('navigation', { name: t.nav.label }).first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
