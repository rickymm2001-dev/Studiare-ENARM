// Capturas de cierre de B4 y B5 del plan del cambio (D-123 y D-124). Repasar y Mazos con los temas de
// cada mazo, Buscar tarjetas con su panel, la revisión del examen con Crear tarjeta y los motivos de
// error, y Progreso con el reparto de motivos por rama. Quedan en docs/screenshots/v3/b4 y b5. El
// recorrido completo va en teléfono claro y computadora clara y oscura, y lo clave además en 1920 y
// en el teléfono oscuro, como en b2.spec.ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  answerExamQuestions,
  finishExam,
  followSmallestDeck,
  generateDemo,
  startExam,
} from '../../e2e/support/b1';
import { cardPanel, openCard, resultRows } from '../../e2e/support/cardSearch';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const B4_DIR = outDirFor('b4');
const B5_DIR = outDirFor('b5');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

/** Abre una ruta, espera su título y captura. Un retraso en una región opcional no detiene el resto */
async function shot(page: Page, dir: string, project: string, name: string, path: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await capture(page, dir, name, project);
}

/** Captura lo que se ve, sin página completa, para hojas y diálogos que cubren la pantalla */
async function viewport(page: Page, dir: string, name: string, project: string) {
  await page.screenshot({ path: `${dir}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

/** Abre la primera pregunta fallada de la revisión del examen y devuelve su fila */
async function openFirstMissed(page: Page): Promise<Locator> {
  const review = page.getByRole('region', { name: t.examResults.reviewTitle });
  await review.getByRole('button', { name: t.examResults.filter.missed }).click();
  const row = review.locator('ol > li').first();
  await row.locator('summary').click();
  await expect(
    row.getByRole('button', { name: /^Crear tarjeta de la pregunta \d+$/ }),
  ).toBeVisible();
  return row;
}

test('B4. Temas de cada mazo y Buscar tarjetas', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, B4_DIR, project, '01-repasar', SCREENS.review.path);
  if (!FULL_WALK(project)) {
    await shot(page, B4_DIR, project, '03-buscar-tarjetas', SCREENS.explore.path);
    return;
  }
  await shot(page, B4_DIR, project, '02-mazos', SCREENS.decks.path);
  await shot(page, B4_DIR, project, '03-buscar-tarjetas', SCREENS.explore.path);
  const first = resultRows(page).first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  await openCard(first);
  await expect(cardPanel(page)).toBeVisible();
  await viewport(page, B4_DIR, '04-buscar-tarjetas-panel', project);
});

test('B5. Revisión del examen con Crear tarjeta y motivos de error', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(600_000);
  const project = info.project.name;
  await signUp(page);
  await followSmallestDeck(page);
  await startExam(page, 20);
  await answerExamQuestions(page, 20, 20);
  await finishExam(page, { answered: 20, blank: 0, marked: 0 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
  const row = await openFirstMissed(page);
  await row.scrollIntoViewIfNeeded();
  await capture(page, B5_DIR, '01-revision-del-examen', project);
  await row.getByRole('button', { name: /^Crear tarjeta de la pregunta \d+$/ }).click();
  await expect(page.getByRole('dialog', { name: t.examReview.createCard.title })).toBeVisible();
  await viewport(page, B5_DIR, '02-crear-tarjeta', project);
});

test('B5. Progreso con el reparto de motivos por rama', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, B5_DIR, project, '03-progreso', SCREENS.progress.path);
});
