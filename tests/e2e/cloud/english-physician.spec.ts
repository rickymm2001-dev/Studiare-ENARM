// El médico y el revisor de un caso de lectura en inglés (B13, 5.4 y 6.3 del plan de B13). La autora abre su
// borrador en inglés desde el banco, que ya separa Español de Inglés con el filtro Sección y le dice qué
// le falta. Sin la fuente del texto no se puede mandar a revisión. Ella llena la fuente con una licencia CC
// BY, guarda y manda. El revisor etiqueta a ciegas con el texto en inglés y su fuente a la vista, aprueba, y
// el caso queda publicado en el catálogo con su idioma, de donde lo toma la práctica de inglés del alumno.
// Todo contra el Supabase simulado (fakeEditorial.ts) con los casos de lectura simulados de seedEnglishCases
// (fakeBankStore.ts, 6.3 del plan de B13).
import type { Locator } from '@playwright/test';
import { PASSAGE_SOURCE_PREFIX } from '@/data/content/passageSource';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { callerOf, enterTeam, teamBank } from '../support/bankTeam';
import {
  enterWithLink,
  expect,
  openSecondDevice,
  reloadWithServerFlags,
  test,
} from '../support/cloudFixtures';
import { openBank, seedBank } from '../support/fakeBank';
import {
  createFakeBankStore,
  seedEnglishCases,
  seedQuestions,
  type FakeBankQuestion,
  type FakeBankStore,
  type FakeBankVersion,
} from '../support/fakeBankStore';
import { assignQuestion, editorialRpc } from '../support/fakeEditorial';
import { attachBank } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const editor = physicianText.questionEditor;
const review = physicianText.review;
const queueText = physicianText.agreementScreen.queue;
const MISSING = physicianText.incomplete.passage_source_missing;

const AUTHOR = { email: 'autora.ingles@ejemplo.mx', alias: 'Ana', role: 'physician' } as const;
const REVIEWER = { email: 'revisor.ingles@ejemplo.mx', alias: 'Beto', role: 'physician' } as const;
const STUDENT = 'alumna.ingles@ejemplo.mx';

/** La versión más reciente de una pregunta del banco simulado */
function latestOf(bank: FakeBankStore, questionId: string): FakeBankVersion {
  const question = bank.questions.get(questionId);
  const version = question ? bank.versions.get(question.latestVersionId) : undefined;
  if (!version) throw new Error(`Sin versión de ${questionId}`);
  return version;
}

/**
 * Deja el caso en inglés como un borrador de la autora que nadie ha mandado y que no trae su fuente, como
 * lo deja el Sheet con las tres columnas de la fuente vacías. Devuelve sus preguntas
 */
function asDraftWithoutSource(bank: FakeBankStore, authorId: string): FakeBankQuestion[] {
  const english = [...bank.versions.values()].filter((version) => version.language === 'en');
  if (english.length === 0) throw new Error('seedEnglishCases no dejó preguntas en inglés');
  const questions: FakeBankQuestion[] = [];
  for (const version of english) {
    version.status = 'draft';
    version.submittedAt = null;
    version.decidedAt = null;
    version.authorId = authorId;
    version.source = 'app';
    version.gpcRefs = [];
    version.incomplete = ['passage_source_missing'];
    const question = bank.questions.get(version.questionId);
    if (!question) continue;
    // Nacida en la app, para que el editor deje escribir sin el aviso de las que vienen del Sheet
    question.origin = 'app';
    question.sourceKey = null;
    question.publishedVersionId = null;
    bank.catalog.delete(version.questionId);
    questions.push(question);
  }
  return questions;
}

/** Los renglones del banco, para contar cuáles se ven */
const rows = (list: Locator) => list.getByRole('link', { name: /^Abrir la pregunta/ });

test.describe('Inglés médico, médico y revisor', () => {
  test('la autora completa la fuente de un caso en inglés, el revisor lo aprueba y queda publicado en inglés', async ({
    page,
    browser,
    cloud,
    consoleErrors,
  }) => {
    test.setTimeout(300_000);
    const {
      bank,
      users: [ana, beto],
    } = teamBank(cloud, [AUTHOR, REVIEWER]);
    if (!ana || !beto) throw new Error('Faltan las cuentas del equipo');
    // Dos preguntas en español del banco y un caso de lectura en inglés de una pregunta, sin su fuente
    const spanish = seedQuestions(bank, 2, { status: 'draft', origin: 'app', authorId: ana.id });
    seedEnglishCases(bank, 1, { itemsPerCase: 1 });
    const [english] = asDraftWithoutSource(bank, ana.id);
    if (!english) throw new Error('Sin pregunta en inglés');
    for (const question of [...spanish, english]) {
      assignQuestion(bank, question.questionId, ana.id, 'author');
      assignQuestion(bank, question.questionId, beto.id, 'reviewer');
    }
    const first = latestOf(bank, english.questionId);
    expect(first.gpcRefs).toEqual([]);

    // El banco separa Español de Inglés y dice qué le falta a la pregunta en inglés
    await enterTeam(page, cloud, AUTHOR.email);
    await page.goto(SCREENS.questionBank.path);
    const list = page.getByRole('region', { name: physicianText.bank.listTitle });
    await expect(rows(list)).toHaveCount(3, { timeout: 30_000 });
    await expect(list.getByText(MISSING)).toBeVisible();
    const section = list.getByLabel(physicianText.bank.sectionLabel, { exact: true });
    await section.selectOption('english');
    await expect(rows(list)).toHaveCount(1);
    await expect(list.getByText(MISSING)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await section.selectOption('clinical');
    await expect(rows(list)).toHaveCount(2);
    await expect(list.getByText(MISSING)).toHaveCount(0);
    await section.selectOption('english');
    await rows(list).first().click();

    // El editor lee el texto y la pregunta en inglés, pide la fuente y no deja mandar sin ella
    const prompt = page.getByLabel(editor.case.promptEnglish, { exact: true });
    await expect(prompt).toHaveValue(first.prompt, { timeout: 30_000 });
    await expect(prompt).toHaveAttribute('lang', 'en');
    await expect(page.getByText(editor.language.note)).toBeVisible();
    const source = page.getByRole('region', { name: editor.passage.title });
    await expect(source.getByText(MISSING)).toBeVisible();
    const submit = page.getByRole('region', { name: review.submit.title });
    await expect(submit.getByRole('button', { name: review.submit.action })).toBeDisabled();
    await expect(submit.getByText(MISSING)).toBeVisible();
    // La base tampoco la recibe: BK005 y la versión sigue en borrador
    const refused = editorialRpc(bank, 'editor_submit', callerOf(ana), { p_version_id: first.id });
    expect(refused.status).toBe(400);
    expect(refused).toMatchObject({ json: { code: 'BK005' } });
    expect(latestOf(bank, english.questionId).status).toBe('draft');

    // Llena la fuente con una licencia CC BY. El enlace es obligatorio con esa licencia
    await source
      .getByLabel(editor.passage.sourceTitle, { exact: true })
      .fill('[Prueba] Artículo simulado');
    await source.getByLabel(editor.passage.license, { exact: true }).selectOption('CC BY');
    await expect(source.getByText(editor.passage.urlMissing)).toBeVisible();
    await source
      .getByLabel(editor.passage.url, { exact: true })
      .fill('https://example.org/articulo');
    await expect(source.getByText(editor.passage.complete)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await page.getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(page.getByText(editor.save.saved)).toBeVisible();

    // Completa, la manda a revisión
    await page.getByRole('button', { name: review.submit.action }).click();
    await expect(page.getByText(review.submit.sent)).toBeVisible();
    await expect(page.getByText(review.waiting)).toBeVisible();
    const sent = latestOf(bank, english.questionId);
    expect(sent).toMatchObject({
      version: 2,
      status: 'in_review',
      language: 'en',
      authorId: ana.id,
      incomplete: [],
    });
    expect(sent.gpcRefs[0]?.title).toBe(
      `${PASSAGE_SOURCE_PREFIX}[Prueba] Artículo simulado. CC BY. https://example.org/articulo`,
    );

    // El revisor la etiqueta a ciegas con el texto en inglés y su fuente a la vista, y la aprueba
    const second = await openSecondDevice(browser, cloud, consoleErrors);
    const reviewer = second.page;
    await enterTeam(reviewer, cloud, REVIEWER.email);
    await reviewer.goto(SCREENS.agreement.path);
    const queue = reviewer.getByRole('region', { name: queueText.title });
    await expect(queue.getByText(queueText.remaining(1))).toBeVisible({ timeout: 30_000 });
    await queue.getByRole('link', { name: queueText.open }).click();
    const blind = reviewer.getByRole('region', { name: review.blind.title });
    await expect(blind).toBeVisible({ timeout: 30_000 });
    await expect(blind.getByText(sent.prompt)).toHaveAttribute('lang', 'en');
    const link = blind.getByRole('link', { name: /example\.org\/articulo/ });
    await expect(link).toHaveAttribute('href', 'https://example.org/articulo');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(blind.getByText(/Fuente del texto\./)).toBeVisible();
    await expectNoSeriousA11yViolations(reviewer);
    const distractors = sent.options.filter((option) => !option.isCorrect);
    for (const option of distractors) {
      await expect(reviewer.getByText(option.rationale)).toHaveCount(0);
    }
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
    const decide = reviewer.getByRole('region', { name: review.decide.title });
    await decide.getByRole('button', { name: review.decide.approve }).click();
    await expect(reviewer.getByText(review.decide.approvedPublished)).toBeVisible();

    // Quedó publicada con su idioma y su fuente, y lo de español no se tocó
    expect(latestOf(bank, english.questionId).status).toBe('approved');
    expect(bank.catalog.get(english.questionId)).toMatchObject({
      versionId: sent.id,
      version: 2,
      language: 'en',
      branch: 'medical_english',
    });
    for (const question of spanish) {
      expect(bank.catalog.has(question.questionId)).toBe(false);
    }
    await second.context.close();
  });

  test('una licencia que no se acepta deja el pendiente y se corrige desde el editor', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    const {
      bank,
      users: [ana, beto],
    } = teamBank(cloud, [AUTHOR, REVIEWER]);
    if (!ana || !beto) throw new Error('Faltan las cuentas del equipo');
    seedEnglishCases(bank, 1, { itemsPerCase: 1 });
    const [english] = asDraftWithoutSource(bank, ana.id);
    if (!english) throw new Error('Sin pregunta en inglés');
    assignQuestion(bank, english.questionId, ana.id, 'author');
    assignQuestion(bank, english.questionId, beto.id, 'reviewer');
    // Como llega del Sheet con CC BY-NC en la columna de la licencia
    const version = latestOf(bank, english.questionId);
    version.gpcRefs = [
      {
        title: `${PASSAGE_SOURCE_PREFIX}[Prueba] Artículo simulado. CC BY-NC. https://example.org/articulo`,
        status: 'to_verify',
      },
    ];
    version.incomplete = ['license_not_allowed'];

    await enterTeam(page, cloud, AUTHOR.email);
    await page.goto(`${SCREENS.questionEditor.path}?pregunta=${english.questionId}`);
    const source = page.getByRole('region', { name: editor.passage.title });
    const license = source.getByLabel(editor.passage.license, { exact: true });
    await expect(license).toHaveValue('CC BY-NC', { timeout: 30_000 });
    await expect(source.getByText(editor.passage.licenseNotAllowed)).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: review.submit.title })
        .getByText(physicianText.incomplete.license_not_allowed),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: review.submit.title })
        .getByRole('button', { name: review.submit.action }),
    ).toBeDisabled();

    // Elige una licencia de la lista, guarda y ya se puede mandar
    await license.selectOption('CC BY-SA');
    await expect(source.getByText(editor.passage.complete)).toBeVisible();
    await page.getByRole('button', { name: t.settings.saveChanges }).click();
    await expect(page.getByText(editor.save.saved)).toBeVisible();
    await expect(page.getByRole('button', { name: review.submit.action })).toBeEnabled();
    expect(latestOf(bank, english.questionId)).toMatchObject({
      version: 2,
      language: 'en',
      incomplete: [],
    });
    expect(latestOf(bank, english.questionId).gpcRefs[0]?.title).toContain('CC BY-SA');
  });

  test('el caso en inglés publicado llega al alumno con el banco abierto, en la tarjeta de Inglés médico', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(180_000);
    // Lo que deja la aprobación del revisor, sembrado aparte para no depender del recorrido de arriba
    const bank = createFakeBankStore();
    attachBank(cloud, bank);
    seedBank(bank, 5);
    seedEnglishCases(bank, 1, { itemsPerCase: 2 });
    const published = [...bank.catalog.values()].filter((row) => row.language === 'en');
    expect(published).toHaveLength(2);
    expect(published.every((row) => row.branch === 'medical_english')).toBe(true);

    openBank(cloud);
    await enterWithLink(page, cloud, STUDENT, 'Alumna');
    await reloadWithServerFlags(page);
    await page.goto(SCREENS.simulatorSetup.path);
    // La tarjeta de Inglés médico de Simular es del paquete B (2.1 del plan de B13). Su título es un
    // encabezado, y la práctica de inglés lee del mismo catálogo que ya pidió la pantalla
    await expect(page.getByRole('heading', { name: /Inglés médico/ })).toBeVisible({
      timeout: 60_000,
    });
    expect(cloud.calls.some((call) => call.path.endsWith('/rpc/catalog_changes'))).toBe(true);
    await expectNoSeriousA11yViolations(page);
  });
});
