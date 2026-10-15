// Revisión a ciegas de la demo (pantallas 17, 18 y 19, 4.4 del plan de B11). Un admin nombra médica a
// una alumna y le asigna todas las subespecialidades. Ella abre una pregunta completa del banco, la
// manda a revisión y, ya en revisión, etiqueta a ciegas cada distractor sin ver lo del autor. Al
// terminar ve la pregunta completa y la aprueba. El tablero de acuerdo cuenta los pares de la etiqueta
// del autor y la suya. Con más pares, sembrados porque etiquetar treinta a mano no cabe en una prueba,
// kappa deja de calibrar y la app habla de sesgos. Ya no hay muestra del 20 % (8.9 del plan de B11).
// physician.spec ya cubre la cola vacía y al admin que solo lee.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ulid } from 'ulid';
import { SCREENS } from '@/app/screens';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { versionIssues } from '@/data/content/questionRules';
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
const review = physicianText.review;

interface StoredQuestion {
  id: string;
  questionId: string;
  version: number;
  caseId: string | null;
  prompt: string;
  explanation: string;
  gpcRefs: { title: string }[];
  canonicalOptionIds: string[];
}
interface StoredOption {
  id: string;
  optionId: string;
  questionVersionId: string;
  text: string;
  isCorrect: boolean;
  biasTag: string | null;
  rationale: string;
}
interface StoredLabel {
  id: string;
  optionId: string;
  physicianId: string;
  biasTag: string;
  labeledAt: string;
}

const TAGGABLE = new Set(
  (
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../src/demo/content/bias-taxonomy.json', import.meta.url)),
        'utf8',
      ),
    ) as { biases: { key: string; taggable: boolean }[] }
  ).biases
    .filter((bias) => bias.taggable)
    .map((bias) => bias.key),
);

/** Cuántas preguntas distintas tiene el banco, sin contar versiones */
const bankSize = (questions: readonly StoredQuestion[]) =>
  new Set(questions.map((question) => question.questionId)).size;

/** Una pregunta directa sin pendientes, que se puede mandar a revisión y aprobar */
function completeQuestion(questions: readonly StoredQuestion[], options: readonly StoredOption[]) {
  return questions.find((question) => {
    if (question.caseId !== null || question.version !== 1) return false;
    const own = options.filter((option) => option.questionVersionId === question.id);
    const position = new Map(own.map((option, index) => [option.id, index]));
    return (
      versionIssues(
        {
          prompt: question.prompt,
          explanation: question.explanation,
          refs: question.gpcRefs.map((ref) => ref.title),
          options: own.map((option, index) => ({
            position: index,
            text: option.text,
            isCorrect: option.isCorrect,
            biasTag: option.biasTag,
            rationale: option.rationale,
          })),
          canonicalPositions: question.canonicalOptionIds.flatMap((id) => {
            const at = position.get(id);
            return at === undefined ? [] : [at];
          }),
        },
        TAGGABLE,
      ).length === 0
    );
  });
}

test('la médica manda una pregunta a revisión, la etiqueta a ciegas, la aprueba y con pares suficientes kappa deja de calibrar', async ({
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
  const questions = await readTable<StoredQuestion>(page, 'questions');
  const size = bankSize(questions);
  await expect(page.getByRole('status')).toHaveText(t.admin.assigned('Ana', size, 0));
  await expect(ana.getByText(t.admin.assignedCount(size))).toBeVisible();

  // Ana entra como médica. Nada está en revisión todavía, así que no tiene nada por etiquetar
  await signOut(page);
  await signIn(page, 'Ana');
  await enterAs(page, 'physician');
  await page.goto(SCREENS.agreement.path);
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.empty)).toBeVisible({ timeout: 45_000 });
  await expect(statValue(page, text.stats.label, text.stats.pending)).toHaveText('0');
  await expect(statValue(page, text.stats.label, text.stats.kappa)).toHaveText(text.stats.noKappa);
  await expect(page.getByRole('status').filter({ hasText: text.vocabulary.title })).toContainText(
    text.vocabulary.calibrating,
  );
  await expectNoSeriousA11yViolations(page);

  // Abre desde el banco una pregunta completa y la manda a revisión. Ella es su revisora en la demo
  const options = await readTable<StoredOption>(page, 'options');
  const target = completeQuestion(questions, options);
  if (!target) throw new Error('El banco demo no tiene una pregunta directa completa');
  const distractors = options.filter(
    (option) => option.questionVersionId === target.id && !option.isCorrect,
  );
  await page.goto(SCREENS.questionBank.path);
  const list = page.getByRole('region', { name: t.bank.listTitle });
  await list.getByLabel(t.bank.search).fill(target.prompt.slice(0, 80));
  await list
    .getByRole('link', { name: physicianText.bankScreen.openQuestion(target.prompt.slice(0, 140)) })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.questionEditor.title }),
  ).toBeVisible();
  await page.getByRole('button', { name: review.submit.action }).click({ timeout: 60_000 });
  await expect(page.getByText(review.submit.sent)).toBeVisible();

  // Paso 1. A ciegas no ve la justificación del autor ni el formulario
  const blind = page.getByRole('region', { name: review.blind.title });
  await expect(blind).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByLabel(physicianText.questionEditor.meta.explanation, { exact: true }),
  ).toHaveCount(0);
  for (const option of distractors) await expect(page.getByText(option.rationale)).toHaveCount(0);
  await expect(blind.getByRole('combobox')).toHaveCount(distractors.length);
  await expectNoSeriousA11yViolations(page);
  for (let index = 0; index < distractors.length; index += 1) {
    await blind
      .getByRole('combobox')
      .nth(index)
      .selectOption({ index: 1 + (index % 2) });
    // El aviso dice qué etiqueta quedó y en qué opción (H25). Con la última dice que ya ve todo
    const notice = page
      .getByRole('status')
      .filter({ hasText: /^Guardaste .+ en la opción [A-J]\./ });
    if (index < distractors.length - 1) {
      await expect(notice).toBeVisible();
      await expect(
        blind.getByText(review.blind.progress(index + 1, distractors.length)),
      ).toBeVisible();
    } else {
      await expect(notice).toContainText(review.blind.revealed);
    }
  }

  // Paso 2. Con el etiquetado completo ve lo del autor y aprueba
  await expect(blind).toHaveCount(0);
  const decide = page.getByRole('region', { name: review.decide.title });
  await expect(decide).toBeVisible();
  await decide.getByRole('button', { name: review.decide.approve }).click();
  await expect(page.getByText(review.decide.approvedPublished)).toBeVisible();
  const mine = await readTable<StoredLabel>(page, 'biasLabels');
  const anaId = mine[0]?.physicianId ?? '';
  expect(mine).toHaveLength(distractors.length);
  expect(mine.every((label) => label.physicianId === anaId)).toBe(true);

  // El tablero cuenta un par de autor y revisora por distractor y sigue calibrando
  await page.goto(SCREENS.agreement.path);
  await expect(queue.getByText(text.queue.empty)).toBeVisible({ timeout: 45_000 });
  expect(await statNumber(page, text.stats.label, text.stats.pairs)).toBe(distractors.length);
  await expect(statValue(page, text.stats.label, text.stats.kappa)).toHaveText(text.stats.noKappa);

  // Más pares de Ana sobre otros distractores que ya traen la etiqueta del autor. Coincide en cuatro
  // de cada cinco. Se siembran directo, con las llaves y los campos que exige el esquema
  const seededPairs = DEFAULT_THRESHOLDS.bias.minLabeledPairs + 10;
  const labeled = new Set(mine.map((label) => label.optionId));
  const others = options.filter(
    (option) => !option.isCorrect && option.biasTag !== null && !labeled.has(option.optionId),
  );
  const distinct = [...new Map(others.map((option) => [option.optionId, option])).values()];
  const tags = [...new Set(distinct.map((option) => option.biasTag as string))];
  expect(distinct.length).toBeGreaterThanOrEqual(seededPairs);
  expect(tags.length).toBeGreaterThan(1);
  const now = new Date().toISOString();
  await putRows(
    page,
    'biasLabels',
    distinct.slice(0, seededPairs).map((option, index): StoredLabel => {
      const tag = option.biasTag as string;
      const disagree = tags.find((candidate) => candidate !== tag) ?? tag;
      return {
        id: ulid(),
        optionId: option.optionId,
        physicianId: anaId,
        biasTag: index % 5 === 4 ? disagree : tag,
        labeledAt: now,
      };
    }),
  );

  // Con pares suficientes kappa se mide, la app habla de sesgos y el acuerdo por etiqueta se lista
  await page.reload();
  await expect(queue.getByText(text.queue.empty)).toBeVisible({ timeout: 45_000 });
  expect(await statNumber(page, text.stats.label, text.stats.pairs)).toBe(
    distractors.length + seededPairs,
  );
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
