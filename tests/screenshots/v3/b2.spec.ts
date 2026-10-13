// Capturas de "después" del rediseño (B2 del plan del cambio, D-121). Las mismas pantallas que en
// antes.spec.ts, con los datos de demostración y los cuatro roles, los flujos de práctica y examen y
// las páginas sin sesión, en docs/screenshots/v3/b2. El recorrido completo va en teléfono claro y
// computadora clara y oscura, y las pantallas clave además en 1920 y en el teléfono oscuro, para
// cubrir los tres anchos en claro y en oscuro que pide 0.3 del plan sin cargar el repo de imágenes.
// Plan, Logros y Perfil se quitaron en B3 y ya no se capturan
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  answerExamQuestions,
  enterAs,
  finishExam,
  generateDemo,
  startExam,
} from '../../e2e/support/b1';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('b2');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

/** Abre una ruta, espera su título y captura. Un retraso en una región opcional no detiene el resto */
async function shot(page: Page, project: string, name: string, path: string, settle?: string) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  if (settle) {
    await page
      .getByRole('region', { name: settle })
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
  }
  await capture(page, OUT_DIR, name, project);
}

test('todas las pantallas después del rediseño', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(900_000);
  const project = info.project.name;

  // Alumno con la demostración
  await generateDemo(page);
  await shot(page, project, '01-inicio', '/', t.home.topicsTitle);
  await shot(page, project, '02-repasar', SCREENS.review.path);
  await shot(page, project, '03-mazos', SCREENS.decks.path);
  await shot(page, project, '04-explorar', SCREENS.explore.path);
  await shot(page, project, '05-apuntes', SCREENS.outlines.path);
  await shot(page, project, '06-simular', SCREENS.simulatorSetup.path, t.exam.cardTitle);
  await shot(page, project, '07-progreso', SCREENS.progress.path, t.progress.futureLoad.title);
  await shot(page, project, '09-tutor', SCREENS.tutor.path, t.tutor.report.title);
  await shot(page, project, '10-party', SCREENS.party.path);
  await shot(page, project, '13-suscripcion', SCREENS.subscription.path);
  for (const section of ['study', 'appearance', 'pomodoro', 'privacy', 'account'] as const) {
    await shot(
      page,
      project,
      `14-configuracion-${section}`,
      `${SCREENS.settings.path}?seccion=${section}`,
    );
  }
  await shot(page, project, '15-cambiar-rol', SCREENS.roleSelector.path);

  // Práctica con la retroalimentación después de cada pregunta
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  await practice.getByRole('combobox', { name: t.settings.practiceFeedback }).selectOption('each');
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5))).toBeVisible();
  await page.getByRole('radio').first().check();
  await capture(page, OUT_DIR, '16-pregunta', project);
  await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
  await page.getByRole('button', { name: t.simulator.next }).waitFor();
  await capture(page, OUT_DIR, '17-retroalimentacion', project);
  for (let index = 2; index <= 5; index += 1) {
    await page.getByRole('button', { name: t.simulator.next }).click();
    await page.getByRole('radio').first().check();
    await page.getByRole('button', { name: t.simulator.answer, exact: true }).click();
    await page
      .getByRole('button', { name: index === 5 ? t.simulator.finish : t.simulator.next })
      .waitFor();
  }
  await page.getByRole('button', { name: t.simulator.finish }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.sessionSummary.title);
  await capture(page, OUT_DIR, '18-resumen', project);

  // Médico
  await enterAs(page, 'physician');
  await shot(page, project, '21-medico-banco', SCREENS.questionBank.path);
  await shot(page, project, '22-medico-editor', SCREENS.questionEditor.path);
  await shot(page, project, '23-medico-acuerdo', SCREENS.agreement.path);
  await shot(page, project, '24-medico-borradores', SCREENS.aiDrafts.path);
  await shot(page, project, '25-medico-reportes', SCREENS.contentReports.path);
  await shot(page, project, '26-medico-importar', SCREENS.bankImport.path);

  // Admin
  await enterAs(page, 'admin');
  await shot(page, project, '27-admin-usuarios', SCREENS.adminUsers.path);
  await shot(page, project, '28-admin-costos', SCREENS.aiCosts.path);
  await shot(page, project, '29-admin-configuracion', SCREENS.adminSettings.path);
  await shot(page, project, '30-admin-demo', SCREENS.demoData.path);
});

test('examen en curso y resultados después del rediseño', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(300_000);
  const project = info.project.name;
  await signUp(page);
  await startExam(page, 20);
  await answerExamQuestions(page, 20, 2);
  await capture(page, OUT_DIR, '19-examen', project);
  await finishExam(page, { answered: 2, blank: 18, marked: 0 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.screens.examResults.title);
  await capture(page, OUT_DIR, '20-examen-resultados', project);
});

test('páginas sin sesión después del rediseño', async ({ page }, info) => {
  test.skip(!FULL_WALK(info.project.name), 'Solo teléfono claro y computadora clara y oscura');
  test.setTimeout(120_000);
  const project = info.project.name;
  await shot(page, project, '31-portada', '/');
  await shot(page, project, '32-bienvenida', SCREENS.onboarding.path);
  await shot(page, project, '33-privacidad', SCREENS.privacyNotice.path);
  await shot(page, project, '34-terminos', SCREENS.terms.path);
});

test('pantallas clave en 1920 y en el teléfono oscuro', async ({ page }, info) => {
  test.skip(FULL_WALK(info.project.name), 'El recorrido completo ya cubre este proyecto');
  test.setTimeout(600_000);
  const project = info.project.name;
  await shot(page, project, '31-portada', '/');
  await generateDemo(page);
  await shot(page, project, '01-inicio', '/', t.home.topicsTitle);
  await shot(page, project, '02-repasar', SCREENS.review.path);
  await shot(page, project, '06-simular', SCREENS.simulatorSetup.path, t.exam.cardTitle);
  await shot(page, project, '07-progreso', SCREENS.progress.path, t.progress.futureLoad.title);
  await shot(
    page,
    project,
    '14-configuracion-appearance',
    `${SCREENS.settings.path}?seccion=appearance`,
  );
});
