// Capturas de V4-B2, identidad visual. Inicio, Calendario, Progreso y un repaso, en
// docs/screenshots/v4/b2. Sirven para ver el papel cálido y los títulos en serif sin la auditoría
// completa de V4-B10
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo } from '../../e2e/support/b1';
import { capture } from '../v3/capture';

const OUT_DIR = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots', 'v4', 'b2');
mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, project: string, name: string, path: string, maxHeight?: number) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6000);
  await capture(page, OUT_DIR, name, project, maxHeight ? { maxHeight } : {});
}

test('identidad visual de V4-B2', async ({ page }, info) => {
  test.setTimeout(400_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, project, '01-inicio', '/');
  await shot(page, project, '02-calendario', SCREENS.calendar.path, 2400);
  await shot(page, project, '03-progreso', SCREENS.progress.path, 2200);
  await page.goto(SCREENS.review.path);
  await page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ }).click();
  await expect(page.getByRole('button', { name: t.review.show })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: t.review.show }).click();
  await capture(page, OUT_DIR, '04-repaso-respuesta', project);
});
