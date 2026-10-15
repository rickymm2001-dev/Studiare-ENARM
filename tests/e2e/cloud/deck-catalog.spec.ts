// El catálogo de mazos de la nube (B11, 4.8 y 5.8 del plan de B11, respuestas 46 y 47). Con la bandera
// deckCatalogCloud, Mazos lista los mazos de deck_catalog_list. Un plan de pago baja una materia de
// Storage con sus imágenes, sigue el mazo y lo repasa sin conexión con las imágenes guardadas en el
// dispositivo. Gratis ve las materias y las notas de muestra con el candado y la prueba gratis, sin
// bajar nada. Corre contra el Supabase simulado con el banco de tests/e2e/support/fakeBank.ts.
//
// Esta es la parte del alumno, que escribe el paquete B. El mazo se siembra publicado con
// seedCatalogDeck, igual a como lo deja el admin. La parte del admin, que sube un .apkg chico de
// prueba, confirma la autorización del dueño y publica con fakeEditorial.ts, está en
// deck-catalog-admin.spec.ts. Todo el texto es simulado.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { deckCatalogText as text } from '@/i18n/cloudDecks';
import { t } from '@/i18n/es-MX';
import { enterWithLink, expect, reloadWithServerFlags, test } from '../support/cloudFixtures';
import { goOffline, seedCatalogDeck } from '../support/fakeBank';
import { createFakeBankStore } from '../support/fakeBankStore';
import { attachBank, type FakeSupabaseServer } from '../support/fakeSupabase';
import { expectNoSeriousA11yViolations } from '../support/fixtures';

const ANA = 'ana.mazos@ejemplo.mx';
const DAY_MS = 86_400_000;
const SUBJECT = 'Materia simulada';

/** El banco simulado enganchado al Supabase de la prueba, con un mazo publicado de una nota */
function catalogWith(cloud: FakeSupabaseServer) {
  const store = createFakeBankStore();
  attachBank(cloud, store);
  const seeded = seedCatalogDeck(store, { notes: 1 });
  return { store, ...seeded };
}

/** Entra con el catálogo de la nube y la prueba gratis prendidos en el servidor, como lo hará Ricardo */
async function enterWithCatalog(page: Page, cloud: FakeSupabaseServer) {
  cloud.setFeatureFlags({ deckCatalogCloud: true, freeTrial: true });
  await enterWithLink(page, cloud, ANA, 'Ana');
  await reloadWithServerFlags(page);
}

const storageReads = (cloud: FakeSupabaseServer) =>
  cloud.calls.filter((call) => call.path.includes('/storage/v1/object/deck-catalog/')).length;

async function openCatalog(page: Page) {
  await page.goto(SCREENS.decks.path);
  const catalog = page.getByRole('region', { name: text.title });
  await expect(catalog).toBeVisible({ timeout: 30_000 });
  await expect(catalog.getByText('[Prueba] Mazo simulado del catálogo')).toBeVisible({
    timeout: 30_000,
  });
  return catalog;
}

test.describe('Catálogo de mazos de la nube para el alumno', () => {
  test('un plan de pago baja una materia y la repasa sin conexión con sus imágenes', async ({
    page,
    context,
    cloud,
  }) => {
    test.setTimeout(180_000);
    const { store, fronts } = catalogWith(cloud);
    cloud.createUser({ email: ANA, alias: 'Ana' });
    cloud.setSubscription(ANA, {
      plan: 'monthly',
      status: 'active',
      provider: 'stripe',
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS).toISOString(),
    });
    await enterWithCatalog(page, cloud);
    const catalog = await openCatalog(page);
    // Los mazos empacados de la demo no salen con el catálogo de la nube
    await expect(page.getByRole('region', { name: t.decks.preloadedTitle })).toHaveCount(0);
    await catalog.getByText(text.subjects(1)).click();
    await catalog.getByRole('button', { name: text.downloadLabel(SUBJECT) }).click();
    await expect(catalog.getByText(text.done(1))).toBeVisible({ timeout: 30_000 });
    await expect(catalog.getByText(text.downloaded, { exact: true })).toBeVisible();
    // El servidor anotó la bajada de esa materia y esa versión
    expect(store.deckDownloads).toEqual([
      expect.objectContaining({
        deckKey: 'prueba-catalogo',
        version: 1,
        subjectKey: 'materia-simulada',
      }),
    ]);
    await expectNoSeriousA11yViolations(page);

    // Repasar con la página ya cargada, y sin red al empezar
    await catalog.getByRole('link', { name: text.review }).click();
    const start = page.getByRole('button', { name: /^Repasar [\d,]+ tarjetas?$/ });
    await expect(start).toBeVisible({ timeout: 30_000 });
    const reads = storageReads(cloud);
    await goOffline(context);
    await start.click();
    await expect(page.getByText(fronts[0] ?? '')).toBeVisible({ timeout: 30_000 });
    // La imagen sale de lo guardado en el dispositivo y no de la red
    const image = page.getByRole('img', { name: 'Imagen simulada' });
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
      .toBe(1);
    expect(storageReads(cloud)).toBe(reads);
    await context.setOffline(false);
  });

  test('Gratis ve las materias y las notas de muestra con el candado y no baja nada', async ({
    page,
    cloud,
  }) => {
    test.setTimeout(120_000);
    const { store } = catalogWith(cloud);
    await enterWithCatalog(page, cloud);
    const catalog = await openCatalog(page);
    await expect(catalog.getByText(t.freePlan.catalog.notice)).toBeVisible();
    await expect(catalog.getByRole('link', { name: t.billing.freeTrialCta })).toBeVisible();
    await catalog.getByText(text.subjects(1)).click();
    await expect(catalog.getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
    await expect(catalog.getByRole('button', { name: text.downloadLabel(SUBJECT) })).toHaveCount(0);
    await catalog.getByText(text.preview).click();
    await expect(catalog.getByText('[Prueba] Nota de muestra')).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    expect(storageReads(cloud)).toBe(0);
    expect(store.deckDownloads).toEqual([]);
  });
});
