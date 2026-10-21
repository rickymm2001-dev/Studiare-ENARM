// Banco en la nube para los médicos (B11, 4.2 y 4.4 del plan de B11). La autora corrige su borrador,
// guarda una versión nueva y la manda a revisión. El revisor la abre desde su cola, etiqueta a ciegas
// cada distractor sin ver lo que puso la autora y, ya con la pregunta completa, la aprueba y queda
// publicada. Pedir cambios pide comentario, regresa la versión a borrador y la autora lo lee en el
// historial, sin poder mandar otra vez la misma versión. Todo contra fakeEditorial.ts, con el texto
// simulado de fakeBankStore.ts.
import { SCREENS } from '@/app/screens';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { callerOf, enterTeam, teamBank } from '../support/bankTeam';
import { expect, openSecondDevice, test } from '../support/cloudFixtures';
import { FAKE_BANK_TEXT_MARK, seedQuestions, type FakeBankStore } from '../support/fakeBankStore';
import { assignQuestion, editorialRpc } from '../support/fakeEditorial';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const editor = physicianText.questionEditor;
const review = physicianText.review;
const queueText = physicianText.agreementScreen.queue;
const AUTHOR = { email: 'autora@ejemplo.mx', alias: 'Ana', role: 'physician' } as const;
const REVIEWER = { email: 'revisor@ejemplo.mx', alias: 'Beto', role: 'physician' } as const;

/** La versión más reciente de una pregunta del banco simulado */
function latestOf(bank: FakeBankStore, questionId: string) {
  const question = bank.questions.get(questionId);
  const version = question ? bank.versions.get(question.latestVersionId) : undefined;
  if (!version) throw new Error(`Sin versión de ${questionId}`);
  return version;
}

test.describe('Banco en la nube, médicos', () => {
  test('la autora manda su corrección y el revisor la etiqueta a ciegas y la aprueba', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    const {
      bank,
      users: [ana, beto],
    } = teamBank(cloud, [AUTHOR, REVIEWER]);
    if (!ana || !beto) throw new Error('Faltan las cuentas del equipo');
    const [seeded] = seedQuestions(bank, 1, { status: 'draft', origin: 'app', authorId: ana.id });
    if (!seeded) throw new Error('Sin pregunta sembrada');
    assignQuestion(bank, seeded.questionId, ana.id, 'author');
    assignQuestion(bank, seeded.questionId, beto.id, 'reviewer');
    const first = latestOf(bank, seeded.questionId);

    // La autora abre su borrador desde el banco, corrige la explicación y la manda
    await enterTeam(page, cloud, AUTHOR.email);
    await page.goto(SCREENS.questionBank.path);
    const list = page.getByRole('region', { name: physicianText.bank.listTitle });
    await list
      .getByRole('link', { name: physicianText.bankScreen.openQuestion(first.prompt) })
      .click({ timeout: 30_000 });
    const explanation = page.getByLabel(editor.meta.explanation, { exact: true });
    await expect(explanation).toHaveValue(first.explanation, { timeout: 30_000 });
    await expectNoSeriousA11yViolations(page);
    await explanation.fill(`${FAKE_BANK_TEXT_MARK} Explicación corregida por la autora.`);
    await page.getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(page.getByText(editor.save.saved)).toBeVisible();
    await page.getByRole('button', { name: review.submit.action }).click();
    await expect(page.getByText(review.submit.sent)).toBeVisible();
    await expect(page.getByText(review.waiting)).toBeVisible();
    const sent = latestOf(bank, seeded.questionId);
    expect(sent).toMatchObject({ version: 2, status: 'in_review', authorId: ana.id });

    // El revisor la tiene en su cola por etiquetar a ciegas
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    const reviewer = second.page;
    await enterTeam(reviewer, cloud, REVIEWER.email);
    await reviewer.goto(SCREENS.agreement.path);
    const queue = reviewer.getByRole('region', { name: queueText.title });
    await expect(queue.getByText(queueText.remaining(1))).toBeVisible({ timeout: 30_000 });
    await queue.getByRole('link', { name: queueText.open }).click();

    // A ciegas no ve la etiqueta ni la justificación de la autora
    const blind = reviewer.getByRole('region', { name: review.blind.title });
    await expect(blind).toBeVisible({ timeout: 30_000 });
    const distractors = sent.options.filter((option) => !option.isCorrect);
    for (const option of distractors) {
      await expect(reviewer.getByText(option.rationale)).toHaveCount(0);
    }
    await expect(blind.getByRole('combobox')).toHaveCount(distractors.length);
    await expectNoSeriousA11yViolations(reviewer);
    for (let index = 0; index < distractors.length; index += 1) {
      await blind
        .getByRole('combobox')
        .nth(index)
        .selectOption({ index: 1 + (index % 2) });
      if (index < distractors.length - 1) {
        await expect(
          blind.getByText(review.blind.progress(index + 1, distractors.length)),
        ).toBeVisible();
      }
    }
    await expect(
      reviewer.getByRole('status').filter({ hasText: review.blind.revealed }),
    ).toBeVisible();

    // Ya ve todo y aprueba. Pedir cambios sin comentario no se puede
    await expect(blind).toHaveCount(0);
    const decide = reviewer.getByRole('region', { name: review.decide.title });
    await expect(decide.getByRole('button', { name: review.decide.requestChanges })).toBeDisabled();
    await decide.getByRole('button', { name: review.decide.approve }).click();
    await expect(reviewer.getByText(review.decide.approvedPublished)).toBeVisible();

    expect(latestOf(bank, seeded.questionId).status).toBe('approved');
    expect(bank.catalog.get(seeded.questionId)).toMatchObject({ versionId: sent.id, version: 2 });
    expect(
      bank.labels.filter((label) => label.labelerId === beto.id && label.lockedAt !== null),
    ).toHaveLength(distractors.length);
    expect(bank.decisions).toEqual([
      expect.objectContaining({ physicianId: beto.id, decision: 'approve', version: 2 }),
    ]);
    await second.context.close();
  });

  test('pedir cambios pide comentario y la autora lo lee en el historial sin volver a mandar la misma versión', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(180_000);
    const {
      bank,
      users: [ana, beto],
    } = teamBank(cloud, [AUTHOR, REVIEWER]);
    if (!ana || !beto) throw new Error('Faltan las cuentas del equipo');
    const [seeded] = seedQuestions(bank, 1, { status: 'draft', origin: 'app', authorId: ana.id });
    if (!seeded) throw new Error('Sin pregunta sembrada');
    assignQuestion(bank, seeded.questionId, ana.id, 'author');
    assignQuestion(bank, seeded.questionId, beto.id, 'reviewer');
    const version = latestOf(bank, seeded.questionId);
    // La autora ya la mandó y el revisor ya la etiquetó a ciegas, con las mismas funciones de la base
    expect(
      editorialRpc(bank, 'editor_submit', callerOf(ana), { p_version_id: version.id }).status,
    ).toBe(200);
    for (const option of version.options.filter((item) => !item.isCorrect)) {
      const reply = editorialRpc(bank, 'editor_label_option', callerOf(beto), {
        p_version_id: version.id,
        p_option_id: option.optionId,
        p_tag: option.biasTag,
      });
      expect(reply.status).toBe(200);
    }

    // El revisor pide cambios con su comentario
    await enterTeam(page, cloud, REVIEWER.email);
    await page.goto(`${SCREENS.questionEditor.path}?pregunta=${seeded.questionId}`);
    const decide = page.getByRole('region', { name: review.decide.title });
    await expect(decide).toBeVisible({ timeout: 30_000 });
    const changes = decide.getByRole('button', { name: review.decide.requestChanges });
    await expect(changes).toBeDisabled();
    const comment = `${FAKE_BANK_TEXT_MARK} Revisa la justificación de la opción C.`;
    await decide.getByLabel(review.decide.comment).fill(comment);
    await expect(changes).toBeEnabled();
    await changes.click();
    await expect(page.getByText(review.decide.changesRequested)).toBeVisible();
    expect(latestOf(bank, seeded.questionId).status).toBe('draft');
    expect(bank.decisions).toEqual([
      expect.objectContaining({ decision: 'request_changes', comment, physicianId: beto.id }),
    ]);

    // La autora ve el comentario en el historial y tiene que guardar una versión nueva para mandarla
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    await enterTeam(second.page, cloud, AUTHOR.email);
    await second.page.goto(`${SCREENS.questionEditor.path}?pregunta=${seeded.questionId}`);
    const history = second.page.getByRole('region', { name: editor.sections.history });
    await expect(history.getByText(comment, { exact: false })).toBeVisible({ timeout: 30_000 });
    await expect(second.page.getByText(review.submit.decided)).toBeVisible();
    await expect(second.page.getByRole('button', { name: review.submit.action })).toBeDisabled();
    await expectNoSeriousA11yViolations(second.page);
    await second.context.close();
  });

  test('Reportes dice la noche en que la calibración marcó cada distractor y con cuántas exposiciones (B14)', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const {
      bank,
      users: [ana],
    } = teamBank(cloud, [AUTHOR]);
    if (!ana) throw new Error('Falta la autora');
    const [seeded] = seedQuestions(bank, 1, { status: 'draft', origin: 'app', authorId: ana.id });
    if (!seeded) throw new Error('Sin pregunta sembrada');
    assignQuestion(bank, seeded.questionId, ana.id, 'author');
    const version = latestOf(bank, seeded.questionId);
    const option = version.options.find((item) => !item.isCorrect);
    if (!option) throw new Error('La pregunta no trae distractores');
    // La marca la dejó la calibración a las 4:30 de la mañana de Mérida del 16 de octubre, que cuenta los
    // datos hasta la noche del 15, con 140 exposiciones y 3 elecciones
    bank.distractorFlags.push({
      id: '0f000000-0000-4000-8000-000000000001',
      questionId: seeded.questionId,
      optionId: option.optionId,
      versionId: version.id,
      exposures: 140,
      choices: 3,
      attraction: 3 / 140,
      status: 'open',
      flaggedAt: '2026-10-16T10:30:00.000Z',
      resolvedAt: null,
      resolvedBy: null,
      note: null,
    });

    await enterTeam(page, cloud, AUTHOR.email);
    await page.goto(SCREENS.contentReports.path);
    const queue = page.getByRole('region', { name: physicianText.distractors.title });
    await expect(queue).toBeVisible({ timeout: 30_000 });
    await expect(
      queue.getByText(calibrationAdminTexts.distractors.flagged('15 de octubre')),
    ).toBeVisible({ timeout: 30_000 });
    // Las cifras de siempre siguen a la vista
    await expect(queue.getByText(physicianText.distractors.figures(140, 3, '2.1 %'))).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
