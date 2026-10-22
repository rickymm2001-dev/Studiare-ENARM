// email-unsubscribe, la baja de un clic de Gmail y Yahoo, la de la página de la app y la redirección del GET
// (B15, 3.6). La base se imita con una lista de fichas en memoria
import { describe, expect, it } from 'vitest';
import { handleEmailUnsubscribe, type UnsubscribeDeps } from './unsubscribe.ts';

const GOOD = '0123456789abcdef0123456789abcdef0123';
const GONE = 'fedcba9876543210fedcba9876543210fedc';
const APP = 'https://app.ejemplo.mx/Studiare-ENARM';
const FUNCTION_URL = 'https://proyecto.supabase.co/functions/v1/email-unsubscribe';

function setup(options: { appUrl?: string | undefined } = {}) {
  const state = { calls: [] as string[], logs: [] as string[], unsubscribed: new Set<string>() };
  const deps: UnsubscribeDeps = {
    appUrl: 'appUrl' in options ? options.appUrl : APP,
    unsubscribe: (token) => {
      state.calls.push(token);
      if (token !== GOOD) return Promise.resolve('invalid');
      if (state.unsubscribed.has(token)) return Promise.resolve('already');
      state.unsubscribed.add(token);
      return Promise.resolve('done');
    },
    log: (line) => state.logs.push(line),
  };
  return { deps, state };
}

const oneClick = (query: string, body = 'List-Unsubscribe=One-Click') =>
  new Request(`${FUNCTION_URL}${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });

const fromPage = (body: unknown, origin = 'https://app.ejemplo.mx') =>
  new Request(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  });

describe('baja de un clic del correo', () => {
  it('apaga el recordatorio y responde 200 en blanco', async () => {
    const { deps, state } = setup();
    const response = await handleEmailUnsubscribe(oneClick(`?t=${GOOD}`), deps);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(state.calls).toEqual([GOOD]);
    expect(state.unsubscribed.has(GOOD)).toBe(true);
  });

  it('responde 200 en blanco ante una ficha falsa, una que no existe, una mala o ninguna', async () => {
    for (const query of [
      `?t=${GONE}`,
      '?t=falsa',
      '?t=',
      '',
      `?t=${GOOD.toUpperCase()}`,
      "?t='or 1=1--",
    ]) {
      const { deps } = setup();
      const response = await handleEmailUnsubscribe(oneClick(query), deps);
      expect(response.status, query).toBe(200);
      expect(await response.text(), query).toBe('');
    }
  });

  it('una ficha que no tiene la forma ni se manda a la base', async () => {
    const { deps, state } = setup();
    await handleEmailUnsubscribe(oneClick('?t=falsa'), deps);
    await handleEmailUnsubscribe(oneClick(''), deps);
    await handleEmailUnsubscribe(oneClick(`?t=${GOOD}0`), deps);
    expect(state.calls).toEqual([]);
  });

  it('repetirla sigue respondiendo lo mismo', async () => {
    const { deps } = setup();
    const first = await handleEmailUnsubscribe(oneClick(`?t=${GOOD}`), deps);
    const second = await handleEmailUnsubscribe(oneClick(`?t=${GOOD}`), deps);
    expect(second.status).toBe(first.status);
    expect(await second.text()).toBe(await first.text());
  });

  it('no deja rastro de la ficha en el registro', async () => {
    const { deps, state } = setup();
    await handleEmailUnsubscribe(oneClick(`?t=${GOOD}`), deps);
    expect(state.logs).toEqual([]);
  });

  it('si la base falla no finge que dio de baja', async () => {
    const { deps } = setup();
    deps.unsubscribe = () => Promise.reject(new Error('la base se cayó'));
    await expect(handleEmailUnsubscribe(oneClick(`?t=${GOOD}`), deps)).rejects.toThrow(
      'la base se cayó',
    );
  });
});

describe('baja desde la página de la app', () => {
  it('contesta done, already o invalid según la ficha', async () => {
    const { deps } = setup();
    const done = await handleEmailUnsubscribe(fromPage({ token: GOOD }), deps);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ result: 'done' });
    expect(await (await handleEmailUnsubscribe(fromPage({ token: GOOD }), deps)).json()).toEqual({
      result: 'already',
    });
    expect(await (await handleEmailUnsubscribe(fromPage({ token: GONE }), deps)).json()).toEqual({
      result: 'invalid',
    });
  });

  it('una ficha o un cuerpo que no sirven dicen invalid sin tocar la base', async () => {
    const { deps, state } = setup();
    for (const body of [{ token: 'falsa' }, { token: 5 }, { token: null }, {}, [], 'texto', null]) {
      const response = await handleEmailUnsubscribe(fromPage(body), deps);
      expect(await response.json(), JSON.stringify(body)).toEqual({ result: 'invalid' });
    }
    const broken = new Request(FUNCTION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{no es json',
    });
    expect(await (await handleEmailUnsubscribe(broken, deps)).json()).toEqual({
      result: 'invalid',
    });
    expect(state.calls).toEqual([]);
  });

  it('solo la página de la app puede leer la respuesta desde el navegador', async () => {
    const { deps } = setup();
    const allowed = await handleEmailUnsubscribe(fromPage({ token: GONE }), deps);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
    const other = await handleEmailUnsubscribe(
      fromPage({ token: GONE }, 'https://malo.example'),
      deps,
    );
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(allowed.headers.get('cache-control')).toBe('no-store');
  });

  it('contesta la consulta previa del navegador', async () => {
    const { deps } = setup();
    const response = await handleEmailUnsubscribe(
      new Request(FUNCTION_URL, {
        method: 'OPTIONS',
        headers: { origin: 'https://app.ejemplo.mx' },
      }),
      deps,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.ejemplo.mx');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('GET con redirección', () => {
  it('manda a la página de la app con la ficha y no da de baja a nadie', async () => {
    const { deps, state } = setup();
    const response = await handleEmailUnsubscribe(new Request(`${FUNCTION_URL}?t=${GOOD}`), deps);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${APP}/correo/baja?t=${GOOD}`);
    expect(state.calls).toEqual([]);
    expect(state.unsubscribed.size).toBe(0);
  });

  it('una ficha que no tiene la forma no viaja en la redirección', async () => {
    const { deps } = setup();
    for (const query of ['?t=falsa', '', '?t=<script>alert(1)</script>']) {
      const response = await handleEmailUnsubscribe(new Request(`${FUNCTION_URL}${query}`), deps);
      expect(response.status, query).toBe(302);
      expect(response.headers.get('location'), query).toBe(`${APP}/correo/baja`);
    }
  });

  it('sin la dirección de la app no inventa una', async () => {
    const { deps } = setup({ appUrl: undefined });
    const response = await handleEmailUnsubscribe(new Request(`${FUNCTION_URL}?t=${GOOD}`), deps);
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });
});

describe('otros métodos', () => {
  it('rechaza lo que no es GET, POST ni OPTIONS', async () => {
    const { deps, state } = setup();
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const response = await handleEmailUnsubscribe(
        new Request(`${FUNCTION_URL}?t=${GOOD}`, { method }),
        deps,
      );
      expect(response.status, method).toBe(405);
    }
    expect(state.calls).toEqual([]);
  });
});
