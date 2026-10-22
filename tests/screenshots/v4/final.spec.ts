// Capturas finales de V4-B10. Las pantallas principales del alumno, en 390, 1280 y 1920 px, en claro y
// en oscuro, en docs/screenshots/v4/final. Son la evidencia de la auditoría final y sirven para comparar
// después de cualquier cambio de apariencia
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { examTotalMs } from '@/engines/exam';
import { t } from '@/i18n/es-MX';
import { generateDemo } from '../../e2e/support/b1';
import { capture } from '../v3/capture';

const OUT_DIR = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots', 'v4', 'final');
mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, project: string, name: string, path: string, maxHeight?: number) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  // Simular y Tutor analizan toda la bitácora al abrir y tardan en salir del estado de carga
  await page.waitForTimeout(6000);
  await capture(page, OUT_DIR, name, project, maxHeight ? { maxHeight } : {});
}

test('capturas finales de V4-B10', async ({ page }, info) => {
  test.setTimeout(900_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, project, '01-inicio', '/');
  await shot(page, project, '02-repasar', SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: t.review.show }).click();
  await capture(page, OUT_DIR, '03-repaso-respuesta', project);
  await shot(page, project, '04-progreso', SCREENS.progress.path, 2600);
  await shot(page, project, '05-calendario', SCREENS.calendar.path, 2400);
  await shot(page, project, '06-simular', SCREENS.simulatorSetup.path);
  await shot(page, project, '07-mazos', SCREENS.decks.path, 2600);
  await shot(page, project, '08-apuntes', SCREENS.outlines.path);
  await shot(page, project, '09-buscar', SCREENS.explore.path);
  await shot(page, project, '10-configuracion', SCREENS.settings.path, 2600);
  await shot(page, project, '11-party', SCREENS.party.path);

  // Examen corto con la hoja de respuestas, con una burbuja llena
  await page.goto(SCREENS.simulatorSetup.path);
  const card = page.getByRole('region', { name: t.exam.cardTitle });
  await expect(card.getByText(t.exam.timeTotal(examTotalMs(20)))).toBeVisible({ timeout: 60_000 });
  await card.getByText(t.exam.settings, { exact: true }).click();
  await card.getByLabel(t.answerSheet.optionLabel).check();
  await card.getByRole('button', { name: t.exam.start }).click();
  await expect(page.getByRole('timer')).toBeVisible();
  await page
    .getByRole('radio', { name: t.answerSheet.bubble(1, 'B'), exact: true })
    .click({ force: true });
  await capture(page, OUT_DIR, '12-examen-hoja', project);
});
