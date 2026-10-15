// @vitest-environment jsdom
// Mazos con el catálogo de la nube (B11, 5.8). Con la bandera deckCatalogCloud la lista sale de
// deck_catalog_list y los planes de pago bajan las materias de Storage. Gratis ve la vista previa con el
// candado y la prueba gratis.
import 'fake-indexeddb/auto';
import { webcrypto } from 'node:crypto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { writeStoredFlags } from '@/config/featureFlags';
import type { DeckSubjectFile } from '@/data/schemas/deckCatalog';
import { fakeRpc } from '@/data/testing/bankCloud';
import { sha256Hex } from '@/data/usecases/catalogDecks';
import { deckIds } from '@/demo/content/deckEntities';
import { deckCatalogText } from '@/i18n/cloudDecks';
import { t } from '@/i18n/es-MX';

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

const subjectFile: DeckSubjectFile = {
  version: 1,
  deckKey: 'paco-gyo',
  deckVersion: 1,
  subjectKey: 'obstetricia',
  name: 'Obstetricia',
  branch: 'obstetrics_gynecology',
  topic: 'prenatal_care',
  author: 'Paco',
  status: 'pending_physician_review',
  media: [],
  notes: [
    {
      key: 'paco-gyo-000000000001',
      sourceTag: 'Ginecología::Obstetricia::Control',
      tags: ['Ginecología'],
      branch: 'obstetrics_gynecology',
      topic: 'prenatal_care',
      kind: 'basic',
      front: '[Prueba] Frente simulado',
      back: '[Prueba] Reverso simulado',
    },
  ],
};

async function catalogCloud(canDownload: boolean) {
  const json = new TextEncoder().encode(JSON.stringify(subjectFile));
  const sha256 = await sha256Hex(json);
  const records: unknown[] = [];
  const rpc = fakeRpc({
    deck_catalog_list: () => ({
      canDownload,
      decks: [
        {
          deckKey: 'paco-gyo',
          name: 'Ginecología y obstetricia (Paco)',
          author: 'Paco',
          description: '[Prueba] Mazo simulado',
          version: 1,
          notes: 1,
          cards: 1,
          bytes: json.length,
          subjects: [
            {
              subjectKey: 'obstetricia',
              name: 'Obstetricia',
              branch: 'obstetrics_gynecology',
              topic: 'prenatal_care',
              notes: 1,
              cards: 1,
              bytes: json.length,
              mediaParts: 0,
              sha256,
            },
          ],
          preview: [{ kind: 'basic', front: '<b>[Prueba] Nota de muestra</b>', back: 'Reverso' }],
        },
      ],
    }),
    record_deck_download: (args) => {
      records.push(args);
      return null;
    },
  });
  const cloud = Object.assign(rpc, {
    storage: {
      from: () => ({
        download: (path: string) =>
          Promise.resolve(
            path === 'paco-gyo/v1/obstetricia.json'
              ? { data: new Blob([json]), error: null }
              : { data: null, error: { message: 'Object not found', status: 400 } },
          ),
      }),
    },
  });
  holder.cloud = cloud;
  return { records };
}

beforeEach(() => {
  // jsdom no trae la huella de Web Crypto que usa la bajada
  vi.stubGlobal('crypto', webcrypto);
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
  vi.unstubAllGlobals();
});

describe('catálogo de mazos de la nube', () => {
  it('un plan de pago baja una materia, la guarda como precargada y sigue el mazo', async () => {
    const user = userEvent.setup();
    const { records } = await catalogCloud(true);
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(
      await within(catalog).findByText('Ginecología y obstetricia (Paco)', undefined, WAIT),
    ).toBeVisible();
    // Los mazos empacados de la demo no salen con la nube
    expect(screen.queryByRole('region', { name: t.decks.preloadedTitle })).toBeNull();
    await user.click(within(catalog).getByText(text.subjects(1)));
    await user.click(
      within(catalog).getByRole('button', { name: text.downloadLabel('Obstetricia') }),
    );
    expect(await within(catalog).findByText(text.done(1), undefined, WAIT)).toBeVisible();
    const api = app.api;
    expect(await api.repos.notes.get(deckIds.note('paco-gyo-000000000001'))).toMatchObject({
      isDemo: false,
    });
    expect((await api.repos.users.get(app.user.id))?.settings.followedDecks).toContain('paco-gyo');
    await waitFor(() => {
      expect(records).toEqual([
        {
          p_deck_key: 'paco-gyo',
          p_version: 1,
          p_subject_key: 'obstetricia',
          p_bytes: expect.any(Number) as number,
        },
      ]);
    });
    expect(within(catalog).getByText(text.downloaded)).toBeVisible();
  });

  it('quitar descargas deja la materia por bajar y un mazo que dejó de seguir se sigue otra vez', async () => {
    const user = userEvent.setup();
    await catalogCloud(true);
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    await user.click(await within(catalog).findByText(text.subjects(1), undefined, WAIT));
    await user.click(
      within(catalog).getByRole('button', { name: text.downloadLabel('Obstetricia') }),
    );
    expect(await within(catalog).findByText(text.done(1), undefined, WAIT)).toBeVisible();
    const api = app.api;
    const userId = app.user.id;
    const followed = async () => (await api.repos.users.get(userId))?.settings.followedDecks;

    // Dejar de seguir no quita lo bajado y se vuelve a seguir sin bajar nada
    await user.click(await within(catalog).findByRole('button', { name: t.decks.unfollow }));
    await user.click(await within(catalog).findByRole('button', { name: t.decks.follow }, WAIT));
    await waitFor(async () => {
      expect(await followed()).toContain('paco-gyo');
    });
    expect(within(catalog).getByText(text.downloaded)).toBeVisible();

    await user.click(
      within(catalog).getByRole('button', {
        name: text.removeDownloadsLabel('Ginecología y obstetricia (Paco)'),
      }),
    );
    expect(await within(catalog).findByText(text.removed, undefined, WAIT)).toBeVisible();
    expect(
      await within(catalog).findByRole('button', { name: text.downloadLabel('Obstetricia') }, WAIT),
    ).toBeVisible();
    expect(await followed()).not.toContain('paco-gyo');
    expect(within(catalog).queryByRole('button', { name: t.decks.follow })).toBeNull();
  });

  it('Gratis ve las materias y las notas de muestra con el candado y la prueba gratis', async () => {
    const user = userEvent.setup();
    await catalogCloud(false);
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(
      await within(catalog).findByText(t.freePlan.catalog.notice, undefined, WAIT),
    ).toBeVisible();
    expect(within(catalog).getByRole('link', { name: t.billing.freeTrialCta })).toBeVisible();
    await user.click(await within(catalog).findByText(text.subjects(1), undefined, WAIT));
    expect(within(catalog).getByText(t.freePlan.catalog.rowLocked)).toBeVisible();
    expect(
      within(catalog).queryByRole('button', { name: text.downloadLabel('Obstetricia') }),
    ).toBeNull();
    await user.click(within(catalog).getByText(text.preview));
    expect(within(catalog).getByText('[Prueba] Nota de muestra')).toBeVisible();
  });

  it('al abrir la app espera a que la cuenta se conecte y entonces pide el catálogo', async () => {
    const pending = await catalogCloud(true);
    const cloud = holder.cloud;
    // Así abre Mazos al recargar. El SDK todavía no baja y la cuenta se está revisando
    holder.cloud = null;
    useCloud.setState({ state: { status: 'checking' } });
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(within(catalog).getByText(text.loading)).toBeVisible();
    holder.cloud = cloud;
    useCloud.setState({
      state: {
        status: 'linked',
        identity: { authId: 'cuenta', email: 'ana@ejemplo.mx', role: 'student', alias: 'Ana' },
      },
    });
    expect(
      await within(catalog).findByText('Ginecología y obstetricia (Paco)', undefined, WAIT),
    ).toBeVisible();
    expect(pending.records).toEqual([]);
  });

  it('sin conexión lo dice y no se queda cargando', async () => {
    holder.cloud = null;
    app = await renderApp(SCREENS.decks.path);
    const catalog = await screen.findByRole('region', { name: text.title }, WAIT);
    expect(await within(catalog).findByText(text.offline, undefined, WAIT)).toBeVisible();
  });
});
