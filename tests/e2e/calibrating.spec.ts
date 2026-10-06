// Estado calibrando (4.3). Con un alumno nuevo, cada análisis y cada widget que depende de datos dice
// que calibra y cuánto falta en lugar de mostrar cifras inventadas. Nada predice el puntaje del ENARM
import { SCREENS } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { INSIGHT_MINIMUMS } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const names = t.widgets.names;

test('un alumno nuevo ve calibrando con cuánto falta en cada análisis y widget', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);

  // Progreso. Los focos, las lecturas de Conócete, las ramas y la dificultad calibran
  await page.goto(SCREENS.progress.path);
  await expect(
    page.getByText(t.progress.focusCalibrating(0, INSIGHT_MINIMUMS.answers)),
  ).toBeVisible();
  const insights = page.getByRole('region', { name: t.insights.title });
  await expect(insights.getByText(/^Calibrando \d+\/\d+$/).first()).toBeVisible();
  expect(await insights.getByText(/^Calibrando \d+\/\d+$/).count()).toBeGreaterThan(5);
  // Una lectura abierta dice cuánto lleva y cuánto pide
  await insights
    .getByText(/^Calibrando \d+\/\d+$/)
    .first()
    .click();
  await expect(insights.getByText(/Llevas 0 de \d+ /).first()).toBeVisible();
  const branches = page.getByRole('region', { name: t.topicPicker.title });
  await expect(branches.getByText(t.insights.calibratingLabel, { exact: true })).toHaveCount(6);
  const difficulty = page.getByRole('region', { name: t.progress.difficultyTitle });
  await expect(difficulty.getByText(t.progress.difficultyCalibrating(20))).toHaveCount(3);
  await expect(
    page
      .getByRole('region', { name: t.progress.futureLoad.title })
      .getByText(t.progress.futureLoad.empty),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Tutor. Ninguna hipótesis, el informe y los consejos por sesgo calibran
  await page.goto(SCREENS.tutor.path);
  await expect(page.getByText(t.tutor.calibrating(0))).toBeVisible();
  await expect(
    page.getByRole('region', { name: t.tutor.report.title }).getByText(t.states.calibrating.title),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: t.tutor.biasTips.title })
      .getByText(t.tutor.biasTips.calibrating),
  ).toBeVisible();

  // Plan. Los minutos de estudio calibran hasta tener 3 días de estudio
  await page.goto(SCREENS.planner.path);
  await expect(
    page
      .getByRole('region', { name: t.planner.minutesTitle })
      .getByText(t.states.calibrating.remaining(3, t.planner.minutesUnit)),
  ).toBeVisible();

  // Inicio. Los cuatro widgets de análisis dicen cuánto falta
  await page.goto('/');
  await page.getByRole('button', { name: t.home.edit }).click();
  for (const type of ['weak_topics', 'bias_pattern', 'future_load', 'latest_hypothesis']) {
    await page.getByLabel(t.home.addLabel).selectOption(type);
    await page.getByRole('button', { name: t.home.add, exact: true }).click();
  }
  await page.getByRole('button', { name: t.home.doneEditing }).click();

  const weak = page.getByRole('region', { name: names.weak_topics });
  await expect(weak.getByText(t.states.calibrating.title)).toBeVisible({ timeout: 30_000 });
  await expect(weak.getByText(/Faltan \d+ respuestas en un tema/)).toBeVisible();
  const bias = page.getByRole('region', { name: names.bias_pattern });
  await expect(
    bias.getByText(
      t.states.calibrating.remaining(
        DEFAULT_THRESHOLDS.bias.minTaggedErrors,
        t.widgets.biasPattern.unit,
      ),
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: names.future_load }).getByText(t.widgets.futureLoad.empty),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: names.latest_hypothesis }).getByText(t.tutor.calibrating(0)),
  ).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});
