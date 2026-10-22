// Capturas de instalación de la PWA (B17, 5.4 del plan de B17). Las tres imágenes que el manifest ofrece en
// el diálogo de instalación, public/screenshots/*.webp, se rehacen con la app de hoy, que cambió de paleta
// y de navegación desde que se tomaron (B16 las dejó viejas). Se toman sobre el build de demostración con
// los datos de demostración generados, así que se ve el aviso Versión de demostración y los datos
// simulados, que es lo correcto. Solo se publican en la demo y en desarrollo: el build de producción las quita del
// manifest y de la carpeta de salida (withoutDemoScreenshots en vite.config.ts), para que el diálogo de instalación
// del dominio de verdad no enseñe la versión de demostración. Teléfono de 390 por 844 (Inicio y Repasar) y computadora de 1280 por 800
// (Inicio), las medidas que declara el manifest en vite.config.ts. Las convierte a webp el mismo
// Chromium de Playwright con un canvas, como scripts/generate-icons.ts hace con los íconos, sin agregar
// ninguna dependencia. Solo corren los proyectos 390-claro y 1280-claro:
// npm run screenshots:v3 -- b17-instalacion.spec.ts --project=390-claro --project=1280-claro
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { generateDemo } from '../../e2e/support/b1';

const OUT_DIR = join(import.meta.dirname, '..', '..', '..', 'public', 'screenshots');

/** Calidad del webp. Con 0.8 pesan lo mismo que las anteriores, de 25 a 85 KB */
const WEBP_QUALITY = 0.8;

/** La toma de la ventana tal como se ve, convertida a webp con el Chromium de la prueba */
async function windowAsWebp(page: Page): Promise<Buffer> {
  // Ningún esqueleto de carga a la vista. Son varios a la vez, así que se cuentan en lugar de esperar uno
  await expect(page.getByText(t.states.loading.label, { exact: true })).toHaveCount(0, {
    timeout: 90_000,
  });
  await page.waitForLoadState('networkidle');
  const png = await page.screenshot({ type: 'png' });
  const converter = await page.context().newPage();
  try {
    await converter.goto('about:blank');
    const base64 = await converter.evaluate(
      async ([source, quality]) => {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${source}`)).blob(),
        );
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Sin canvas para convertir la captura');
        context.drawImage(bitmap, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = '';
        for (const byte of bytes) text += String.fromCharCode(byte);
        return btoa(text);
      },
      [png.toString('base64'), WEBP_QUALITY] as const,
    );
    return Buffer.from(base64, 'base64');
  } finally {
    await converter.close();
  }
}

/** Una pantalla lista para la foto, con su región más lenta ya pintada */
async function ready(page: Page, path: string, settle?: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  if (settle) {
    await page
      .getByRole('region', { name: settle })
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
  }
  // El panel del tour de B15 no se ofrece solo aquí, pero un aviso encima arruinaría la imagen
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('capturas de instalación del manifest, teléfono y computadora', async ({ page }, info) => {
  const project = info.project.name;
  if (project !== '390-claro' && project !== '1280-claro') return;
  test.setTimeout(600_000);
  await generateDemo(page);

  if (project === '390-claro') {
    await ready(page, '/', t.home.topicsTitle);
    writeFileSync(join(OUT_DIR, 'inicio-telefono.webp'), await windowAsWebp(page));
    await ready(page, SCREENS.review.path);
    writeFileSync(join(OUT_DIR, 'repasar-telefono.webp'), await windowAsWebp(page));
  } else {
    await ready(page, '/', t.home.topicsTitle);
    writeFileSync(join(OUT_DIR, 'inicio-computadora.webp'), await windowAsWebp(page));
  }
});
