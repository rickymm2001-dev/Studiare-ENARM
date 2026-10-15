// @vitest-environment jsdom
// Mazos con el vocabulario médico en inglés de MedlinePlus (B13, 4.4 y 8.16 del plan de B13), en la lista
// de mazos empacados de desarrollo y de la demo. El mazo dice su fuente y su licencia en lugar del crédito
// de un autor, y su lista de temas la repite al pie. En Gratis sigue siendo una vista con su candado, como
// el resto del catálogo. El mazo es de muestra, con la marca [Prueba], y no trae contenido médico.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DemoDeckFileSchema } from '@/data/schemas/content';
import { changePlan } from '@/data/usecases/subscription';
import { deckCatalogText } from '@/i18n/cloudDecks';
import { t } from '@/i18n/es-MX';
import { MEDLINEPLUS_SOURCE } from './deckSource';

vi.setConfig({ testTimeout: 30_000 });

const deck = DemoDeckFileSchema.parse({
  version: 1,
  key: 'vocabulario-ingles',
  name: '[Prueba] Vocabulario médico en inglés',
  description: '[Prueba] Mazo simulado',
  author: 'MedlinePlus.gov (NLM)',
  status: 'pending_physician_review',
  media: [],
  notes: ['Corazón y circulación', 'Infecciones'].flatMap((group, groupIndex) =>
    [1, 2].map((number) => ({
      kind: 'basic',
      key: `mplus-prueba-${String(groupIndex)}${String(number)}`,
      sourceTag: `Inglés médico::${group}`,
      tags: [`Inglés médico::${group}`, 'topic:medical_vocabulary'],
      branch: 'medical_english',
      topic: 'medical_vocabulary',
      front: `<span lang="en">[Prueba] Term ${String(groupIndex)}${String(number)}</span>`,
      back: `[Prueba] Término ${String(groupIndex)}${String(number)}<br><i>Fuente MedlinePlus.gov (NLM)</i>`,
    })),
  ),
});

// Solo el mazo de muestra, para no cargar los mazos de Paco en esta prueba
vi.mock('@/demo/content/decks', () => ({ loadDemoDecks: () => Promise.resolve([deck]) }));

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 15_000 };
const source = deckCatalogText.source;

async function vocabularyRow(): Promise<{ catalog: HTMLElement; row: HTMLElement }> {
  const catalog = await screen.findByRole('region', { name: t.decks.preloadedTitle }, WAIT);
  const title = await within(catalog).findByText(deck.name, undefined, WAIT);
  const row = title.closest('li');
  if (!row) throw new Error('No está la fila del mazo de vocabulario');
  return { catalog, row };
}

describe('mazo de vocabulario en la lista de mazos', () => {
  it('dice su fuente y su licencia en lugar del autor, y la lista de temas la repite al pie', async () => {
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.decks.path, {
      seed: async (api, user) => {
        await changePlan(api, user, 'monthly');
      },
    });
    const { row } = await vocabularyRow();
    expect(
      within(row).getByText(source.line(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license)),
    ).toBeVisible();
    // No se comparte con autorización de nadie, así que no dice De quién es
    expect(within(row).queryByText(t.decks.author('MedlinePlus.gov (NLM)'))).toBeNull();
    // Los temas son los grupos de MedlinePlus, y la fuente va al pie
    await typing.click(within(row).getByText(t.deckTopics.title));
    const topics = within(row).getByRole('list', { name: t.deckTopics.listLabel(deck.name) });
    expect(within(topics).getByText('Corazón y circulación')).toBeVisible();
    expect(within(topics).getByText('Infecciones')).toBeVisible();
    expect(
      within(row).getByText(
        source.topicsFooter(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license),
      ),
    ).toBeVisible();
  });

  it('en Gratis sigue a la vista con su candado, como el resto del catálogo', async () => {
    app = await renderApp(SCREENS.decks.path);
    const { catalog, row } = await vocabularyRow();
    expect(
      within(row).getByText(source.line(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license)),
    ).toBeVisible();
    expect(within(row).getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
    expect(within(catalog).queryByRole('button', { name: t.decks.follow })).toBeNull();
  });
});
