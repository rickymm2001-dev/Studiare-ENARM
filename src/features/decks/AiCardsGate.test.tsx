// @vitest-environment jsdom
// Las tarjetas con IA ante la compuerta 1 y ante los topes del servidor (B12, 3.5). Con la compuerta
// cerrada el botón no aparece para los alumnos y se ve el aviso. Un tope de generaciones se avisa y no
// se tapa con las respuestas fijas del cliente. En producción, sin IA, tampoco hay respuestas fijas.
// Esta es la puerta de texto o PDF. Las de la revisión del examen y la del apunte tienen su prueba al lado.
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProxy } from '@/ai/testing/proxyFetch';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { subscribe } from '@/data/testing/fixtures';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };
const MATERIAL =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'La retinopatía diabética se caracteriza por microaneurismas y hemorragias retinianas en el fondo de ojo.';

async function open() {
  app = await renderApp(SCREENS.decks.path, {
    seed: async (api, user) => {
      await subscribe(api, user, 'monthly');
    },
  });
  return screen.findByRole('region', { name: t.aiCards.title }, WAIT);
}

describe('tarjetas con IA ante la compuerta', () => {
  it('con la compuerta cerrada no hay botón ni formulario y se ve el aviso', async () => {
    const proxy = fakeProxy({ engines: {} });
    vi.stubGlobal('fetch', proxy.fetch);
    const card = await open();
    expect(await within(card).findByText(t.ai.access.gatedCards, undefined, WAIT)).toBeVisible();
    expect(within(card).queryByRole('button', { name: t.aiCards.generate })).toBeNull();
    expect(within(card).queryByLabelText(t.aiCards.textLabel)).toBeNull();
    expect(proxy.engineCalls()).toEqual([]);
  });

  it('con el motor de tarjetas abierto ofrece el botón y manda la generación y su sección', async () => {
    const typing = userEvent.setup();
    const proxy = fakeProxy({
      engines: { flashcards: 'open' },
      routes: {
        '/api/ai/flashcards': () =>
          Response.json(
            { error: 'generation_limit', message: 'Llegaste al límite.' },
            { status: 429 },
          ),
      },
    });
    vi.stubGlobal('fetch', proxy.fetch);
    const card = await open();
    const button = await within(card).findByRole('button', { name: t.aiCards.generate }, WAIT);
    await waitFor(() => {
      expect(button).toBeEnabled();
    }, WAIT);
    fireEvent.change(within(card).getByLabelText(t.aiCards.textLabel), {
      target: { value: MATERIAL },
    });
    await typing.click(button);
    await waitFor(() => {
      expect(proxy.engineCalls()).toHaveLength(1);
    }, WAIT);
    const body = proxy.engineCalls()[0]?.body;
    expect(body?.generation).toMatchObject({ section: 0 });
    expect((body?.generation as { ref: string }).ref).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('el tope de generaciones de hoy se avisa tal cual y no se cae a las respuestas fijas', async () => {
    const typing = userEvent.setup();
    const proxy = fakeProxy({
      engines: { flashcards: 'open' },
      routes: {
        '/api/ai/flashcards': () =>
          Response.json(
            {
              error: 'generation_limit',
              message:
                'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.',
            },
            { status: 429 },
          ),
      },
    });
    vi.stubGlobal('fetch', proxy.fetch);
    const card = await open();
    const button = await within(card).findByRole('button', { name: t.aiCards.generate }, WAIT);
    await waitFor(() => {
      expect(button).toBeEnabled();
    }, WAIT);
    fireEvent.change(within(card).getByLabelText(t.aiCards.textLabel), {
      target: { value: MATERIAL },
    });
    await typing.click(button);
    expect(
      await within(card).findByText(
        'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.',
        undefined,
        WAIT,
      ),
    ).toBeVisible();
    // No salió ninguna tarjeta, ni simulada, y no se contó una generación local
    expect(within(card).queryByRole('heading', { name: t.aiCards.resultTitle })).toBeNull();
    expect(await app?.api.repos.aiArtifacts.list()).toHaveLength(0);
  });

  it('en producción, sin IA, no hay respuestas fijas y se dice que no está disponible', async () => {
    vi.stubEnv('VITE_APP_ENV', 'production');
    const proxy = fakeProxy({ unreachable: true });
    vi.stubGlobal('fetch', proxy.fetch);
    const card = await open();
    expect(await within(card).findByText(t.ai.access.unavailable, undefined, WAIT)).toBeVisible();
    expect(within(card).queryByRole('button', { name: t.aiCards.generate })).toBeNull();
    // Preguntó si había IA y, como no la hay, no llamó a ningún motor
    expect(proxy.calls.length).toBeGreaterThan(0);
    expect(proxy.engineCalls()).toEqual([]);
  });
});
