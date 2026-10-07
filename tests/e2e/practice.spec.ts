// Práctica del simulador. Descarte de opciones (D-080) y flujo práctico (D-087). Por defecto la
// retroalimentación llega al final de la sesión y cada pregunta lleva a la siguiente, con teclado,
// doble clic y sin la pregunta de confianza. Quien lo prefiere la ve después de cada pregunta.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

/** Abre la configuración de la práctica y empieza una de cinco preguntas */
async function startPractice(page: Page, feedback?: 'end' | 'each') {
  await page.goto(SCREENS.simulatorSetup.path);
  const setup = page.getByRole('region', { name: t.simulator.setupTitle });
  await setup.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  if (feedback) {
    await setup.getByRole('combobox', { name: t.settings.practiceFeedback }).selectOption(feedback);
  }
  const start = setup.getByRole('button', { name: t.simulator.start });
  // El banco demo se siembra la primera vez que se entra y puede tardar
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible();
}

test('descartar opciones en la práctica, con la explicación de qué se podía descartar', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  // Quien quiere ver la retroalimentación después de cada pregunta lo elige en Simular
  await startPractice(page, 'each');
  await expectNoSeriousA11yViolations(page);

  // Elige A y descarta otras dos. Elegir una descartada la vuelve a incluir
  await page.getByRole('radio').first().check();
  // Descarta dos. Solo una puede ser la correcta, así que al menos una descartada es incorrecta
  await page.getByRole('button', { name: t.choice.discardOption('D') }).click();
  await page.getByRole('button', { name: t.choice.discardOption('C') }).click();
  await expect(page.getByRole('button', { name: t.choice.restoreOption('C') })).toBeVisible();
  // La elegida no se puede descartar
  await expect(page.getByRole('button', { name: t.choice.discardOption('A') })).toBeDisabled();
  // Sin pregunta de confianza, responder va directo
  await expect(page.getByRole('button', { name: t.simulator.confidence.sure })).toHaveCount(0);
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();

  // La retroalimentación dice qué se podía descartar y marca lo que descartó
  const review = page.getByRole('region', { name: t.simulator.discardReview.title });
  await expect(review).toBeVisible();
  await expect(review.getByText(t.simulator.discardReview.youDiscarded).first()).toBeVisible();
  await expect(review.getByRole('listitem').first()).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Enter sigue a la siguiente pregunta, que empieza sin descartes
  await page.keyboard.press('Enter');
  await expect(page.getByText(t.simulator.progress(2, 5), { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: t.choice.restoreOption('C') })).toHaveCount(0);

  // Sin descartar nada, la retroalimentación lo dice
  await page.getByRole('radio').first().check();
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: t.simulator.discardReview.title })
      .getByText(t.simulator.discardReview.noneDiscarded),
  ).toBeVisible();
});

test('la práctica se contesta con el teclado y la retroalimentación llega al final', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await startPractice(page);
  await expectNoSeriousA11yViolations(page);

  const answerButton = (last: boolean) =>
    page.getByRole('button', {
      name: last ? t.simulator.answerAndFinish : t.simulator.answerAndNext,
    });
  // Pregunta 1 solo con teclado. B elige la segunda opción y Enter responde
  await page.keyboard.press('b');
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  // Mayús con la letra descarta sin cambiar la elegida
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('button', { name: t.choice.restoreOption('D') })).toBeVisible();
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  await page.keyboard.press('Enter');
  // Sin pantalla de retroalimentación, la que sigue es la pregunta 2
  await expect(page.getByText(t.simulator.progress(2, 5), { exact: true })).toBeVisible();
  await expect(page.getByText(t.simulator.whyAttracts)).toHaveCount(0);
  // El foco queda en el enunciado, para seguir con el teclado y para el lector de pantalla
  await expect(page.locator('#pregunta-frase')).toBeFocused();

  // Pregunta 2 con doble clic en una opción, que la elige y responde
  await page.getByRole('radio').nth(2).dblclick();
  await expect(page.getByText(t.simulator.progress(3, 5), { exact: true })).toBeVisible();

  // Pregunta 3 con el número de la opción
  await page.keyboard.press('1');
  await expect(page.getByRole('radio').first()).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(page.getByText(t.simulator.progress(4, 5), { exact: true })).toBeVisible();

  // Pregunta 4 con ratón y la 5 con teclado. La última lleva al resumen
  await page.getByRole('radio').first().check();
  await answerButton(false).click();
  await expect(page.getByText(t.simulator.progress(5, 5), { exact: true })).toBeVisible();
  await page.keyboard.press('c');
  await expect(answerButton(true)).toBeEnabled();
  await page.keyboard.press('Enter');

  // El resumen trae la revisión de cada pregunta con su retroalimentación
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  const answers = page.getByRole('region', { name: t.simulator.review });
  await expect(answers.getByRole('listitem').first()).toBeVisible();
  const rows = answers.getByRole('listitem').filter({ has: page.locator('details') });
  await expect(rows).toHaveCount(5);
  // Se abre la primera, la que se contestó con el teclado, y muestra su explicación
  const first = rows.first();
  if ((await first.locator(':scope > details').getAttribute('open')) === null) {
    await first.locator('summary').click();
  }
  await expect(first.getByText(t.simulator.explanation)).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
