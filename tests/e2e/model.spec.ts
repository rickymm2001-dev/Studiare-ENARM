// El modelo del alumno en la demostración (B14, 4.7, 8.4 y 10.38 del plan de B14). La demostración no tiene
// nube ni calibración nocturna: su comparación y su línea base salen de una cohorte de alumnos simulados que
// calcula el worker de simulación con los mismos motores de la noche, y por eso lleva la etiqueta Datos
// simulados. Recorre lo que lee el mismo modelo: la tarjeta Cómo vas frente a otros en Progreso, los temas
// para reforzar de Inicio, las opciones dirigidas de Simular y la fatiga del Tutor. Corre con los datos que
// genera Datos de demostración, que tardan un par de minutos.
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { modelTexts } from '@/i18n/model';
import { escapeRegExp, generateDemo } from './support/b1';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

/** Lo que estas secciones nunca dicen (5.5 del plan de B14) */
const FORBIDDEN =
  /puntaje (estimado|esperado|probable)|probabilidad|\bplazas?\b|ranking|lugar n[uú]mero|posici[oó]n n[uú]mero/i;

test('la demostración enseña la comparación y los temas del modelo con los otros alumnos simulados a la vista', async ({
  page,
}) => {
  test.setTimeout(480_000);
  await generateDemo(page);

  // Progreso. La cohorte simulada se calcula en el worker y tarda unos segundos
  await page.goto(SCREENS.progress.path);
  const comparison = page.getByRole('region', { name: modelTexts.comparison.title });
  await expect(comparison).toBeVisible({ timeout: 60_000 });
  await expect(comparison.getByText(modelTexts.comparison.loading)).toHaveCount(0, {
    timeout: 180_000,
  });
  // Los otros alumnos son simulados y la tarjeta lo dice con su etiqueta y con su frase
  await expect(comparison.getByText(t.labels.simulatedData).first()).toBeVisible();
  await expect(comparison.getByText(modelTexts.comparison.simulated)).toBeVisible();
  await expect(comparison.getByText(/^Calculado la noche del \d+ de [a-záéíóú]+$/)).toBeVisible();
  // Con 60 alumnos simulados el grupo Todos ya compara el total. Si el alumno de la demo no llega a lo que pide
  // una rama, esa rama le dice cuántas respuestas lleva
  await expect(
    comparison
      .getByText(/^(Percentil \d+|Por debajo del percentil 5|Por arriba del percentil 95)$/)
      .first(),
  ).toBeVisible();
  await expect(comparison.getByText(modelTexts.comparison.footer)).toBeVisible();
  expect(await comparison.innerText()).not.toMatch(FORBIDDEN);
  // La demostración no eligió especialidad, así que enlaza a Tus datos
  await expect(
    comparison.getByRole('link', { name: modelTexts.comparison.goToData }),
  ).toBeVisible();

  // La dificultad dice de dónde sale en cada grupo
  const difficulty = page.getByRole('region', { name: t.progress.difficultyTitle });
  await expect(
    difficulty.getByText(/^Dificultad (estimada|provisional|calibrada)/).first(),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Inicio. Temas para reforzar con su atajo y, si la población dice que le cuesta a la mayoría, con la
  // etiqueta de simulados. Nunca con la frase de alumnos de verdad
  await page.goto('/');
  const weak = page.getByRole('region', { name: t.home.topicsTitle });
  await expect(weak.getByRole('link', { name: /^Practicar / }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(modelTexts.reinforce.hard, { exact: true })).toHaveCount(0);
  await expect(page.getByText(modelTexts.bias.populationNote)).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // Simular. Las opciones dirigidas leen el modelo y dicen a qué trampas se dirigen
  await page.goto(SCREENS.simulatorSetup.path);
  const setup = page.getByRole('region', { name: t.simulator.setupTitle });
  const targeted = setup.getByRole('checkbox', { name: t.simulator.targeted.label });
  await expect(targeted).toBeVisible({ timeout: 60_000 });
  await expect(targeted).toHaveAccessibleDescription(/Sube las opciones con las trampas/);

  // Tutor. La fatiga dice en qué estado está el detector, que en la demostración se validó con alumnos simulados
  await page.goto(SCREENS.tutor.path);
  const fatigue = page.getByRole('region', { name: modelTexts.fatigue.title });
  await expect(fatigue).toBeVisible({ timeout: 60_000 });
  const states = [
    modelTexts.fatigue.validating,
    modelTexts.fatigue.notValidSimulated,
    modelTexts.fatigue.detected,
    modelTexts.fatigue.notDetected,
    modelTexts.fatigue.unit,
  ];
  await expect(
    fatigue.getByText(new RegExp(states.map(escapeRegExp).join('|'))).first(),
  ).toBeVisible();
  // Si la validación salió de la cohorte, lo dice con su etiqueta
  if ((await fatigue.getByText(modelTexts.fatigue.simulatedValidation).count()) > 0) {
    await expect(fatigue.getByText(t.labels.simulatedData)).toBeVisible();
  }
  expect(await fatigue.innerText()).not.toMatch(FORBIDDEN);
  await expectNoSeriousA11yViolations(page);
});
