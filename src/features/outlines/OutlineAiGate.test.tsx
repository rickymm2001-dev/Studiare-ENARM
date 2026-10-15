// @vitest-environment jsdom
// Tarjetas con IA desde el apunte ante la compuerta 1 y ante el tope de generaciones (B12, 3.5). Es una
// de las tres puertas de las tarjetas con IA. Con el motor de tarjetas cerrado el botón no aparece para el
// alumno, se ve el aviso y no sale ninguna llamada a un motor. Con el motor abierto se ofrece, a la IA
// solo viajan el ID seudónimo y el texto del apunte, y un tope de generaciones del servidor se avisa
// tal cual, sin guardar nada ni caer a las respuestas fijas.
import 'fake-indexeddb/auto';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeProxy } from '@/ai/testing/proxyFetch';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { newId } from '@/data/ids';
import { subscribe } from '@/data/testing/fixtures';
import { createOutline, saveOutline } from '@/data/usecases/outlines';
import { t } from '@/i18n/es-MX';

vi.mock('@/ui/celebrate', () => ({ celebrate: () => undefined }));
// Sin nube, como las demás pruebas de Apuntes. El cliente real tampoco existe sin URL de Supabase
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => null,
  cloudConfigured: () => false,
  loadCloud: () => Promise.resolve(null),
}));

// Abrir un apunte carga el editor y sus pruebas tardan más que los 5 segundos por defecto
vi.setConfig({ testTimeout: 30_000 });

// ProseMirror mide rectángulos que jsdom no calcula
beforeAll(() => {
  const rect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
  document.elementFromPoint = () => null;
});

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await resetApp(app?.api);
  app = undefined;
});

const WAIT = { timeout: 20_000 };

const FIRST_LINE =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2';
const SECOND_LINE = 'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos';
const LIMIT_MESSAGE =
  'Llegaste al límite de generaciones de tarjetas con IA de hoy. Vuelve mañana.';

interface Line {
  id: string;
  text: string;
  children: Line[];
}
const node = (text: string, ...children: Line[]): Line => ({ id: newId(), text, children });

/** Abre el apunte Diabetes de un alumno con un plan de pago y devuelve su panel de IA */
async function openAiPanel(typing: ReturnType<typeof userEvent.setup>) {
  app = await renderApp(SCREENS.outlines.path, {
    seed: async (api, user) => {
      await subscribe(api, user);
      const outline = await createOutline(api, user, {
        title: 'Diabetes',
        subject: { kind: 'enarm', branch: 'internal_medicine', topic: 'endocrinology' },
      });
      await saveOutline(api, user, {
        outlineId: outline.id,
        nodes: [node('Tratamiento', node(FIRST_LINE), node(SECOND_LINE))],
      });
    },
  });
  await typing.click(await screen.findByRole('link', { name: t.outlines.open('Diabetes') }, WAIT));
  return screen.findByRole('region', { name: t.outlines.ai.title }, WAIT);
}

describe('tarjetas con IA desde el apunte ante la compuerta', () => {
  it('con la compuerta cerrada no hay botón, se ve el aviso y no sale ninguna llamada a un motor', async () => {
    const proxy = fakeProxy({ engines: {} });
    vi.stubGlobal('fetch', proxy.fetch);
    const panel = await openAiPanel(userEvent.setup());
    expect(await within(panel).findByText(t.ai.access.gatedCards, undefined, WAIT)).toBeVisible();
    expect(within(panel).queryByRole('button', { name: t.outlines.ai.generate })).toBeNull();
    expect(proxy.engineCalls()).toEqual([]);
  });

  it('con el motor abierto ofrece el botón, manda solo el ID seudónimo y el texto del apunte, y el tope del servidor se avisa tal cual', async () => {
    const typing = userEvent.setup();
    const proxy = fakeProxy({
      engines: { flashcards: 'open' },
      routes: {
        '/api/ai/flashcards': () =>
          Response.json({ error: 'generation_limit', message: LIMIT_MESSAGE }, { status: 429 }),
      },
    });
    vi.stubGlobal('fetch', proxy.fetch);
    const panel = await openAiPanel(typing);
    const generate = await within(panel).findByRole(
      'button',
      { name: t.outlines.ai.generate },
      WAIT,
    );
    await waitFor(() => {
      expect(generate).toBeEnabled();
    }, WAIT);
    await typing.click(generate);
    expect(await within(panel).findByText(LIMIT_MESSAGE, undefined, WAIT)).toBeVisible();

    // La IA recibió el ID seudónimo y las líneas del apunte, con la ref de su generación y su sección
    expect(proxy.engineCalls()).toHaveLength(1);
    const body = proxy.engineCalls()[0]?.body;
    expect(body?.studentRef).toBe(app?.user.id);
    expect(JSON.stringify(body?.input)).toContain(FIRST_LINE);
    expect(body?.generation).toMatchObject({ section: 0 });
    // No salió ninguna propuesta, ni simulada, y no se guardó una generación
    expect(within(panel).queryByRole('listitem', { name: t.outlines.ai.proposal(1) })).toBeNull();
    expect(await app?.api.repos.aiArtifacts.list()).toHaveLength(0);
  });
});
