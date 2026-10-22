// Portada de venta con los lugares marcados para el texto de la agencia y los dos bloques opcionales, el del
// creador y el de testimonios (B17, 5.2 y 8.3 del plan de B17). Con los bloques vacíos la portada no cambia
// y no se baja ningún código de las reglas del texto. Con ellos llenos, desde una vista previa guardada en el
// navegador (la app publicada no tiene otra forma de recibir texto), aparecen entre los perfiles y los planes
// con su etiqueta de contenido de prueba. Todo pasa axe en claro y en oscuro, en teléfono y computadora.
import type { Page } from '@playwright/test';
import { LANDING_PREVIEW_KEY } from '@/features/landing/previewKey';
import { slotId } from '@/features/landing/slotId';
import { landingSlots } from '@/features/landing/slots';
import { t } from '@/i18n/es-MX';
import type { LandingCreator, LandingTestimonial } from '@/i18n/landing';
import { expect, expectNoSeriousA11yViolations, test } from './support/fixtures';

const creator: LandingCreator = {
  name: 'Persona de prueba',
  role: 'Rol de prueba, sin ninguna persona real',
  quote: 'Texto de prueba de la cita del creador.',
  photo: { file: 'creador-prueba.webp', alt: 'Retrato de prueba, sin ninguna persona real' },
};
const testimonials: LandingTestimonial[] = [
  {
    quote: 'Texto de prueba del primer testimonio.',
    who: 'Primera persona de prueba',
    permissionOn: '2026-10-01',
  },
  {
    quote: 'Texto de prueba del segundo testimonio, un poco más largo para ver cómo se acomoda.',
    who: 'Segunda persona de prueba',
    permissionOn: '2026-10-02',
  },
];

/** Deja la vista previa guardada antes de que cargue la app, como la dejaría quien la pega en la consola */
async function savePreview(page: Page, value: unknown): Promise<void> {
  await page.addInitScript(
    ([key, json]) => {
      localStorage.setItem(key, json);
    },
    [LANDING_PREVIEW_KEY, typeof value === 'string' ? value : JSON.stringify(value)] as const,
  );
}

/**
 * Un webp de verdad, hecho con el mismo Chromium de la prueba, para la foto de prueba. La app lo pide en
 * public/landing, donde no hay ningún archivo, y la prueba lo atiende por la red del navegador
 */
async function serveSamplePhoto(page: Page): Promise<void> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(96, 96);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Sin canvas');
    context.fillStyle = '#7a8a99';
    context.fillRect(0, 0, 96, 96);
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  await page.route('**/landing/creador-prueba.webp', (route) =>
    route.fulfill({ contentType: 'image/webp', body: Buffer.from(base64, 'base64') }),
  );
}

/** Las peticiones del código de las reglas del texto, que solo se baja con una vista previa */
function watchPreviewChunk(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (/\/assets\/preview-[^/]+\.js$/.test(request.url())) urls.push(request.url());
  });
  return urls;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`portada en modo ${scheme === 'light' ? 'claro' : 'oscuro'}`, () => {
    test.use({ colorScheme: scheme });

    test('con los bloques vacíos se ve completa, con sus lugares marcados, y pasa axe', async ({
      page,
    }) => {
      const chunk = watchPreviewChunk(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
      await expect(page).toHaveTitle(t.app.documentTitle(t.landing.documentTitle));
      // Cada lugar con texto lo pinta un elemento con su id y el mismo texto. meta no tiene elemento
      for (const slot of landingSlots(t.landing)) {
        if (slot.id.startsWith('meta.')) continue;
        await expect(page.locator(`[data-slot="${slot.id}"]`).first(), slot.id).toHaveText(
          slot.value,
        );
      }
      // El botón principal se repite en el cierre, que dice de qué lugar repite el texto. Ningún id sale dos veces
      await expect(page.locator('[data-slot="hero.cta"]')).toHaveCount(1);
      await expect(page.locator('[data-slot-repeat="hero.cta"]')).toHaveText(t.landing.cta);
      // Los dos bloques opcionales no pintan nada
      await expect(page.getByRole('region', { name: t.landing.testimonialsTitle })).toHaveCount(0);
      await expect(page.locator('[data-slot^="creator."]')).toHaveCount(0);
      await expect(page.locator('[data-slot^="testimonials."]')).toHaveCount(0);
      await expect(page.getByText(t.landing.sampleLabel)).toHaveCount(0);
      await expect(page.locator('img[src*="/landing/"]')).toHaveCount(0);
      // El resto de la portada sigue en su lugar
      await expect(page.getByRole('region', { name: t.landing.pricingTitle })).toBeVisible();
      await expect(page.getByRole('region', { name: t.landing.faqTitle })).toBeVisible();
      await expectNoSeriousA11yViolations(page);
      // Sin vista previa guardada no se baja el código de las reglas del texto
      expect(chunk).toEqual([]);
    });

    test('con los bloques llenos aparecen entre los perfiles y los planes, con su etiqueta, y pasan axe', async ({
      page,
    }) => {
      await page.goto('about:blank');
      await serveSamplePhoto(page);
      await savePreview(page, { creator, testimonials });
      await page.goto('/');
      const about = page.getByRole('region', { name: creator.name });
      const proof = page.getByRole('region', { name: t.landing.testimonialsTitle });
      await expect(about).toBeVisible();
      await expect(proof).toBeVisible();

      // El orden de la página, de arriba abajo
      const order = await page
        .locator('main section')
        .evaluateAll((sections) =>
          sections.map((section) => section.getAttribute('aria-labelledby') ?? ''),
        );
      const names = ['diferente', 'para-ti', 'creador', 'testimonios', 'precios', 'preguntas'];
      expect(order.filter((id) => names.includes(id))).toEqual(names);

      // El creador
      await expect(about.getByRole('heading', { level: 2, name: creator.name })).toBeVisible();
      await expect(about.locator('[data-slot="creator.role"]')).toHaveText(creator.role);
      await expect(about.locator('[data-slot="creator.quote"]')).toHaveText(creator.quote);
      const photo = about.getByRole('img', { name: creator.photo?.alt });
      await expect(photo).toBeVisible();
      // La foto carga cuando se acerca a la pantalla (loading lazy), así que se baja hasta ella
      await photo.scrollIntoViewIfNeeded();
      await expect
        .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
      // Los testimonios, cada uno con su cita y quién la dice
      const items = proof.getByRole('listitem');
      await expect(items).toHaveCount(testimonials.length);
      for (const [index, testimonial] of testimonials.entries()) {
        await expect(
          proof.locator(`[data-slot="${slotId('testimonials.N.quote', index + 1)}"]`),
        ).toHaveText(testimonial.quote);
        await expect(
          proof.locator(`[data-slot="${slotId('testimonials.N.who', index + 1)}"]`),
        ).toHaveText(testimonial.who);
      }
      // Todo contenido de prueba lleva su etiqueta visible, en cada bloque
      await expect(about.getByText(t.landing.sampleLabel)).toBeVisible();
      await expect(proof.getByText(t.landing.sampleLabel)).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });

    test('un creador sin foto y sin testimonios se ve bien y pasa axe', async ({ page }) => {
      await savePreview(page, { creator: { ...creator, photo: null }, testimonials: [] });
      await page.goto('/');
      const about = page.getByRole('region', { name: creator.name });
      await expect(about).toBeVisible();
      await expect(about.getByRole('img')).toHaveCount(0);
      await expect(page.getByRole('region', { name: t.landing.testimonialsTitle })).toHaveCount(0);
      await expectNoSeriousA11yViolations(page);
    });
  });
}

test.describe('vista previa que no cumple las reglas', () => {
  test('el HTML, los enlaces y las promesas dejan la portada como siempre', async ({ page }) => {
    const bad = [
      { ...creator, quote: '<img src=x onerror=alert(1)> Cita de prueba' },
      { ...creator, quote: 'Entra a https://ejemplo.com ya' },
      { ...creator, quote: 'Con nosotros aprobarás el ENARM sin falla' },
      { ...creator, photo: { file: 'creador.webp', alt: '' } },
    ];
    for (const badCreator of bad) {
      const fresh = await page.context().newPage();
      await savePreview(fresh, { creator: badCreator, testimonials });
      // La petición del código de las reglas llega, las reglas lo rechazan y la portada no cambia
      const loaded = fresh.waitForResponse((response) =>
        /\/assets\/preview-[^/]+\.js$/.test(response.url()),
      );
      await fresh.goto('/');
      await loaded;
      await expect(fresh.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
      await expect(fresh.getByRole('region', { name: t.landing.testimonialsTitle })).toHaveCount(0);
      await expect(fresh.locator('[data-slot^="creator."]')).toHaveCount(0);
      await expect(fresh.getByText(t.landing.sampleLabel)).toHaveCount(0);
      await fresh.close();
    }
  });

  test('un JSON roto tampoco cambia nada y la consola queda limpia', async ({ page }) => {
    await savePreview(page, '{esto no es json');
    const loaded = page.waitForResponse((response) =>
      /\/assets\/preview-[^/]+\.js$/.test(response.url()),
    );
    await page.goto('/');
    await loaded;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.landing.title);
    await expect(page.locator('[data-slot^="creator."]')).toHaveCount(0);
  });
});
