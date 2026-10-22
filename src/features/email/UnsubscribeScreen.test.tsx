// @vitest-environment jsdom
// Darte de baja de los recordatorios (B15, 3.6). Pantalla pública: pregunta antes de hacer nada y solo da de
// baja al tocar el botón, para que los revisores de enlaces del correo, que abren con GET, no den de baja a nadie
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { DataProvider } from '@/data/DataProvider';
import { engagementTexts } from '@/i18n/engagement';
import { t } from '@/i18n/es-MX';
import { requestUnsubscribe } from './requestUnsubscribe';
import { UnsubscribeScreen } from './UnsubscribeScreen';

const text = engagementTexts.unsubscribe;
const TOKEN = '0123456789abcdef0123456789abcdef0123';
const CONFIG = { url: 'https://abcd1234.supabase.co', publicKey: 'x'.repeat(30) };

let requests: { url: string; init: RequestInit }[];
let reply: () => Promise<Response>;

beforeEach(() => {
  requests = [];
  reply = () => Promise.resolve(Response.json({ result: 'done' }));
  vi.stubEnv('VITE_SUPABASE_URL', CONFIG.url);
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_' + 'simulada_para_pruebas_0123456789');
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      requests.push({ url, init });
      return reply();
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function open(search: string) {
  const router = createMemoryRouter(
    [
      { path: SCREENS.unsubscribe.path, Component: UnsubscribeScreen },
      { path: '*', element: <p>otra pantalla</p> },
    ],
    { initialEntries: [`${SCREENS.unsubscribe.path}${search}`] },
  );
  render(
    <DataProvider kind="real">
      <RouterProvider router={router} />
    </DataProvider>,
  );
  return router;
}

describe('requestUnsubscribe', () => {
  const ok = (data: unknown) => () => Promise.resolve(Response.json(data));

  it('manda la ficha en el cuerpo de un POST en JSON, sin cookies ni referente', async () => {
    const fetchFn = vi.fn(ok({ result: 'done' }));
    await expect(requestUnsubscribe(TOKEN, fetchFn as never, CONFIG)).resolves.toBe('done');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://abcd1234.supabase.co/functions/v1/email-unsubscribe');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ token: TOKEN }));
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    // La ficha no viaja en la dirección
    expect(url).not.toContain(TOKEN);
  });

  it('entiende las tres respuestas y cualquier otra cosa es una falla', async () => {
    for (const result of ['done', 'already', 'invalid'] as const) {
      await expect(requestUnsubscribe(TOKEN, ok({ result }) as never, CONFIG)).resolves.toBe(
        result,
      );
    }
    await expect(requestUnsubscribe(TOKEN, ok({ result: 'otro' }) as never, CONFIG)).resolves.toBe(
      'failed',
    );
    await expect(requestUnsubscribe(TOKEN, ok('texto') as never, CONFIG)).resolves.toBe('failed');
    const error = () => Promise.resolve(new Response('x', { status: 500 }));
    await expect(requestUnsubscribe(TOKEN, error as never, CONFIG)).resolves.toBe('failed');
    const throwing = () => Promise.reject(new TypeError('Failed to fetch'));
    await expect(requestUnsubscribe(TOKEN, throwing as never, CONFIG)).resolves.toBe('failed');
  });

  it('una ficha con otra forma ni se manda, y sin la nube configurada no hay a quién preguntar', async () => {
    const fetchFn = vi.fn(ok({ result: 'done' }));
    for (const token of ['', 'abc', TOKEN.toUpperCase(), `${TOKEN}0`, 'ana@correo.mx']) {
      await expect(requestUnsubscribe(token, fetchFn as never, CONFIG)).resolves.toBe('invalid');
    }
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(requestUnsubscribe(TOKEN, fetchFn as never, null)).resolves.toBe('failed');
  });
});

describe('Darte de baja', () => {
  it('con una ficha buena pregunta primero y no manda nada hasta tocar el botón', async () => {
    const typing = userEvent.setup();
    open(`?t=${TOKEN}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: t.screens.unsubscribe.title }),
    ).toBeVisible();
    expect(screen.getByText(text.question)).toBeVisible();
    // Solo abrir la página, como hace un revisor de enlaces, no da de baja a nadie
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toEqual([]);

    await typing.click(screen.getByRole('button', { name: text.confirm }));
    expect(await screen.findByText(text.done)).toBeVisible();
    expect(requests).toHaveLength(1);
  });

  it('al terminar quita la ficha de la dirección', async () => {
    const typing = userEvent.setup();
    const router = open(`?t=${TOKEN}`);
    await typing.click(await screen.findByRole('button', { name: text.confirm }));
    await screen.findByText(text.done);
    expect(router.state.location.search).toBe('');
  });

  it('si ya estaba dado de baja lo dice', async () => {
    reply = () => Promise.resolve(Response.json({ result: 'already' }));
    const typing = userEvent.setup();
    open(`?t=${TOKEN}`);
    await typing.click(await screen.findByRole('button', { name: text.confirm }));
    expect(await screen.findByText(text.already)).toBeVisible();
  });

  it('una ficha mala o vencida lo dice y explica cómo apagarlos desde la app', async () => {
    open('?t=malo');
    expect(await screen.findByText(text.invalid)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.confirm })).toBeNull();
    expect(screen.getByRole('link', { name: text.goToSettings })).toHaveAttribute(
      'href',
      '/repasar?ajustes=recordatorios',
    );
    cleanup();
    open('');
    expect(await screen.findByText(text.invalid)).toBeVisible();
    expect(requests).toEqual([]);
  });

  it('si el servidor dice que la ficha no existe, lo dice igual', async () => {
    reply = () => Promise.resolve(Response.json({ result: 'invalid' }));
    const typing = userEvent.setup();
    open(`?t=${TOKEN}`);
    await typing.click(await screen.findByRole('button', { name: text.confirm }));
    expect(await screen.findByText(text.invalid)).toBeVisible();
  });

  it('si falla la red lo dice, conserva la ficha y deja volver a intentar', async () => {
    reply = () => Promise.reject(new TypeError('Failed to fetch'));
    const typing = userEvent.setup();
    const router = open(`?t=${TOKEN}`);
    await typing.click(await screen.findByRole('button', { name: text.confirm }));
    expect(await screen.findByText(text.failed)).toBeVisible();
    expect(router.state.location.search).toBe(`?t=${TOKEN}`);
    reply = () => Promise.resolve(Response.json({ result: 'done' }));
    await typing.click(screen.getByRole('button', { name: text.confirm }));
    await waitFor(() => {
      expect(screen.getByText(text.done)).toBeVisible();
    });
  });

  it('no pide sesión ni trae nada de la cuenta', async () => {
    open(`?t=${TOKEN}`);
    await screen.findByText(text.question);
    expect(document.body.textContent).not.toMatch(/@/);
  });
});
