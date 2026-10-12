// Etiquetado con cola asignada y acuerdo con datos (pantallas 19 y 28, 7.11, D-070). Un admin nombra
// médica a una alumna y le asigna todas las subespecialidades. Ella entra, ve su cola del doble
// etiquetado, etiqueta a ciegas los distractores de una pregunta y el tablero cuenta sus etiquetas.
// Con las etiquetas de un segundo médico sobre las mismas opciones, sembradas porque ninguna
// pantalla las deja poner en una prueba, kappa deja de calibrar y la app habla de sesgos.
// physician.spec ya cubre la cola vacía y al admin que no etiqueta.
import { ulid } from 'ulid';
import { SCREENS } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import {
  enterAs,
  escapeRegExp,
  putRows,
  readTable,
  signIn,
  signOut,
  statNumber,
  statValue,
  userRow,
} from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

const text = physicianText.agreementScreen;

interface StoredQuestion {
  questionId: string;
  version: number;
}
interface StoredOption {
  optionId: string;
  isCorrect: boolean;
  biasTag: string | null;
}
interface StoredLabel {
  id: string;
  optionId: string;
  physicianId: string;
  biasTag: string;
  labeledAt: string;
}

/** Cuántas preguntas distintas tiene el banco, sin contar versiones */
const bankSize = (questions: readonly StoredQuestion[]) =>
  new Set(questions.map((question) => question.questionId)).size;

test('el admin asigna temas a una médica, ella etiqueta su cola y con pares de dos médicos kappa deja de calibrar', async ({
  page,
}) => {
  test.setTimeout(300_000);
  // Ana será la médica. Beto es el perfil con el que entra el admin, porque nadie cambia su propio rol
  await signUp(page, 'Ana');
  await signOut(page);
  await signUp(page, 'Beto');
  await enterAs(page, 'admin');

  // El admin la nombra médica y le asigna todas las subespecialidades del banco
  await page.goto(SCREENS.adminUsers.path);
  const ana = userRow(page, 'Ana');
  await expect(ana.getByRole('combobox', { name: t.admin.role })).toBeVisible({ timeout: 90_000 });
  await ana.getByRole('combobox', { name: t.admin.role }).selectOption('physician');
  await expect(page.getByRole('status')).toHaveText(
    t.admin.roleChanged('Ana', t.roles.names.physician),
  );
  await expect(ana.getByText(t.admin.assignedCount(0))).toBeVisible();
  await ana.getByRole('button', { name: t.admin.assign }).click();
  await expect(ana.getByText(t.admin.assignTitle('Ana'))).toBeVisible();
  await ana.getByRole('button', { name: t.topicPicker.all }).click();
  await ana.getByRole('button', { name: t.admin.saveAssignment }).click();
  const questions = bankSize(await readTable<StoredQuestion>(page, 'questions'));
  await expect(page.getByRole('status')).toHaveText(t.admin.assigned('Ana', questions, 0));
  await expect(ana.getByText(t.admin.assignedCount(questions))).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // Ana entra como médica. Su cola es la muestra del doble etiquetado, el 20 % del banco
  await signOut(page);
  await signIn(page, 'Ana');
  await enterAs(page, 'physician');
  await page.goto(SCREENS.agreement.path);
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.hint)).toBeVisible({ timeout: 45_000 });
  const sample = Math.ceil(questions * DEFAULT_THRESHOLDS.bias.doubleLabelShare);
  await expect(queue.getByText(text.queue.remaining(sample))).toBeVisible();
  await expect(statValue(page, text.stats.label, text.stats.sample)).toHaveText(String(sample));
  await expect(statValue(page, text.stats.label, text.stats.kappa)).toHaveText(text.stats.noKappa);
  await expect(page.getByRole('status').filter({ hasText: text.vocabulary.title })).toContainText(
    text.vocabulary.calibrating,
  );
  await expectNoSeriousA11yViolations(page);

  // Etiqueta a ciegas cada distractor de la primera pregunta. Cada etiqueta se guarda al elegirla
  // La pregunta se ancla por su enunciado, porque al completarla sale de la cola y la primera pasa a
  // ser otra
  const first = queue.locator('details').first();
  const distractors = await first.getByRole('combobox').count();
  expect(distractors).toBeGreaterThan(0);
  const progress = (done: number) => text.queue.progress(done, distractors);
  await expect(first.locator('summary')).toContainText(progress(0));
  const prompt = (await first.locator('summary').innerText()).replace(progress(0), '').trim();
  const question = queue.locator('details').filter({ hasText: prompt });
  await question.locator('summary').click();
  for (let index = 0; index < distractors; index += 1) {
    await question
      .getByRole('combobox')
      .nth(index)
      .selectOption({ index: 1 + (index % 2) });
    await expect(queue.getByRole('status')).toHaveText(text.queue.saved);
    // El avance cambia cuando la etiqueta ya está en la base. Con la última, la pregunta sale de la cola
    if (index < distractors - 1) {
      await expect(question.locator('summary')).toContainText(progress(index + 1));
    } else {
      await expect(question).toHaveCount(0);
    }
  }
  // Completa, el tablero cuenta sus etiquetas
  await expect(queue.getByText(text.queue.remaining(sample - 1))).toBeVisible();
  await expect(statValue(page, text.stats.label, text.stats.mine)).toHaveText(
    new RegExp(`^${distractors}/\\d+$`),
  );
  const mine = await readTable<StoredLabel>(page, 'biasLabels');
  const anaId = mine[0]?.physicianId ?? '';
  expect(mine).toHaveLength(distractors);
  expect(mine.every((label) => label.physicianId === anaId)).toBe(true);

  // Un segundo médico que etiquetó las mismas opciones que Ana en otras preguntas. Coinciden en
  // cuatro de cada cinco. Sus etiquetas se siembran directo, porque etiquetar treinta pares a mano
  // no cabe en una prueba, con las llaves y los campos que exige el esquema
  const pairs = DEFAULT_THRESHOLDS.bias.minLabeledPairs + 10;
  const labeled = new Set(mine.map((label) => label.optionId));
  const options = (await readTable<StoredOption>(page, 'options')).filter(
    (option) => !option.isCorrect && option.biasTag !== null && !labeled.has(option.optionId),
  );
  const distinct = [...new Map(options.map((option) => [option.optionId, option])).values()];
  const tags = [...new Set(distinct.map((option) => option.biasTag as string))];
  expect(distinct.length).toBeGreaterThanOrEqual(pairs);
  expect(tags.length).toBeGreaterThan(1);
  const otherPhysician = ulid();
  const now = new Date().toISOString();
  const seeded: StoredLabel[] = distinct.slice(0, pairs).flatMap((option, index) => {
    const tag = option.biasTag as string;
    const disagree = tags.find((candidate) => candidate !== tag) ?? tag;
    return [
      { id: ulid(), optionId: option.optionId, physicianId: anaId, biasTag: tag, labeledAt: now },
      {
        id: ulid(),
        optionId: option.optionId,
        physicianId: otherPhysician,
        biasTag: index % 5 === 4 ? disagree : tag,
        labeledAt: now,
      },
    ];
  });
  await putRows(page, 'biasLabels', seeded);

  // Con pares suficientes kappa se mide, la app habla de sesgos y el acuerdo por etiqueta se lista
  await page.reload();
  await expect(queue.getByText(text.queue.hint)).toBeVisible({ timeout: 45_000 });
  expect(await statNumber(page, text.stats.label, text.stats.pairs)).toBe(pairs);
  await expect(statValue(page, text.stats.label, text.stats.kappa)).toHaveText(/^-?\d+(\.\d+)?$/);
  await expect(page.getByRole('status').filter({ hasText: text.vocabulary.title })).toHaveCount(0);
  const vocabulary = page.getByRole('region', { name: text.vocabulary.title });
  await expect(vocabulary.getByText(text.vocabulary.bias)).toBeVisible();
  await expect(
    vocabulary.getByText(text.vocabulary.rule(DEFAULT_THRESHOLDS.bias.minKappaForBiasLanguage)),
  ).toBeVisible();
  await expect(
    vocabulary.getByText(
      new RegExp(
        `^${escapeRegExp(text.vocabulary.current('§1', '§2', '§3')).replace(/§\d/g, '-?[\\d.,]+')}$`,
      ),
    ),
  ).toBeVisible();
  const byTag = page.getByRole('region', { name: text.byTag.title });
  await expect(byTag.getByText(text.byTag.none)).toHaveCount(0);
  expect(await byTag.locator('tbody tr').count()).toBeGreaterThan(0);
  await expectNoSeriousA11yViolations(page);
});
