// Capturas de "antes" del rediseño (B2 del plan del cambio, D-119). Documentan la app como se veía
// al cerrar B1, y las imágenes de docs/screenshots/v3/antes son de esa app. Este recorrido ya corre
// contra la app de ahora, así que volver a correrlo no reproduce el antes. Se queda para que compile
// y para comparar, con cada captura apuntando a su equivalente actual. Todas las pantallas con los
// datos de demostración y los cuatro roles, más los flujos de práctica y examen y las páginas sin
// sesión, en teléfono claro y computadora clara y oscura; los anchos de 1920 y el teléfono oscuro se
// omiten para no cargar el repo de imágenes. Plan, Logros y Perfil se quitaron en B3 y ya no se
// capturan. Las pestañas de Configuración pasaron a una sola página y Estudio y Pomodoro a Ajustes
// del repaso, en Repasar, con los mismos nombres de captura.
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import {
  answerExamQuestions,
  enterAs,
  finishExam,
  generateDemo,
  reviewSettingsPanel,
  setPracticeFeedback,
  startExam,
} from '../../e2e/support/b1';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('antes');

/**
 * Las capturas de las pestañas de Configuración de antes y su lugar ahora. Configuración es una sola
 * página con anclas y Estudio y Pomodoro viven en Ajustes del repaso, el panel de Repasar (B3)
 */
const SETTINGS_SHOTS = [
  ['study', `${SCREENS.review.path}?ajustes=1`],
  ['appearance', `${SCREENS.settings.path}#apariencia`],
  ['pomodoro', `${SCREENS.review.path}?ajustes=pomodoro`],
  ['privacy', `${SCREENS.settings.path}#privacidad`],
  ['account', `${SCREENS.settings.path}#perfil`],
] as const;

/**
 * Abre una ruta, espera su título y captura. Un retraso en una región opcional no detiene el resto.
 * Con Ajustes del repaso abierto el resto de la página queda oculto para el lector de pantalla, así
 * que se espera el panel y no el h1
 */
async function shot(page: Page, project: string, name: string, path: string, settle?: string) {
  await page.goto(path);
  const ready = path.includes('?ajustes=')
    ? reviewSettingsPanel(page)
    : page.getByRole('heading', { level: 1 });
  await expect(ready).toBeVisible({ timeout: 60_000 });
  if (settle) {
    await page
      .getByRole('region', { name: settle })
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
  }
  await capture(page, OUT_DIR, name, project);
}

test('todas las pantallas antes del rediseño', async ({ page }, info) => {
  test.skip(
    info.project.name.startsWith('1920') || info.project.name === '390-oscuro',
    'Solo teléfono claro y computadora clara y oscura',
  );
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
  for (const [section, path] of SETTINGS_SHOTS) {
    await shot(page, project, `14-configuracion-${section}`, path);
  }
  await shot(page, project, '15-cambiar-rol', SCREENS.roleSelector.path);

  // Práctica con la retroalimentación después de cada pregunta, que se elige en Ajustes del repaso
  await setPracticeFeedback(page, 'each');
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
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

  // Examen corto, en curso y con resultados. Si el examen no arranca, el resto de las capturas sigue
  try {
    await startExam(page, 20);
    await expect(page.getByText(t.exam.progress(1, 20), { exact: true })).toBeVisible({
      timeout: 90_000,
    });
    await answerExamQuestions(page, 20, 2);
    await capture(page, OUT_DIR, '19-examen', project);
    await finishExam(page, { answered: 2, blank: 18, marked: 0 });
    await capture(page, OUT_DIR, '20-examen-resultados', project);
  } catch (error) {
    console.warn('Sin captura del examen', error instanceof Error ? error.message : error);
  }

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

test('páginas sin sesión antes del rediseño', async ({ page }, info) => {
  test.skip(
    info.project.name.startsWith('1920') || info.project.name === '390-oscuro',
    'Solo teléfono claro y computadora clara y oscura',
  );
  test.setTimeout(120_000);
  const project = info.project.name;
  await shot(page, project, '31-portada', '/');
  await shot(page, project, '32-bienvenida', SCREENS.onboarding.path);
  await shot(page, project, '33-privacidad', SCREENS.privacyNotice.path);
  await shot(page, project, '34-terminos', SCREENS.terms.path);
});
