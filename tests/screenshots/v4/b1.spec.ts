// Capturas de V4-B1, densidad y espacio. Inicio, Repasar con su sesión, Progreso y Configuración, en
// docs/screenshots/v4/b1. Sirven para ver el antes y el después sin la auditoría completa de V4-B10
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo } from '../../e2e/support/b1';
import { capture } from '../v3/capture';

const OUT_DIR = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots', 'v4', 'b1');
mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, project: string, name: string, path: string, maxHeight?: number) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  // Simular y Tutor analizan toda la bitácora al abrir y tardan en salir del estado de carga
  await page.waitForTimeout(8000);
  await capture(page, OUT_DIR, name, project, maxHeight ? { maxHeight } : {});
}

test('densidad y espacio de V4-B1', async ({ page }, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, project, '01-inicio', '/');
  await shot(page, project, '02-repasar', SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible({ timeout: 60_000 });
  await capture(page, OUT_DIR, '03-repaso-frente', project);
  await page.getByRole('button', { name: t.review.show }).click();
  await capture(page, OUT_DIR, '04-repaso-respuesta', project);
  await shot(page, project, '05-progreso', SCREENS.progress.path, 2600);
  await shot(page, project, '06-configuracion', SCREENS.settings.path);
  await shot(page, project, '07-simular', SCREENS.simulatorSetup.path);
  await shot(page, project, '08-mazos', SCREENS.decks.path);
  await shot(page, project, '09-tutor', SCREENS.tutor.path);
  await shot(page, project, '10-party', SCREENS.party.path);
  await shot(page, project, '11-apuntes', SCREENS.outlines.path);
  await shot(page, project, '12-buscar-tarjetas', SCREENS.explore.path);
});
