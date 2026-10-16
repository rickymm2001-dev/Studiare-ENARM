// Modo adaptativo de Simular (B14, 4.5 y 8.4 del plan de B14, respuesta 89). Con pocas preguntas de dificultad
// calculada con las respuestas de otros alumnos dice calibrando y cuántas hay, y las preguntas salen como
// siempre. Con suficientes, la práctica elige cerca del nivel del alumno y no cambia el tope del plan Gratis,
// que lo cuenta el servidor. Corre contra el Supabase simulado con el banco de tests/e2e/support/fakeBank.ts
// y la calibración de tests/e2e/support/fakeModel.ts. Todo el texto y toda la calibración son simulados.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { adaptiveTexts } from '@/i18n/adaptive';
import { t } from '@/i18n/es-MX';
import { readTable } from '../support/b1';
import { enterWithLink, expect, reloadWithServerFlags, test } from '../support/cloudFixtures';
import { openBank, seedBank } from '../support/fakeBank';
import { createFakeBankStore } from '../support/fakeBankStore';
import { createFakeModelStore, seedCalibration } from '../support/fakeModelStore';
import { attachBank, attachModel, type FakeSupabaseServer } from '../support/fakeSupabase';
import { answerPracticeQuestion, expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana.adaptativo@ejemplo.mx';
/** El plan Gratis abre 20 preguntas nuevas por día de estudio, contadas en el servidor */
const FREE_DAILY = 20;

/** El banco con n preguntas publicadas y el modelo con las primeras calibrated ya calibradas */
function bankWithModel(cloud: FakeSupabaseServer, questions: number, calibrated: number) {
  const bank = createFakeBankStore();
  attachBank(cloud, bank);
  seedBank(bank, questions);
  const model = createFakeModelStore();
  attachModel(cloud, model);
  seedCalibration(model, bank, calibrated);
  return { bank, model };
}

/** Entra con el banco abierto y la prueba gratis prendidos en el servidor, como lo hará Ricardo */
async function enterWithOpenBank(page: Page, cloud: FakeSupabaseServer) {
  openBank(cloud);
  cloud.setFeatureFlags({ freeTrial: true });
  await enterWithLink(page, cloud, ANA, 'Ana');
  await reloadWithServerFlags(page);
}

const setup = (page: Page) => page.getByRole('region', { name: t.simulator.setupTitle });

async function openSetup(page: Page) {
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = setup(page);
  await expect(practice).toBeVisible({ timeout: 30_000 });
  return practice;
}

interface StartedEvent {
  type: string;
  payload: { config?: { adaptive?: boolean; ability?: number; abilitySe?: number } };
}

const startedSessions = async (page: Page) =>
  (await readTable<StartedEvent>(page, 'events')).filter(
    (event) => event.type === 'session_started',
  );

test.describe('Modo adaptativo de Simular', () => {
  test('con 10 calibradas dice calibrando con cuántas hay y las preguntas salen como siempre', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    bankWithModel(cloud, 60, 10);
    await enterWithOpenBank(page, cloud);
    const practice = await openSetup(page);

    // La nota de calibrando dice cuántas hay y cuántas faltan, y no ofrece la opción
    const note = practice
      .getByRole('status')
      .filter({ hasText: t.states.calibrating.progress(10, 50, adaptiveTexts.unit) });
    await expect(note).toBeVisible();
    await expect(note).toContainText(t.states.calibrating.remaining(40, adaptiveTexts.unit));
    await expect(practice.getByText(adaptiveTexts.calibrating(50))).toBeVisible();
    await expect(practice.getByRole('checkbox', { name: adaptiveTexts.label })).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // La práctica sigue como siempre y no queda marcada como adaptativa
    await practice
      .getByRole('combobox', { name: t.simulator.count, exact: true })
      .selectOption('5');
    await practice.getByRole('button', { name: t.simulator.start }).click();
    await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    const started = await startedSessions(page);
    expect(started).toHaveLength(1);
    expect(started[0]?.payload.config?.adaptive).toBeUndefined();
  });

  test('con 80 calibradas elige cerca del nivel y respeta el tope de Gratis', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(300_000);
    const { bank, model } = bankWithModel(cloud, 80, 80);
    await enterWithOpenBank(page, cloud);
    const practice = await openSetup(page);

    // Con suficientes preguntas calibradas la opción aparece y ya no dice calibrando
    const adaptive = practice.getByRole('checkbox', { name: adaptiveTexts.label });
    await expect(adaptive).toBeVisible();
    await expect(practice.getByText(adaptiveTexts.calibrating(50))).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    // Con Adaptativo el nivel lo elige la app y el filtro de dificultad lo dice
    await adaptive.check();
    await expect(practice.getByText(adaptiveTexts.difficultyLocked)).toBeVisible();
    await practice
      .getByRole('combobox', { name: t.simulator.count, exact: true })
      .selectOption(String(FREE_DAILY));
    await practice.getByRole('button', { name: t.simulator.start }).click();
    await expect(page.getByText(t.simulator.progress(1, FREE_DAILY), { exact: true })).toBeVisible({
      timeout: 30_000,
    });

    // El servidor contó las 20 lecturas del tope de Gratis y la sesión quedó marcada como adaptativa,
    // con el nivel con el que empezó
    expect(bank.reads).toHaveLength(FREE_DAILY);
    const started = await startedSessions(page);
    expect(started).toHaveLength(1);
    expect(started[0]?.payload.config?.adaptive).toBe(true);
    expect(started[0]?.payload.config?.ability).toBe(0);

    // Sin respuestas el nivel es 0 y las dificultades sembradas van de -2 a 2 repartidas parejo en las 80.
    // Las 20 salen de las 60 más cercanas al nivel, así que ninguna pasa de 1.5 logits. Elegir al azar entre
    // las 80 pasaría esta revisión menos de una de cada ochocientas veces
    const distances = bank.reads.map((read) =>
      Math.abs(model.calibration.get(read.questionId)?.difficulty ?? Number.POSITIVE_INFINITY),
    );
    expect(Math.max(...distances)).toBeLessThan(1.5);
    const average = distances.reduce((sum, value) => sum + value, 0) / distances.length;
    expect(average).toBeLessThan(1);

    for (let number = 1; number <= FREE_DAILY; number += 1) {
      await answerPracticeQuestion(page, number, FREE_DAILY);
    }

    // Adaptativo no abre más preguntas que el plan. El tope de hoy se acabó y el servidor no leyó una más
    const limited = await openSetup(page);
    await expect(limited.getByText(t.simulator.limitReached)).toBeVisible({ timeout: 30_000 });
    await expect(limited.getByRole('button', { name: t.simulator.start })).toHaveCount(0);
    expect(bank.reads).toHaveLength(FREE_DAILY);
    await expectNoSeriousA11yViolations(page);
  });
});
