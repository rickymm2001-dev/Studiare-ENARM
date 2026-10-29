// Práctica por dificultad y muestreo dirigido (pantalla 7, D-080). Con el filtro en Difícil, la
// cifra de disponibles baja a las preguntas de 4 y 5 del banco, la práctica solo trae de esas y la
// bitácora anota el filtro. Sin errores con trampa etiquetada, el modo Dirigido dice que calibra,
// cuánto le falta, y no dirige nada, así las opciones salen variadas. Adaptativo también dice que
// calibra, con su propia nota, porque el banco de demostración no tiene preguntas con dificultad
// calculada por otros alumnos (B14, 4.5).
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { PRACTICE_STORAGE_KEY } from '@/features/simulator/practice';
import { adaptiveTexts } from '@/i18n/adaptive';
import { t } from '@/i18n/es-MX';
import { availableCount, openPracticeSetup, pickSegment, readTable } from './support/b1';
import {
  answerPracticeQuestion,
  expect,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';

const COUNT = 5;
/** Difícil es 4 a 5 en la escala del médico (src/features/shared/difficulty.ts) */
const HARD_FROM = 4;

interface StoredQuestion {
  id: string;
  questionId: string;
  version: number;
  physicianDifficulty: number;
  variantOf?: string;
  editorialStatus: string;
}

/** La versión más reciente de cada pregunta que ve el alumno, como listStudentPool */
function practicePool(questions: readonly StoredQuestion[]): StoredQuestion[] {
  const latest = new Map<string, StoredQuestion>();
  for (const question of questions) {
    const current = latest.get(question.questionId);
    if (!current || current.version < question.version) latest.set(question.questionId, question);
  }
  return [...latest.values()].filter(
    (question) => question.variantOf === undefined || question.editorialStatus === 'approved',
  );
}

test('la práctica por dificultad solo trae preguntas de ese nivel y la bitácora anota el filtro', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  // El banco demo se siembra la primera vez que se entra y puede tardar
  const setup = await openPracticeSetup(page);
  const start = setup.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled();
  const all = await availableCount(setup);

  // Con el filtro en Difícil, en Más ajustes, quedan solo las de 4 y 5, que son las mismas que tiene
  // el banco
  await setup.getByRole('combobox', { name: t.simulator.difficulty }).selectOption('hard');
  const pool = practicePool(await readTable<StoredQuestion>(page, 'questions'));
  const hard = pool.filter((question) => question.physicianDifficulty >= HARD_FROM);
  expect(hard.length).toBeGreaterThan(0);
  expect(hard.length).toBeLessThan(all);
  await expect.poll(() => availableCount(setup)).toBe(hard.length);
  await expectNoSeriousA11yViolations(page);

  await pickSegment(setup, t.simulator.count, String(COUNT));
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, COUNT), { exact: true })).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Las preguntas de la práctica en curso son todas difíciles y distintas entre sí
  const stored = await page.evaluate(
    (key) =>
      JSON.parse(sessionStorage.getItem(key) ?? '{}') as { state?: { questionIds?: string[] } },
    PRACTICE_STORAGE_KEY,
  );
  const ids = stored.state?.questionIds ?? [];
  expect(ids).toHaveLength(COUNT);
  expect(new Set(ids).size).toBe(COUNT);
  const byId = new Map(pool.map((question) => [question.id, question]));
  for (const id of ids) {
    expect(byId.get(id)?.physicianDifficulty, `dificultad de ${id}`).toBeGreaterThanOrEqual(
      HARD_FROM,
    );
  }

  // La sesión quedó en la bitácora con el filtro y con el muestreo variado, no dirigido
  const events = await readTable<{
    type: string;
    payload: { kind?: string; config?: Record<string, unknown> };
  }>(page, 'events');
  const started = events.find(
    (event) => event.type === 'session_started' && event.payload.kind === 'practice',
  );
  expect(started?.payload.config).toMatchObject({
    difficulty: 'hard',
    count: COUNT,
    sampling: 'diverse',
  });

  // Y se contesta como cualquier práctica
  await answerPracticeQuestion(page, 1, COUNT);
});

test('sin errores con trampa etiquetada, el modo Dirigido calibra, dice cuánto falta y no dirige nada', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signUp(page);
  const setup = await openPracticeSetup(page, { mode: 'targeted' });
  const text = t.simulator.targeted;

  // No hay casilla que encender, solo la nota de calibración con el umbral del motor de sesgos
  await expect(setup.getByRole('checkbox', { name: text.label })).toHaveCount(0);
  await expect(setup.getByText(text.calibrating)).toBeVisible();
  // Hay dos notas de calibrando, la de este muestreo y la de Adaptativo. Cada una se busca por su unidad
  const note = setup
    .getByRole('status')
    .filter({ hasText: t.states.calibrating.title })
    .filter({ hasText: text.unit });
  await expect(note).toContainText(
    t.states.calibrating.progress(0, DEFAULT_THRESHOLDS.bias.minTaggedErrors, text.unit),
  );
  await expect(note).toContainText(
    t.states.calibrating.remaining(DEFAULT_THRESHOLDS.bias.minTaggedErrors, text.unit),
  );
  // Adaptativo dice cuántas preguntas calibradas hay y no ofrece casilla, igual que el muestreo dirigido
  const needed = FACTORY_MODEL_SETTINGS.thresholds.adaptiveMinItems;
  const adaptive = setup
    .getByRole('status')
    .filter({ hasText: t.states.calibrating.title })
    .filter({ hasText: adaptiveTexts.unit });
  await expect(adaptive).toContainText(
    t.states.calibrating.progress(0, needed, adaptiveTexts.unit),
  );
  await expect(setup.getByRole('checkbox', { name: adaptiveTexts.label })).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);

  // El lateral dice cuántos errores faltan para que el modo dirija de verdad
  await expect(
    page.getByText(
      t.simulator.trains.targetedCalibrating(0, DEFAULT_THRESHOLDS.bias.minTaggedErrors),
    ),
  ).toBeVisible();

  // Una práctica que arranca así queda con el muestreo variado
  await pickSegment(setup, t.simulator.count, '5');
  await setup.getByRole('button', { name: t.simulator.start }).click();
  await expect(page.getByText(t.simulator.progress(1, 5), { exact: true })).toBeVisible();
  const events = await readTable<{ type: string; payload: { config?: Record<string, unknown> } }>(
    page,
    'events',
  );
  const started = events.find((event) => event.type === 'session_started');
  expect(started?.payload.config).toMatchObject({ sampling: 'diverse' });
  expect(started?.payload.config).not.toHaveProperty('targetTags');
});
