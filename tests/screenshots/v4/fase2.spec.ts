// Capturas de la fase 2 del plan V4. Lo visual que cambió, el cristal de la barra superior y los docks, el
// plan de hoy dentro de Repasar, el orden de ramas del Calendario y las cifras por mazo, en
// docs/screenshots/v4/fase2
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { generateDemo } from '../../e2e/support/b1';
import { capture } from '../v3/capture';

const OUT_DIR = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots', 'v4', 'fase2');
mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, project: string, name: string, path: string, maxHeight?: number) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(6000);
  await capture(page, OUT_DIR, name, project, maxHeight ? { maxHeight } : {});
}

test('capturas de la fase 2', async ({ page }, info) => {
  test.setTimeout(500_000);
  const project = info.project.name;
  await generateDemo(page);
  await shot(page, project, '01-inicio', '/');
  await shot(page, project, '02-repasar', SCREENS.review.path);
  await shot(page, project, '03-calendario', SCREENS.calendar.path, 3000);
  await shot(page, project, '04-mazos', SCREENS.decks.path, 3000);
});
