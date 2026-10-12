// Ayudante de las capturas de los bloques V3. Una imagen JPEG de página completa por pantalla y
// proyecto, en docs/screenshots/v3/<bloque>
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { t } from '@/i18n/es-MX';

export function outDirFor(block: string): string {
  const dir = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots', 'v3', block);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function capture(page: Page, dir: string, name: string, projectName: string) {
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // La barra fija del teléfono sale a media imagen en una captura de página completa
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  await page.screenshot({
    path: join(dir, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage: true,
  });
}
