// @vitest-environment jsdom
// El vocabulario médico en inglés de MedlinePlus en el catálogo de la nube (B13, 4.4, 4.5 y 8.16 del plan
// de B13), que es donde vive en producción. Los planes de pago lo bajan por materia, como cualquier mazo.
// Gratis lo ve con sus materias, su candado y unas notas de muestra, y los términos en inglés se leen
// como inglés. El mazo dice su fuente y su licencia en lugar del crédito de un autor. Todo es de muestra.
import 'fake-indexeddb/auto';
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import { fakeRpc } from '@/data/testing/bankCloud';
import { deckCatalogText } from '@/i18n/cloudDecks';
import { t } from '@/i18n/es-MX';
import { MEDLINEPLUS_SOURCE } from './deckSource';

vi.setConfig({ testTimeout: 30_000 });
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => true,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = deckCatalogText;
const WAIT = { timeout: 15_000 };
let app: RenderedApp | undefined;

const NAME = '[Prueba] Vocabulario médico en inglés';

function catalogWith(canDownload: boolean, branch: string | null = 'medical_english') {
  holder.cloud = fakeRpc({
    deck_catalog_list: () => ({
      canDownload,
      decks: [
        {
          deckKey: 'vocabulario-ingles',
          name: NAME,
          author: 'MedlinePlus.gov (NLM)',
          description: '[Prueba] Mazo simulado',
          version: 1,
          notes: 4,
          cards: 4,
          bytes: 12_000,
          subjects: ['Corazón y circulación', 'Infecciones'].map((name, index) => ({
            subjectKey: `grupo-${String(index)}`,
            name,
            branch,
            topic: branch === null ? null : 'medical_vocabulary',
            notes: 2,
            cards: 2,
            bytes: 6_000,
            mediaParts: 0,
            sha256: 'a'.repeat(64),
          })),
          preview: [
            {
              kind: 'basic',
              front: '<span lang="en">[Prueba] Term sample</span>',
              // Como el reverso del mazo real: el nombre en español, los otros nombres y la fuente
              back: '<b>[Prueba] Término de muestra</b><br><i>En español también</i> [Prueba] Otro nombre<br><i>Fuente MedlinePlus.gov (NLM)</i>',
            },
          ],
        },
      ],
    }),
  });
}

beforeEach(() => {
  writeStoredFlags({ deckCatalogCloud: true });
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'cuenta', email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
    },
  });
});

afterEach(async () => {
  cleanup();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  localStorage.clear();
  useCloud.setState({ state: { status: 'off' } });
});

describe('vocabulario médico en el catálogo de la nube', () => {
  it('Gratis lo ve con su fuente, su candado y las notas de muestra, y el término se lee como inglés', async () => {
    const user = userEvent.setup();
    catalogWith(false);
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(await within(catalog).findByText(NAME, undefined, WAIT)).toBeVisible();
    expect(
      within(catalog).getByText(
        text.source.line(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license),
      ),
    ).toBeVisible();
    expect(within(catalog).queryByText(t.decks.author('MedlinePlus.gov (NLM)'))).toBeNull();
    expect(within(catalog).getByText(t.freePlan.catalog.notice)).toBeVisible();

    // Las materias son los grupos de MedlinePlus y llevan la fuente al pie
    await user.click(within(catalog).getByText(text.subjects(2)));
    expect(within(catalog).getByText('Corazón y circulación')).toBeVisible();
    expect(within(catalog).getAllByText(t.freePlan.catalog.rowLocked)).toHaveLength(2);
    expect(
      within(catalog).getByText(
        text.source.topicsFooter(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license),
      ),
    ).toBeVisible();

    // La vista previa deja leer unas notas, con el término en inglés marcado como inglés
    await user.click(within(catalog).getByText(text.preview));
    expect(within(catalog).getByText('[Prueba] Term sample')).toHaveAttribute('lang', 'en');
    // El reverso trae el nombre en español, los otros nombres y la fuente separados por saltos de línea.
    // Cada parte va en su renglón y las palabras no se pegan
    const back = within(catalog).getByText(
      '[Prueba] Término de muestra En español también [Prueba] Otro nombre Fuente MedlinePlus.gov (NLM)',
    );
    expect(back.textContent).toBe(
      '[Prueba] Término de muestra\nEn español también [Prueba] Otro nombre\nFuente MedlinePlus.gov (NLM)',
    );
    expect(back).toHaveClass('whitespace-pre-line');
    expect(within(catalog).queryByRole('button', { name: /Bajar/ })).toBeNull();
  });

  it('un plan de pago ve la misma fuente y baja el mazo por materia', async () => {
    catalogWith(true);
    app = await renderApp(SCREENS.decks.path, {
      seed: async (api, user) => {
        await api.repos.subscriptions.put({
          userId: user.id,
          plan: 'monthly',
          status: 'active',
          isSimulated: false,
          trialAvailable: false,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(await within(catalog).findByText(NAME, undefined, WAIT)).toBeVisible();
    expect(
      within(catalog).getByText(
        text.source.line(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license),
      ),
    ).toBeVisible();
    expect(within(catalog).queryByText(t.freePlan.catalog.notice)).toBeNull();
    expect(within(catalog).getByRole('button', { name: /^Bajar todo/ })).toBeEnabled();
    // Con plan de pago no hay vista previa, baja el mazo completo
    expect(within(catalog).queryByText(text.preview)).toBeNull();
  });

  it('sin la rama de Inglés médico en sus materias, pero con la clave del vocabulario, también dice su fuente', async () => {
    catalogWith(false, null);
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(await within(catalog).findByText(NAME, undefined, WAIT)).toBeVisible();
    expect(
      within(catalog).getByText(
        text.source.line(MEDLINEPLUS_SOURCE.name, MEDLINEPLUS_SOURCE.license),
      ),
    ).toBeVisible();
    // Sin rama asignada no se sabe que sea inglés, así que no se marca el idioma
    await userEvent.setup().click(within(catalog).getByText(text.preview));
    expect(within(catalog).getByText('[Prueba] Term sample')).not.toHaveAttribute('lang');
  });
});
