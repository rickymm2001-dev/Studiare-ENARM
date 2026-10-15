// El paso del admin en el Catálogo de mazos (pantalla 37, 4.8 del plan de B11), para las e2e de nube.
// Lo usa deck-catalog-admin.spec.ts y, por contrato, deck-catalog.spec.ts del paquete B antes de que el
// alumno baje el mazo. Arma un .apkg pequeño con texto simulado, lo sube desde la pantalla, que lo parte
// por submazo en el navegador, y publica la versión. Un mazo de terceros necesita antes la confirmación
// del dueño.
import type { Page } from '@playwright/test';
import { SCREENS } from '@/app/screens';
import { buildLegacyApkg, standardModels, type ApkgFixture } from '@/data/import/testing/fixtures';
import { bankAdminText } from '@/i18n/bankAdmin';
import { escapeRegExp } from './b1';
import { expect } from './cloudFixtures';

const text = bankAdminText.decks;

/** Un mazo de prueba con dos submazos y texto simulado, nunca contenido médico */
export const TEST_DECK_FIXTURE: ApkgFixture = {
  models: standardModels,
  notes: [
    {
      guid: 'prueba-1',
      model: 'basic',
      fields: ['[Prueba] Frente simulado 1', '[Prueba] Reverso simulado 1'],
      tags: 'Prueba::Uno',
      deck: 'Prueba::Uno',
    },
    {
      guid: 'prueba-2',
      model: 'basic',
      fields: ['[Prueba] Frente simulado 2', '[Prueba] Reverso simulado 2'],
      tags: 'Prueba::Dos',
      deck: 'Prueba::Dos',
    },
    {
      guid: 'prueba-3',
      model: 'cloze',
      fields: ['[Prueba] Un {{c1::hueco}} simulado', ''],
      tags: 'Prueba::Dos',
      deck: 'Prueba::Dos',
    },
  ],
};

export interface AdminDeck {
  deckKey: string;
  name: string;
  author: string;
  license: 'own' | 'third_party';
  /** Obligatoria con licencia de terceros */
  note?: string;
}

/** La tarjeta de un mazo en la lista del catálogo, por su nombre */
export const deckEntry = (page: Page, name: string) =>
  page.getByRole('region', { name: new RegExp(`^${escapeRegExp(name)}`) });

/** Sube el .apkg desde Catálogo de mazos con su licencia y espera a que todos los archivos suban */
export async function uploadDeckAsAdmin(
  page: Page,
  deck: AdminDeck,
  fixture: ApkgFixture = TEST_DECK_FIXTURE,
): Promise<void> {
  const upload = text.upload;
  await page.goto(SCREENS.deckCatalogAdmin.path);
  await page.getByLabel(upload.file).setInputFiles({
    name: `${deck.deckKey}.apkg`,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(await buildLegacyApkg(fixture)),
  });
  const key = page.getByLabel(upload.key);
  await expect(key).toBeVisible({ timeout: 30_000 });
  await key.fill(deck.deckKey);
  await page.getByLabel(upload.name, { exact: true }).fill(deck.name);
  await page.getByLabel(upload.author).fill(deck.author);
  await page.getByLabel(upload.license).selectOption(deck.license);
  if (deck.license === 'third_party') await page.getByLabel(upload.note).fill(deck.note ?? '');
  const subjects = new Set(fixture.notes.map((note) => note.deck)).size;
  await expect(page.getByText(upload.subjects(subjects), { exact: true })).toBeVisible();
  await page.getByRole('button', { name: upload.register }).click();
  await expect(page.getByText(upload.uploaded)).toBeVisible({ timeout: 30_000 });
}

/** Publica la versión en subida de un mazo desde su tarjeta */
export async function publishDeckAsAdmin(page: Page, name: string): Promise<void> {
  const entry = deckEntry(page, name);
  await entry.getByRole('button', { name: text.publish }).click();
  await expect(entry.getByText(text.published)).toBeVisible();
}
