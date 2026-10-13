// Modo oscuro (B2 del plan del cambio, D-121). Cada pantalla pasa axe también en oscuro, con la
// preferencia del sistema en oscuro y sin clase en <html>, que es como la ve quien no eligió tema.
// Las pantallas del alumno, del médico y del admin se recorren con los datos de demostración, así axe
// revisa listas, gráficas, heatmap, barras y tarjetas con contenido y no solo el aviso de sin sesión.
// La práctica y el examen se recorren de verdad, con una cuenta nueva
import type { Page } from '@playwright/test';
import { SCREEN_KEYS, SCREENS, type ScreenKey } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  answerExamQuestions,
  enterAs,
  finishExam,
  generateDemo,
  reviewSettingsPanel,
  setPracticeFeedback,
  startExam,
} from './support/b1';
import { expect, expectNoSeriousA11yViolations, signUp, test } from './support/fixtures';

test.use({ colorScheme: 'dark' });

/** Sin sesión. La raíz es la portada */
const PUBLIC: readonly ScreenKey[] = ['home', 'onboarding', 'privacyNotice', 'terms'];

/** Con la sesión de la demostración. La región que se espera es la que más tarda en cargar */
const STUDENT: readonly (readonly [ScreenKey, string?])[] = [
  ['home', t.home.topicsTitle],
  ['review'],
  ['decks'],
  ['explore'],
  ['outlines'],
  ['simulatorSetup', t.exam.cardTitle],
  ['progress', t.progress.futureLoad.title],
  ['tutor', t.tutor.report.title],
  ['party'],
  ['subscription'],
  ['roleSelector'],
];

/**
 * Configuración es una sola página desde B3 y los ajustes del repaso viven en un panel de Repasar
 * que se abre con ?ajustes=1 y ?ajustes=pomodoro
 */
const PANEL_PATHS = [`${SCREENS.review.path}?ajustes=1`, `${SCREENS.review.path}?ajustes=pomodoro`];

/** Solo existen con una práctica o un examen en curso o recién terminado */
const FLOWS: readonly ScreenKey[] = [
  'question',
  'feedback',
  'sessionSummary',
  'exam',
  'examResults',
];

const PHYSICIAN = SCREEN_KEYS.filter((key) => SCREENS[key].area === 'physician');
const ADMIN = SCREEN_KEYS.filter((key) => SCREENS[key].area === 'admin');

/**
 * Abre una ruta, espera su título y lo que carga aparte, y pasa axe. Con el panel de ajustes abierto,
 * el resto de la página queda fuera del árbol de accesibilidad, como pide un diálogo modal, así que
 * se espera el panel con sus partes en lugar del h1
 */
async function checkScreen(
  page: Page,
  path: string,
  settle?: string,
  inPanel = false,
): Promise<void> {
  await page.goto(path);
  const scope = inPanel ? reviewSettingsPanel(page) : page.locator('body');
  await expect(inPanel ? scope : page.getByRole('heading', { level: 1 })).toBeVisible({
    timeout: 60_000,
  });
  if (settle) {
    await expect(scope.getByRole('region', { name: settle })).toBeVisible({ timeout: 60_000 });
  }
  // Los esqueletos de carga dicen Cargando solo al lector de pantalla. axe revisa el contenido
  await expect(page.getByText(t.states.loading.label, { exact: true }))
    .toHaveCount(0, { timeout: 30_000 })
    .catch(() => undefined);
  await expectNoSeriousA11yViolations(page);
}

test('el recorrido en oscuro cubre todas las pantallas', () => {
  const covered = new Set<ScreenKey>([
    ...PUBLIC,
    ...STUDENT.map(([key]) => key),
    'settings',
    ...FLOWS,
    ...PHYSICIAN,
    ...ADMIN,
  ]);
  expect(SCREEN_KEYS.filter((key) => !covered.has(key))).toEqual([]);
});

test('en oscuro las páginas sin sesión pasan axe', async ({ page }) => {
  for (const key of PUBLIC) await checkScreen(page, SCREENS[key].path);
});

test('en oscuro las pantallas con los datos de demostración pasan axe', async ({ page }) => {
  test.setTimeout(900_000);
  await generateDemo(page);
  for (const [key, settle] of STUDENT) await checkScreen(page, SCREENS[key].path, settle);
  await checkScreen(page, SCREENS.settings.path, t.settingsPage.sections.privacy);
  for (const path of PANEL_PATHS) await checkScreen(page, path, t.dailyLoad.title, true);

  await enterAs(page, 'physician');
  for (const key of PHYSICIAN) await checkScreen(page, SCREENS[key].path);
  await enterAs(page, 'admin');
  for (const key of ADMIN) await checkScreen(page, SCREENS[key].path);
});

test('en oscuro Inicio de una cuenta nueva y la práctica pasan axe', async ({ page }) => {
  test.setTimeout(300_000);
  await signUp(page);
  await expectNoSeriousA11yViolations(page);

  // Retroalimentación después de cada pregunta, para ver la pregunta, la retroalimentación y el
  // resumen. Se elige en Ajustes del repaso, su único lugar
  await setPracticeFeedback(page, 'each');
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5))).toBeVisible();
  await page.getByRole('radio').first().check();
  await expectNoSeriousA11yViolations(page);
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await expect(page.getByRole('button', { name: t.simulator.next })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  for (let index = 2; index <= 5; index += 1) {
    await page.getByRole('button', { name: t.simulator.next }).click();
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
    await expect(
      page.getByRole('button', { name: index === 5 ? t.simulator.finish : t.simulator.next }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: t.simulator.finish }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  await expectNoSeriousA11yViolations(page);
});

test('en oscuro el examen en curso y sus resultados pasan axe', async ({ page }) => {
  test.setTimeout(300_000);
  // Una cuenta aparte, porque el examen no repite las preguntas que ya contestó en la práctica
  await signUp(page);
  await startExam(page, 20);
  await answerExamQuestions(page, 20, 2);
  await expectNoSeriousA11yViolations(page);
  await finishExam(page, { answered: 2, blank: 18, marked: 0 });
  await expectNoSeriousA11yViolations(page);
});
