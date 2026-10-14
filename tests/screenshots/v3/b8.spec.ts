// Capturas de cierre de B8 del plan del cambio (plan Gratis, respuestas 18, 19 y 20, 4.3 y 4.25). En
// Gratis, Party con su candado y lo que sigue abierto, Mazos con el catálogo como vista previa y Subir
// tus mazos detrás del candado, Apuntes con su candado y la tabla de planes de Suscripción con lo que
// cierra Gratis. Después, el reto de Party en Inicio, Buscar tarjetas sin tarjetas y lo que el alumno
// conserva al volver a Gratis desde un plan de pago, el mazo que ya seguía y la tarjeta de su apunte en
// Buscar tarjetas. Quedan en docs/screenshots/v3/b8. El recorrido completo va en teléfono claro y
// computadora clara y oscura, y lo clave además en 1920 y en el teléfono oscuro, como en b6.spec.ts y
// b7.spec.ts
import { expect, test, type Locator, type Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { subscribeMonthly } from '../../e2e/support/b1';
import { resultRows, searchResults } from '../../e2e/support/cardSearch';
import { signUp } from '../../e2e/support/fixtures';
import { capture, outDirFor } from './capture';

const B8_DIR = outDirFor('b8');

const FULL_WALK = (project: string) => !project.startsWith('1920') && project !== '390-oscuro';

/** El mazo más chico del catálogo, el que siguen las e2e, y uno que nunca se sigue */
const SMALL = 'Urgencias (Paco)';
const BIG = 'Medicina interna (Paco)';

const editorOf = (page: Page) => page.getByRole('textbox', { name: t.outlines.editor.label });

/** Abre una ruta y espera su título y lo que se pide antes de capturar */
async function open(page: Page, path: string, ...ready: Locator[]) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  for (const locator of ready) await expect(locator).toBeVisible({ timeout: 60_000 });
}

/** Captura solo una tarjeta, como Subir tus mazos con su candado */
async function card(region: Locator, name: string, project: string) {
  await region.scrollIntoViewIfNeeded();
  await region.screenshot({ path: `${B8_DIR}/${name}--${project}.jpg`, type: 'jpeg', quality: 60 });
}

test('B8. Los candados del plan Gratis y lo que se conserva al volver a Gratis', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  const project = info.project.name;
  const catalog = page.getByRole('region', { name: t.decks.preloadedTitle });
  const deckRow = (name: string) => catalog.getByRole('listitem').filter({ hasText: name });
  await signUp(page);

  // Party. Grupos, tabla, retos y duelos detrás del candado. Comparte tu semana y Invita y gana un mes
  // siguen abiertas
  await open(page, SCREENS.party.path, page.getByRole('region', { name: t.freePlan.party.title }));
  await capture(page, B8_DIR, '01-party-gratis', project);

  // Mazos. El catálogo como vista previa, con el aviso arriba y cada mazo nuevo marcado como de pago,
  // y Subir tus mazos con su candado al final
  const upload = page.getByRole('region', { name: t.freePlan.importDecks.title });
  await open(
    page,
    SCREENS.decks.path,
    catalog.getByText(t.freePlan.catalog.notice),
    deckRow(SMALL).getByText(t.freePlan.catalog.rowLocked),
    upload,
  );
  await capture(page, B8_DIR, '02-mazos-gratis', project);
  await card(upload, '03-subir-mazos-gratis', project);

  // Apuntes con su candado y su vista previa
  await open(
    page,
    SCREENS.outlines.path,
    page.getByRole('region', { name: t.outlines.locked.title }),
  );
  await capture(page, B8_DIR, '04-apuntes-gratis', project);

  // La tabla de planes dice lo mismo que los candados
  await open(
    page,
    SCREENS.subscription.path,
    page.getByRole('region', { name: t.billing.plans.free, exact: true }),
  );
  await capture(page, B8_DIR, '05-suscripcion-gratis', project);
  if (!FULL_WALK(project)) return;

  // El reto de Party en Inicio lleva el aviso corto del candado
  await open(
    page,
    SCREENS.home.path,
    page
      .getByRole('region', { name: t.widgets.names.party_challenge })
      .getByText(t.freePlan.widget),
  );
  await capture(page, B8_DIR, '06-inicio-gratis', project);

  // Buscar tarjetas sin tarjetas sugiere un mazo propio y no seguir uno del catálogo
  await open(page, SCREENS.explore.path, page.getByText(t.freePlan.catalog.exploreEmpty));
  await capture(page, B8_DIR, '07-buscar-tarjetas-gratis', project);

  // Con el mensual simulado sigue el mazo chico y escribe un apunte
  await subscribeMonthly(page);
  await open(
    page,
    SCREENS.decks.path,
    deckRow(SMALL).getByRole('button', { name: t.decks.follow }),
  );
  await deckRow(SMALL).getByRole('button', { name: t.decks.follow }).click();
  await expect(deckRow(SMALL).getByRole('button', { name: t.decks.unfollow })).toBeVisible({
    timeout: 60_000,
  });
  await open(page, SCREENS.outlines.path, page.getByLabel(t.outlines.newTitle));
  await page.getByLabel(t.outlines.newTitle).fill('Choque séptico');
  await page.getByRole('button', { name: t.outlines.create }).click();
  await expect(editorOf(page)).toBeVisible({ timeout: 30_000 });
  await editorOf(page).click();
  // Sin esperar el foco, la primera letra se pierde
  await expect(editorOf(page)).toBeFocused();
  await page.keyboard.type('Meta de presión arterial media >> 65 mmHg o más');
  await expect(page.getByText(t.outlines.preview.count(1))).toBeVisible();
  await expect(page.getByText(t.outlines.editor.saved, { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // Vuelve a Gratis con la cancelación simulada
  await page.goto(SCREENS.subscription.path);
  await page.getByRole('button', { name: t.billing.cancel }).click();
  await expect(page.getByText(t.billing.canceled)).toBeVisible();

  // El mazo que ya seguía se queda a su alcance y los nuevos vuelven a su candado
  await open(
    page,
    SCREENS.decks.path,
    catalog.getByText(t.freePlan.catalog.notice),
    deckRow(BIG).getByText(t.freePlan.catalog.rowLocked),
    deckRow(SMALL).getByRole('button', { name: t.decks.unfollow }),
  );
  await capture(page, B8_DIR, '08-mazos-de-vuelta-en-gratis', project);

  // Apuntes vuelve a su candado, que se ve como en 04, y la tarjeta del apunte sigue en Buscar
  // tarjetas, junto con las del mazo que ya seguía
  await open(page, SCREENS.outlines.path, page.getByText(t.outlines.locked.kept));
  await open(page, SCREENS.explore.path, searchResults(page));
  await page.getByRole('searchbox', { name: t.cardSearch.searchLabel }).fill('presión arterial');
  await expect(resultRows(page).filter({ hasText: 'Meta de presión arterial media' })).toHaveCount(
    1,
  );
  await capture(page, B8_DIR, '09-buscar-tarjetas-de-vuelta-en-gratis', project);
});
