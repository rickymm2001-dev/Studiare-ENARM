// Panel del médico de la Fase E. Pantalla 19, acuerdo del etiquetado. Sin etiquetas mide nada y dice
// que el alumno ve trampas. El médico sin preguntas en revisión no tiene nada por etiquetar y el admin
// no etiqueta. Pantalla 18, editor de pregunta, que el admin solo lee desde B11 (la médica que edita,
// etiqueta a ciegas y decide está en physician-labeling.spec). Pantalla 21, reportes de contenido.
// Pantalla 20, borradores de IA, donde solo se pide una propuesta de una pregunta marcada (B12, 3.2). Pantalla 22,
// importador del banco.
import { SCREENS } from '@/app/screens';
import { HEADERS, optionHeaders } from '@/data/content/bankColumns';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { newId } from '@/data/ids';
import { openPracticeSetup, putRows, readTable } from './support/b1';
import {
  answerPracticeQuestion,
  expect,
  expectNoSeriousA11yViolations,
  signUp,
  test,
} from './support/fixtures';
import type { Page } from '@playwright/test';

const text = physicianText.agreementScreen;

// Una pregunta del banco demo cuya propuesta de ejemplo pasa las revisiones. Las de salud mental no
// pasan a propósito y el proxy contesta con error, que el navegador anota en la consola
const RESTRUCTURABLE =
  'Todos los siguientes son criterios para el diagnóstico de diabetes mellitus';

async function enterAs(page: Page, role: 'physician' | 'admin') {
  await page.goto(SCREENS.roleSelector.path);
  await page.getByRole('radio', { name: new RegExp(t.roles.names[role]) }).click();
  await page.getByRole('button', { name: t.roles.enterAs(t.roles.names[role]) }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('acuerdo del etiquetado. El médico sin asignaciones no tiene cola y el tablero calibra', async ({
  page,
}) => {
  // Con cuenta, porque la cola lleva las preguntas asignadas a quien etiqueta
  await signUp(page);
  await enterAs(page, 'physician');
  await page.goto(SCREENS.agreement.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.agreement.title }),
  ).toBeVisible();
  const queue = page.getByRole('region', { name: text.queue.title });
  // La pantalla espera a que el banco demo termine de sembrarse la primera vez, y eso puede tardar
  await expect(queue.getByText(text.queue.empty)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(text.vocabulary.title)).toBeVisible();
  await expect(page.getByText(text.vocabulary.trap, { exact: false })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('acuerdo del etiquetado. El admin ve el tablero y no etiqueta', async ({ page }) => {
  await enterAs(page, 'admin');
  await page.goto(SCREENS.agreement.path);
  const queue = page.getByRole('region', { name: text.queue.title });
  await expect(queue.getByText(text.queue.adminNote)).toBeVisible({ timeout: 45_000 });
  await expect(queue.getByRole('combobox')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
});

test('editor de pregunta. El admin la abre desde el banco y solo la lee', async ({ page }) => {
  test.setTimeout(180_000);
  await signUp(page);
  await enterAs(page, 'admin');
  await page.goto(SCREENS.questionBank.path);
  const list = page.getByRole('region', { name: physicianText.bank.listTitle });
  const open = list
    .getByRole('link', {
      name: new RegExp(`^${physicianText.bankScreen.openQuestion('')}`),
    })
    .first();
  await expect(open).toBeVisible({ timeout: 90_000 });
  await open.click();

  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.questionEditor.title }),
  ).toBeVisible();
  // Los médicos escriben, etiquetan y deciden. El admin ve la pregunta completa y su historia (1.7)
  await expect(page.getByText(physicianText.review.readOnly)).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole('region', { name: physicianText.questionEditor.sections.history }),
  ).toBeVisible();
  await expect(
    page.getByLabel(physicianText.questionEditor.meta.explanation, { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: physicianText.review.submit.action })).toHaveCount(
    0,
  );
  await expectNoSeriousA11yViolations(page);
});

test('reportes. El alumno reporta un error y desde la bandeja se resuelve', async ({ page }) => {
  test.setTimeout(240_000);
  await signUp(page);
  const practice = await openPracticeSetup(page, { count: 5 });
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled();
  await start.click();
  for (let index = 1; index <= 5; index += 1) await answerPracticeQuestion(page, index, 5);

  // Reporta desde la revisión del resumen
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  const answers = page.getByRole('region', { name: t.simulator.review });
  const row = answers
    .getByRole('listitem')
    .filter({ has: page.locator('details') })
    .first();
  if ((await row.locator(':scope > details').getAttribute('open')) === null) {
    await row.locator('summary').first().click();
  }
  await row.locator('summary', { hasText: t.simulator.report }).click();
  await row.getByRole('button', { name: t.simulator.sendReport }).click();
  await expect(row.getByText(t.simulator.reported)).toBeVisible();

  // El reporte llega a la bandeja y se resuelve
  await enterAs(page, 'admin');
  await page.goto(SCREENS.contentReports.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.contentReports.title }),
  ).toBeVisible();
  await expect(page.getByText(physicianText.reportsScreen.group.open(1))).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: physicianText.reportsScreen.row.resolve }).click();
  await expect(page.getByText(physicianText.reportsScreen.empty.openTitle)).toBeVisible();
});

test('borradores de IA. Solo se pide una propuesta de una pregunta marcada, llega como borrador con el original y se rechaza', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const questions = physicianText.draftsScreen.questions;
  await signUp(page);
  await enterAs(page, 'admin');
  await page.goto(SCREENS.aiDrafts.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.aiDrafts.title }),
  ).toBeVisible();
  await expect(page.getByText(questions.pendingEmpty)).toBeVisible({ timeout: 90_000 });

  // Sin un reporte abierto ni un distractor que casi nadie elige no hay preguntas marcadas. La IA no
  // recorre el banco por su cuenta, y pedir una propuesta de cualquier pregunta no se puede
  await expect(page.getByText(questions.markedEmpty)).toBeVisible();
  await page.getByLabel(questions.search).fill(RESTRUCTURABLE);
  await expect(page.getByText(questions.noResults)).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${questions.pick}`) })).toHaveCount(0);
  await expect(page.getByRole('button', { name: questions.ask })).toBeDisabled();
  await expectNoSeriousA11yViolations(page);

  // Un alumno reporta un error en esa pregunta. El reporte abierto la marca
  const bank = await readTable<{ id: string; vignette: string; prompt: string }>(page, 'questions');
  const target = bank.find((question) =>
    `${question.vignette} ${question.prompt}`.includes(RESTRUCTURABLE),
  );
  if (!target) throw new Error('El banco de demostración no trae la pregunta de la prueba');
  await putRows(page, 'contentReports', [
    {
      id: newId(),
      reporterId: newId(),
      targetKind: 'question',
      targetId: target.id,
      reason: 'clinical_error',
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    },
  ]);
  await page.reload();
  await expect(page.getByText(questions.markedCount(1))).toBeVisible({ timeout: 60_000 });
  await page.getByLabel(questions.search).fill(RESTRUCTURABLE);
  const pick = page.getByRole('button', { name: new RegExp(`^${questions.pick}`) });
  await expect(pick.first()).toBeVisible();
  // Dice por qué está marcada, y las demás preguntas del banco siguen sin poder elegirse
  await expect(
    page.getByText(questions.markReasons.open_report ?? '', { exact: true }),
  ).toBeVisible();
  await page.getByLabel(questions.search).fill('ánimo bajo');
  await expect(page.getByText(questions.noResults)).toBeVisible();
  await page.getByLabel(questions.search).fill(RESTRUCTURABLE);
  await pick.first().click();
  await page.getByRole('button', { name: questions.ask }).click();

  const form = page.getByRole('form');
  await expect(form).toBeVisible({ timeout: 30_000 });
  await expect(form.getByText(physicianText.draftsScreen.draftLabel)).toBeVisible();
  await expect(form.getByText(questions.original)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await form.getByRole('button', { name: questions.reject }).click();
  await expect(page.getByText(questions.rejectedNotice)).toBeVisible();
  await expect(page.getByText(questions.pendingEmpty)).toBeVisible();
});

test('importador. Revisa el archivo, reporta la fila con problema e importa solo lo bueno', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signUp(page);
  await enterAs(page, 'admin');
  await page.goto(SCREENS.bankImport.path);
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.bankImport.title }),
  ).toBeVisible();

  const letters = ['A', 'B', 'C', 'D'];
  const columns = [
    ...Object.values(HEADERS),
    ...letters.flatMap((letter) => Object.values(optionHeaders(letter))),
  ];
  const record = (id: string, branch: string): Record<string, string> => ({
    [HEADERS.id]: id,
    [HEADERS.branch]: branch,
    [HEADERS.topic]: 'Cardiología',
    [HEADERS.subtopic]: 'Hipertensión arterial sistémica',
    [HEADERS.difficulty]: '3',
    [HEADERS.vignette]: 'Hombre de 58 años con cefalea occipital y presión de 190/110 mmHg.',
    [HEADERS.prompt]: '¿Cuál es el diagnóstico de la prueba de importación?',
    [HEADERS.correct]: 'A',
    [HEADERS.explanation]:
      'Una presión muy elevada sin daño a órgano blanco es una urgencia hipertensiva.',
    [HEADERS.refs]: 'GPC Hipertensión arterial',
    ...Object.fromEntries(
      letters.flatMap((letter, index) => [
        [optionHeaders(letter).text, `Opción de texto ${letter}`],
        [optionHeaders(letter).rationale, `Razón de la opción ${letter}.`],
        [
          optionHeaders(letter).bias,
          index === 0
            ? ''
            : (['anchoring', 'premature_closure', 'framing_effect'][index - 1] ?? ''),
        ],
      ]),
    ),
  });
  const csv = [
    columns,
    ...[record('imp-1', 'Medicina interna'), record('imp-2', 'Brujería')].map((row) =>
      columns.map((column) => JSON.stringify(row[column] ?? '')),
    ),
  ]
    .map((line) => line.join(','))
    .join('\n');
  await page
    .getByLabel(physicianText.importScreen.file.label)
    .setInputFiles({ name: 'banco-prueba.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  const summary = page.getByRole('region', { name: physicianText.importScreen.summary.title });
  await expect(summary.getByText(physicianText.importScreen.summary.newQuestions(1))).toBeVisible();
  const problems = page.getByRole('region', {
    name: new RegExp(physicianText.importScreen.problems.title),
  });
  await expect(problems.getByText(/Brujería/)).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  await page.getByRole('button', { name: physicianText.importScreen.run.import(1) }).click();
  await expect(page.getByText(physicianText.importScreen.done.created(1))).toBeVisible();
  await page.getByRole('link', { name: physicianText.importScreen.done.goBank }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: t.screens.questionBank.title }),
  ).toBeVisible();
  await page.getByLabel(physicianText.bank.search).fill('prueba de importación');
  await expect(page.getByText('¿Cuál es el diagnóstico de la prueba de importación?')).toBeVisible({
    timeout: 60_000,
  });
});
