// Ayudante de las capturas de los bloques V3. Una imagen JPEG de página completa por pantalla y
// proyecto, en docs/screenshots/v3/<bloque>. Una pantalla muy larga puede capturarse solo desde arriba o
// solo en el elemento que importa, para que el bloque no pese de más
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { t } from '@/i18n/es-MX';

export function outDirFor(block: string): string {
  const dir = join(import.meta.dirname, '..', '..', '..', 'docs', 'screenshots', 'v3', block);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export interface CaptureOptions {
  /** Solo este elemento, por ejemplo una tarjeta de una pantalla larga */
  element?: Locator;
  /** Solo los primeros píxeles de la página, para una pantalla muy larga cuyo interés está arriba */
  maxHeight?: number;
}

export async function capture(
  page: Page,
  dir: string,
  name: string,
  projectName: string,
  options: CaptureOptions = {},
) {
  await page
    .getByText(t.states.loading.label, { exact: true })
    .waitFor({ state: 'detached' })
    .catch(() => undefined);
  await page.waitForLoadState('networkidle');
  // La barra fija del teléfono sale a media imagen en una captura de página completa
  await page.addStyleTag({
    content: `@media (max-width: 1023px) { nav[aria-label="${t.nav.label}"] { position: static !important; } }`,
  });
  const image = {
    path: join(dir, `${name}--${projectName}.jpg`),
    type: 'jpeg',
    // Calidad 60 para que cada toma de bloque pese la mitad en la historia del repo (revisión de B2)
    quality: 60,
  } as const;
  if (options.element) {
    // Un elemento más alto que la pantalla se captura por tramos, y la barra de arriba, que es sticky, saldría
    // a media imagen. En computadora el título de la pantalla, la racha y el nivel van con position fixed
    // sobre esa barra (TOP_BAR_SLOT), y también saldrían encima del elemento. Las sticky pasan a relative,
    // sin desplazamiento, y esas fixed a absolute, así quedan arriba de la página, que es donde están al
    // empezar, y no siguen a la captura
    await page.addStyleTag({
      content:
        '.sticky { position: relative !important; top: auto !important; bottom: auto !important; } ' +
        '.lg\\:fixed { position: absolute !important; }',
    });
    await options.element.screenshot(image);
    return;
  }
  if (options.maxHeight !== undefined) {
    const size = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.scrollHeight,
    }));
    await page.screenshot({
      ...image,
      fullPage: true,
      clip: { x: 0, y: 0, width: size.width, height: Math.min(options.maxHeight, size.height) },
    });
    return;
  }
  await page.screenshot({ ...image, fullPage: true });
}
