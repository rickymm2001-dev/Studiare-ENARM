// Capturas de cierre de B13, Inglés médico (6.4 del plan de B13). Simular con la tarjeta de inglés Sin textos,
// Calibrando y Lista, una pregunta de inglés en lectura (con el texto plegado en el teléfono), su
// retroalimentación, el examen completo con la casilla de la parte en inglés, los resultados por sección y
// la tarjeta de Progreso en calibrando y con cifras. Del paquete C además el mazo de vocabulario con su
// fuente, el editor del médico con la fuente del texto y el banco con el filtro Sección. Corren contra el
// build con la nube y el Supabase simulado de las e2e de nube, con el banco de fakeEditorial.ts, como las
// de b11.spec.ts, y quedan en docs/screenshots/v3/b13, en 390, 1280 y 1920 y en claro y en oscuro (86
// imágenes, unos 7 MB, porque las pantallas largas se capturan solo en lo que importa):
// npm run screenshots:v3 -- b13.spec.ts
//
// Lo que se busca en las pantallas del alumno, que son del paquete B, se junta en el objeto B de abajo y sale
// de englishText, el mismo texto que pinta la app. Los textos del mazo, del editor y del banco son del
// paquete C y salen de physicianText y deckCatalogText. Los casos de lectura salen de seedEnglishCases
// (fakeBankStore.ts, 6.3).
import type { Browser, BrowserContext, Locator, Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { deckCatalogText } from '@/i18n/cloudDecks';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { physicianText } from '@/i18n/physician';
import { callerOf, enterTeam, teamBank } from '../../e2e/support/bankTeam';
import {
  enterWithLink,
  expect,
  reloadWithServerFlags,
  test as cloudTest,
  watchConsole,
} from '../../e2e/support/cloudFixtures';
import { openBank, seedBank, seedCatalogDeck } from '../../e2e/support/fakeBank';
import {
  createFakeBankStore,
  seedEnglishCases,
  seedQuestions,
  type FakeBankStore,
} from '../../e2e/support/fakeBankStore';
import { assignQuestion, editorialRpc } from '../../e2e/support/fakeEditorial';
import { CLOUD_PREVIEW_URL } from '../../e2e/support/fakeSupabaseConfig';
import { attachBank, type FakeSupabaseServer } from '../../e2e/support/fakeSupabase';
import { isPhone, passageText } from '../../e2e/support/english';
import { answerPracticeQuestion } from '../../e2e/support/fixtures';
import { capture, outDirFor, type CaptureOptions } from './capture';

const B13_DIR = outDirFor('b13');
const DAY_MS = 86_400_000;

const AUTHOR = { email: 'autora.b13@ejemplo.mx', alias: 'Ana', role: 'physician' } as const;
const REVIEWER = { email: 'revisor.b13@ejemplo.mx', alias: 'Beto', role: 'physician' } as const;
const STUDENT = 'alumna.b13@ejemplo.mx';
const FREE_STUDENT = 'gratis.b13@ejemplo.mx';

/**
 * Lo que se busca en las pantallas del alumno del paquete B (src/i18n/english.ts y las pantallas de Simular,
 * de la pregunta, del resumen, del examen y de Progreso). Si una pantalla cambia su texto, se ajusta aquí
 */
const B = {
  /** La tarjeta de Inglés médico en Simular (2.1) */
  card: englishText.practice.title,
  /** Su título cuando todavía no hay textos */
  noTexts: englishText.practice.none.title,
  /** Su botón para empezar la práctica de inglés */
  start: englishText.practice.start,
  /** Su lista de cuántos textos se leen */
  count: englishText.practice.countLabel,
  /**
   * La nota Calibrando de los reactivos de inglés. La tarjeta trae otra del muestreo dirigido, que dice
   * Calibrando para un alumno sin errores etiquetados aunque los textos ya sean suficientes, así que se
   * distingue por la unidad que cuenta
   */
  calibrating: (card: Locator) =>
    card.getByRole('status').filter({ hasText: englishText.itemsUnit }),
  /** El avance de una práctica, Pregunta N de M, y no el Pregunta N de M de este texto */
  progress: /^Pregunta \d+ de \d+$/,
  /** La casilla de la parte en inglés del examen completo (3.7) */
  examCheckbox: englishText.exam.include,
  /** El corte por sección de los resultados del examen (3.6) */
  resultsBySection: englishText.results.sectionsTitle,
  /** La tarjeta de Inglés médico en Progreso (2.7) */
  progressCard: englishText.progress.title,
};

/** Un banco nuevo enganchado a la nube */
function newBank(cloud: FakeSupabaseServer): FakeBankStore {
  const bank = createFakeBankStore();
  attachBank(cloud, bank);
  return bank;
}

/** Abre una ruta y espera su título y lo que se pide antes de capturar */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

/**
 * Captura la página completa desde arriba. Después de un clic la página queda desplazada. Las pantallas muy
 * largas, como el resumen de una práctica, los resultados o Progreso, se capturan solo en el elemento o la
 * parte de arriba que importa, porque las 90 imágenes del bloque no deben pasar de unos 8 MB
 */
async function shot(page: Page, name: string, project: string, options: CaptureOptions = {}) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await capture(page, B13_DIR, name, project, options);
}

/**
 * El dispositivo del equipo o de otra cuenta, contra el build con la nube. openSecondDevice toma la
 * dirección del proyecto, que en las capturas es el build sin nube, y ahí cualquier cuenta se ve como alumno
 */
async function openCloudDevice(
  browser: Browser,
  cloud: FakeSupabaseServer,
  consoleErrors: string[],
): Promise<{ context: BrowserContext; page: Page }> {
  const use = cloudTest.info().project.use;
  const context = await browser.newContext({
    baseURL: CLOUD_PREVIEW_URL,
    serviceWorkers: 'block',
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
    locale: use.locale,
    timezoneId: use.timezoneId,
    reducedMotion: use.reducedMotion,
    colorScheme: use.colorScheme,
  });
  await cloud.attach(context);
  const page = await context.newPage();
  watchConsole(page, consoleErrors);
  return { context, page };
}

/** El alumno de pago con el banco abierto, como lo dejará Ricardo */
async function enterPaidStudent(page: Page, cloud: FakeSupabaseServer) {
  cloud.createUser({ email: STUDENT, alias: 'Ana' });
  cloud.setSubscription(STUDENT, {
    plan: 'monthly',
    status: 'active',
    provider: 'stripe',
    currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
  });
  openBank(cloud);
  await enterWithLink(page, cloud, STUDENT, 'Ana');
  await reloadWithServerFlags(page);
}

const setup = (page: Page) => page.getByRole('region', { name: t.simulator.setupTitle });

/** Abre la primera respuesta del resumen, sin cerrarla si ya viene abierta (las falladas lo están) */
async function openFirstAnswer(page: Page) {
  const answer = page.locator('ol > li > details').first();
  if (!(await answer.evaluate((element: HTMLDetailsElement) => element.open))) {
    await answer.locator('> summary').click();
  }
  await expect(answer).toHaveAttribute('open', '');
}

cloudTest.describe('Inglés médico', () => {
  cloudTest.use({ baseURL: CLOUD_PREVIEW_URL, serviceWorkers: 'block' });

  cloudTest(
    'B13. Simular, práctica de inglés, retroalimentación, examen, resultados y Progreso',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(900_000);
      const project = info.project.name;
      const bank = newBank(cloud);
      seedBank(bank, 250);
      await enterPaidStudent(page, cloud);

      // Sin textos. El banco abierto tiene 250 en español y ningún caso de lectura
      await open(page, SCREENS.simulatorSetup.path, setup(page));
      const english = () => page.getByRole('region', { name: B.card });
      await expect(english().getByText(B.noTexts)).toBeVisible();
      await shot(page, '01-simular-sin-textos', project);

      // Calibrando. Dos casos, uno de dos preguntas y otro de tres, o sea 5 de 30
      seedEnglishCases(bank, 1, { itemsPerCase: 2 });
      seedEnglishCases(bank, 1, { itemsPerCase: 3 });
      await open(page, SCREENS.simulatorSetup.path, setup(page));
      await expect(B.calibrating(english())).toBeVisible();
      await shot(page, '02-simular-calibrando', project);

      // Lista. 11 casos con 32 reactivos. La nota de Calibrando de los reactivos se va y queda la del
      // muestreo dirigido, que es de otra cosa
      seedEnglishCases(bank, 9, { itemsPerCase: 3 });
      await open(page, SCREENS.simulatorSetup.path, setup(page));
      await expect(english().getByRole('button', { name: B.start })).toBeEnabled();
      await expect(B.calibrating(english())).toHaveCount(0);
      await shot(page, '03-simular-lista', project);

      // Una práctica de inglés. El texto en inglés, su fuente y la pregunta, y en el teléfono el texto
      // se pliega desde la segunda pregunta del caso
      await english().getByRole('button', { name: B.start }).click();
      await expect(passageText(page)).toBeVisible({ timeout: 60_000 });
      const first = page.getByText(B.progress);
      await expect(first).toBeVisible();
      const total = Number(/de (\d+)$/.exec(await first.innerText())?.[1] ?? '0');
      await shot(page, '04-pregunta-ingles', project);
      await answerPracticeQuestion(page, 1, total);
      // Un texto trae 2 o 3 preguntas y esta es la segunda de las de su texto
      await expect(page.getByText(/^Pregunta 2 de [23] de este texto$/)).toBeVisible();
      // El texto solo se pliega en el teléfono. En pantallas anchas se ve igual que la primera
      if (isPhone(page)) {
        await expect(page.getByRole('button', { name: englishText.reading.show })).toBeVisible();
        await shot(page, '05-pregunta-ingles-texto-plegado', project);
      }

      // La retroalimentación llega al final, en el resumen (D-087), en español y con el texto en inglés
      // plegado y su fuente a la vista
      for (let number = 2; number <= total; number += 1) {
        await answerPracticeQuestion(page, number, total);
      }
      await openFirstAnswer(page);
      await shot(page, '06-retroalimentacion', project, {
        element: page.locator('ol > li').first(),
      });

      // El examen completo con la casilla de la parte en inglés
      await open(page, SCREENS.simulatorSetup.path, setup(page));
      const exam = page.getByRole('region', { name: t.exam.cardTitle });
      await expect(exam.getByRole('checkbox', { name: B.examCheckbox })).toBeVisible();
      await shot(page, '07-examen-casilla-ingles', project);
      await exam.getByRole('combobox', { name: t.exam.size }).selectOption('20');
      await exam.getByRole('button', { name: t.exam.start }).click();
      await expect(page).toHaveURL(new RegExp(`${SCREENS.exam.path}$`));
      await expect(page.getByRole('timer')).toBeVisible();
      await page.getByRole('button', { name: t.exam.finish }).click();
      await page.getByRole('dialog').getByRole('button', { name: t.exam.finishConfirm }).click();
      await expect(page).toHaveURL(new RegExp(`${SCREENS.examResults.path}$`));
      await expect(page.getByText(t.examResults.saving)).toHaveCount(0, { timeout: 90_000 });
      await expect(page.getByRole('region', { name: B.resultsBySection })).toBeVisible();
      // La parte de arriba trae Por sección y Por rama, y lo demás es la lista de las 20 preguntas
      await shot(page, '08-resultados-por-seccion', project, { maxHeight: 1300 });

      // Progreso. La tarjeta de inglés dice Calibrando con pocas respuestas
      await open(page, SCREENS.progress.path);
      const card = page.getByRole('region', { name: B.progressCard });
      await expect(card).toBeVisible();
      // Llevas los reactivos de la práctica de arriba, y el examen se terminó en blanco
      await expect(card.getByText(englishText.progress.calibrating(20, total))).toBeVisible();
      await shot(page, '09-progreso-ingles-calibrando', project, { element: card });

      // Con 20 reactivos de inglés contestados salen las cifras. Una práctica de 10 textos trae unos 27
      await open(page, SCREENS.simulatorSetup.path, setup(page));
      await english().getByRole('combobox', { name: B.count }).selectOption('10');
      await english().getByRole('button', { name: B.start }).click();
      const progress = page.getByText(B.progress);
      await expect(progress).toBeVisible({ timeout: 60_000 });
      const all = Number(/de (\d+)$/.exec(await progress.innerText())?.[1] ?? '0');
      // Cada reactivo toma poco más de un minuto, como una lectura de verdad, y no los 0 s de una prueba
      const start = Date.now();
      for (let number = 1; number <= all; number += 1) {
        await page.clock.setFixedTime(new Date(start + number * 70_000));
        await answerPracticeQuestion(page, number, all);
      }
      await open(page, SCREENS.progress.path);
      const figures = page.getByRole('region', { name: B.progressCard });
      await expect(figures.getByText(englishText.progress.accuracyLabel)).toBeVisible();
      await shot(page, '10-progreso-ingles-cifras', project, { element: figures });
    },
  );

  cloudTest(
    'B13. Mazo de vocabulario en el catálogo para Gratis',
    async ({ page, cloud }, info) => {
      cloudTest.setTimeout(300_000);
      const project = info.project.name;
      const bank = newBank(cloud);
      // El vocabulario de MedlinePlus es de pago con vista previa en Gratis (8.16). Aquí es un mazo de
      // muestra con la marca [Prueba], de dos grupos de MedlinePlus
      const seeded = seedCatalogDeck(bank, {
        deckKey: 'vocabulario-ingles',
        subjectKey: 'corazon-y-circulacion',
        notes: 3,
      });
      const deck = seeded.deck;
      deck.name = '[Prueba] Vocabulario médico en inglés';
      deck.author = 'MedlinePlus.gov (NLM)';
      deck.preview = [
        {
          kind: 'basic',
          front: '<span lang="en">[Prueba] Term sample</span>',
          back: '[Prueba] Término de muestra<br><i>Fuente MedlinePlus.gov (NLM)</i>',
        },
      ];
      const version = deck.versions[0];
      const subject = version?.subjects[0];
      if (!version || !subject) throw new Error('Sin materia sembrada');
      subject.name = 'Corazón y circulación';
      subject.branch = 'medical_english';
      subject.topic = 'medical_vocabulary';
      version.subjects.push({
        ...subject,
        subjectKey: 'infecciones',
        name: 'Infecciones',
      });
      openBank(cloud);
      cloud.setFeatureFlags({ freeTrial: true, deckCatalogCloud: true });
      await enterWithLink(page, cloud, FREE_STUDENT, 'Gratis');
      await reloadWithServerFlags(page);
      const catalog = page.getByRole('region', { name: deckCatalogText.title });
      await open(page, SCREENS.decks.path, catalog);
      await expect(catalog.getByText(deck.name)).toBeVisible({ timeout: 60_000 });
      await catalog.getByText(deckCatalogText.subjects(2)).click();
      await catalog.getByText(deckCatalogText.preview).click();
      // exact, porque el pie de las materias empieza con la misma frase
      await expect(
        catalog.getByText(deckCatalogText.source.line('MedlinePlus.gov (NLM)', 'Dominio público'), {
          exact: true,
        }),
      ).toBeVisible();
      await shot(page, '11-mazo-vocabulario', project);
    },
  );

  cloudTest(
    'B13. Editor del médico con la fuente del texto y banco con el filtro Sección',
    async ({ browser, cloud, consoleErrors }, info) => {
      cloudTest.setTimeout(600_000);
      const project = info.project.name;
      const {
        bank,
        users: [ana, beto],
      } = teamBank(cloud, [AUTHOR, REVIEWER]);
      if (!ana || !beto) throw new Error('Faltan las cuentas del equipo');
      // Cuatro preguntas en español y dos casos de lectura en inglés que llegan sin su fuente
      const spanish = seedQuestions(bank, 4, { status: 'draft', origin: 'app', authorId: ana.id });
      seedEnglishCases(bank, 2, { itemsPerCase: 1 });
      const english = [...bank.versions.values()].filter((version) => version.language === 'en');
      if (english.length < 2) throw new Error('seedEnglishCases no dejó preguntas en inglés');
      for (const [index, version] of english.entries()) {
        version.status = 'draft';
        version.submittedAt = null;
        version.decidedAt = null;
        version.authorId = ana.id;
        version.source = 'app';
        // El primero llega sin fuente y el segundo con una licencia que no se acepta
        version.gpcRefs =
          index === 0
            ? []
            : [
                {
                  title:
                    'Fuente del texto. [Prueba] Artículo simulado. CC BY-NC. https://example.org/articulo',
                  status: 'to_verify',
                },
              ];
        version.incomplete = [index === 0 ? 'passage_source_missing' : 'license_not_allowed'];
        const question = bank.questions.get(version.questionId);
        if (question) {
          question.origin = 'app';
          question.sourceKey = null;
          question.publishedVersionId = null;
        }
        bank.catalog.delete(version.questionId);
      }
      const questions = [
        ...spanish.map((question) => question.questionId),
        ...english.map((version) => version.questionId),
      ];
      for (const questionId of questions) {
        assignQuestion(bank, questionId, ana.id, 'author');
        assignQuestion(bank, questionId, beto.id, 'reviewer');
      }
      // Ya hay un caso en inglés completo y en revisión, para que el banco muestre varios estados
      const [withoutSource] = english;
      if (!withoutSource) throw new Error('Sin pregunta en inglés');

      // La autora. El banco con el filtro Sección en Inglés
      const author = await openCloudDevice(browser, cloud, consoleErrors);
      const authorPage = author.page;
      await enterTeam(authorPage, cloud, AUTHOR.email);
      const list = authorPage.getByRole('region', { name: physicianText.bank.listTitle });
      await open(authorPage, SCREENS.questionBank.path, list);
      await expect(list.getByRole('link', { name: /^Abrir la pregunta/ })).toHaveCount(6, {
        timeout: 60_000,
      });
      await list
        .getByLabel(physicianText.bank.sectionLabel, { exact: true })
        .selectOption('english');
      await expect(list.getByRole('link', { name: /^Abrir la pregunta/ })).toHaveCount(2);
      await shot(authorPage, '12-banco-seccion', project);

      // El editor con la fuente a medias. Título y licencia, y el enlace que falta
      await open(
        authorPage,
        `${SCREENS.questionEditor.path}?pregunta=${withoutSource.questionId}`,
        authorPage.getByRole('region', { name: physicianText.questionEditor.passage.title }),
      );
      const source = authorPage.getByRole('region', {
        name: physicianText.questionEditor.passage.title,
      });
      await source
        .getByLabel(physicianText.questionEditor.passage.sourceTitle, { exact: true })
        .fill('[Prueba] Artículo simulado');
      await source
        .getByLabel(physicianText.questionEditor.passage.license, { exact: true })
        .selectOption('CC BY');
      await expect(source.getByText(physicianText.questionEditor.passage.urlMissing)).toBeVisible();
      await shot(authorPage, '13-editor-fuente-incompleta', project, { element: source });
      await source
        .getByLabel(physicianText.questionEditor.passage.url, { exact: true })
        .fill('https://example.org/articulo');
      await expect(source.getByText(physicianText.questionEditor.passage.complete)).toBeVisible();
      await shot(authorPage, '14-editor-fuente-completa', project);

      // El revisor la ve a ciegas con el texto en inglés y su fuente. Se deja lista para revisar
      await authorPage.getByRole('button', { name: t.settings.saveChanges }).click();
      await expect(authorPage.getByText(physicianText.questionEditor.save.saved)).toBeVisible();
      const reply = editorialRpc(bank, 'editor_submit', callerOf(ana), {
        p_version_id: bank.questions.get(withoutSource.questionId)?.latestVersionId ?? '',
      });
      expect(reply.status).toBe(200);
      const reviewer = await openCloudDevice(browser, cloud, consoleErrors);
      await enterTeam(reviewer.page, cloud, REVIEWER.email);
      await open(
        reviewer.page,
        `${SCREENS.questionEditor.path}?pregunta=${withoutSource.questionId}`,
        reviewer.page.getByRole('region', { name: physicianText.review.blind.title }),
      );
      await shot(reviewer.page, '15-editor-a-ciegas-ingles', project);
      await reviewer.context.close();
      await author.context.close();
    },
  );
});
