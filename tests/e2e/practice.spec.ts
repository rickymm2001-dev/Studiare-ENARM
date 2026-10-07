// Práctica con descarte (D-080). El alumno tacha opciones antes de responder, queda guardado en su
// respuesta y la retroalimentación explica qué se podía descartar y qué descartó.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test('descartar opciones en la práctica, con la explicación de qué se podía descartar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await page.goto(SCREENS.simulatorSetup.path);
  const setup = page.getByRole('region', { name: t.simulator.setupTitle });
  await setup.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  const start = setup.getByRole('button', { name: t.simulator.start });
  // El banco demo se siembra la primera vez que se entra y puede tardar
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Elige A y descarta otras dos. Elegir una descartada la vuelve a incluir
  await page.getByRole('radio').first().check();
  // Descarta dos. Solo una puede ser la correcta, así que al menos una descartada es incorrecta
  await page.getByRole('button', { name: t.choice.discardOption('D') }).click();
  await page.getByRole('button', { name: t.choice.discardOption('C') }).click();
  await expect(page.getByRole('button', { name: t.choice.restoreOption('C') })).toBeVisible();
  // La elegida no se puede descartar
  await expect(page.getByRole('button', { name: t.choice.discardOption('A') })).toBeDisabled();
  await page.getByRole('button', { name: t.simulator.confidence.sure }).click();
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();

  // La retroalimentación dice qué se podía descartar y marca lo que descartó
  const review = page.getByRole('region', { name: t.simulator.discardReview.title });
  await expect(review).toBeVisible();
  await expect(review.getByText(t.simulator.discardReview.youDiscarded).first()).toBeVisible();
  await expect(review.getByRole('listitem').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // La siguiente pregunta empieza sin descartes
  await page.getByRole('button', { name: t.simulator.next }).click();
  await expect(page.getByText(t.simulator.progress(2, 5), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: t.choice.restoreOption('C') })).toHaveCount(0);

  // Sin descartar nada, la retroalimentación lo dice
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.simulator.confidence.unsure }).click();
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: t.simulator.discardReview.title })
      .getByText(t.simulator.discardReview.noneDiscarded),
  ).toBeVisible();
});
