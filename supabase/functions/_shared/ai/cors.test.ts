import { describe, expect, it } from 'vitest';
import { corsHeaders } from '../http.ts';
import { CORS_ALLOW_HEADERS, parseOrigins, preflightHeadersFor } from './cors.ts';

describe('orígenes de APP_ORIGINS', () => {
  it('acepta orígenes https exactos y limpia espacios y diagonales', () => {
    expect(parseOrigins(' https://rickymm2001-dev.github.io/ , https://studiare.mx:8443')).toEqual({
      ok: true,
      origins: ['https://rickymm2001-dev.github.io', 'https://studiare.mx:8443'],
    });
  });

  it('usa la misma lectura que las demás funciones y no repite un origen', () => {
    expect(parseOrigins('https://a.mx,https://a.mx/, https://b.mx')).toEqual({
      ok: true,
      origins: ['https://a.mx', 'https://b.mx'],
    });
  });

  it('una dirección de pages.dev no sirve, y el problema no la repite', () => {
    const result = parseOrigins('https://a.mx,https://secreta.studiare.pages.dev');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem).toContain('pages.dev');
    expect(result.problem).not.toContain('secreta');
  });

  it('rechaza vacío, http, comodines y rutas', () => {
    for (const value of [
      '',
      ' , ',
      'http://studiare.mx',
      'https://*.studiare.mx',
      'https://studiare.mx/app',
    ]) {
      expect(parseOrigins(value).ok, value).toBe(false);
    }
  });
});

describe('encabezados', () => {
  it('el preflight trae métodos, encabezados y max-age', () => {
    expect(preflightHeadersFor('https://a.mx')).toEqual({
      'access-control-allow-origin': 'https://a.mx',
      vary: 'Origin',
      'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
      'access-control-max-age': '600',
    });
  });

  it('pide los mismos encabezados que las demás funciones', () => {
    expect(corsHeaders({}, null)['access-control-allow-headers']).toBe(CORS_ALLOW_HEADERS);
  });
});
