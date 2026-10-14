// Capturas de la paleta de color (D-128). Color propio por rama en etiquetas, marcas y mazos, acento
// cálido en racha, nivel y XP y la escala de cinco pasos del heatmap, con la demostración generada
// para que haya datos. Inicio, Repasar, Simular, Progreso, Party y una pregunta de práctica con la
// etiqueta de su rama, en docs/screenshots/v3/paleta. Se toman en teléfono y computadora, claro y
// oscuro, y en 1920 claro:
// npm run screenshots:v3 -- paleta.spec.ts --project=390-claro --project=390-oscuro
// --project=1280-claro --project=1280-oscuro --project=1920-claro
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo } from '../../e2e/support/b1';
import { capture, outDirFor } from './capture';

const OUT_DIR = outDirFor('paleta');

/** Abre una ruta, espera su título y, si se pide, una región que tarda en llegar, y captura */
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

test('paleta de color en las pantallas del alumno con la demostración', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;

  await generateDemo(page);
  await shot(page, project, '01-inicio', '/', t.home.topicsTitle);
  await shot(page, project, '02-repasar', SCREENS.review.path);
  await shot(page, project, '06-simular', SCREENS.simulatorSetup.path, t.exam.cardTitle);
  await shot(page, project, '07-progreso', SCREENS.progress.path, t.progress.futureLoad.title);
  await shot(page, project, '10-party', SCREENS.party.path);

  // Una pregunta de práctica, con la etiqueta de rama y tema en el color de su rama
  await page.goto(SCREENS.simulatorSetup.path);
  const practice = page.getByRole('region', { name: t.simulator.setupTitle });
  await practice.getByRole('combobox', { name: t.simulator.count, exact: true }).selectOption('5');
  const start = practice.getByRole('button', { name: t.simulator.start });
  await expect(start).toBeEnabled({ timeout: 60_000 });
  await start.click();
  await expect(page.getByText(t.simulator.progress(1, 5))).toBeVisible();
  await capture(page, OUT_DIR, '16-pregunta', project);
});
