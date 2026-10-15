import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiAuthHeaders, aiBaseUrl, aiIsHosted } from './endpoint';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  loadCloud: () => Promise.resolve(holder.cloud),
}));

afterEach(() => {
  holder.cloud = null;
});

describe('aiBaseUrl', () => {
  it('sin configurar, o con algo que no es un origen https, usa el proxy local', () => {
    for (const value of [
      undefined,
      '',
      'http://ia.studiare.mx',
      'https://',
      'ia.studiare.mx',
      'https://ia.studiare.mx/ruta',
      'https://ia.studiare.mx/functions/v1/otra-funcion',
      'https://ia.studiare.mx/functions/v1/ai-proxy/health',
      'javascript:alert(1)',
      'https://ia studiare.mx',
      42,
    ]) {
      expect(aiBaseUrl({ VITE_AI_URL: value })).toBe('/api');
    }
  });

  it('con un origen https lo usa, sin la diagonal final', () => {
    expect(aiBaseUrl({ VITE_AI_URL: 'https://ia.studiare.mx/' })).toBe('https://ia.studiare.mx');
    expect(aiBaseUrl({ VITE_AI_URL: ' https://ia.studiare.mx:8443 ' })).toBe(
      'https://ia.studiare.mx:8443',
    );
  });

  it('acepta también un origen con la ruta de la función de Supabase', () => {
    expect(aiBaseUrl({ VITE_AI_URL: 'https://abcd1234.supabase.co/functions/v1/ai-proxy/' })).toBe(
      'https://abcd1234.supabase.co/functions/v1/ai-proxy',
    );
  });

  it('en un build de producción con Supabase usa la función ai-proxy sin variables nuevas', () => {
    expect(aiBaseUrl({ PROD: true, VITE_SUPABASE_URL: 'https://abcd1234.supabase.co' })).toBe(
      'https://abcd1234.supabase.co/functions/v1/ai-proxy',
    );
    // VITE_AI_URL manda sobre la de Supabase
    expect(
      aiBaseUrl({
        PROD: true,
        VITE_SUPABASE_URL: 'https://abcd1234.supabase.co',
        VITE_AI_URL: 'https://ia.studiare.mx',
      }),
    ).toBe('https://ia.studiare.mx');
  });

  it('en desarrollo, o con una dirección de Supabase rara, sigue en el proxy local', () => {
    expect(aiBaseUrl({ VITE_SUPABASE_URL: 'https://abcd1234.supabase.co' })).toBe('/api');
    expect(aiBaseUrl({ PROD: true })).toBe('/api');
    for (const value of ['http://abcd1234.supabase.co', 'https://otro.dominio.com', 7]) {
      expect(aiBaseUrl({ PROD: true, VITE_SUPABASE_URL: value })).toBe('/api');
    }
  });

  it('distingue el proxy alojado del local', () => {
    expect(aiIsHosted('/api')).toBe(false);
    expect(aiIsHosted('https://ia.studiare.mx')).toBe(true);
    expect(aiIsHosted('https://abcd1234.supabase.co/functions/v1/ai-proxy')).toBe(true);
  });
});

describe('aiAuthHeaders', () => {
  it('con el proxy local no manda nada, ni siquiera si hay sesión', async () => {
    holder.cloud = { auth: { getSession: () => Promise.reject(new Error('no debe llamarse')) } };
    expect(await aiAuthHeaders('/api')).toEqual({});
  });

  it('con el proxy alojado manda el token de la sesión', async () => {
    holder.cloud = {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: 'abc.def' } } }),
      },
    };
    expect(await aiAuthHeaders('https://ia.studiare.mx')).toEqual({
      authorization: 'Bearer abc.def',
    });
  });

  it('sin sesión o sin el SDK no manda nada y el proxy contesta que falta iniciar sesión', async () => {
    expect(await aiAuthHeaders('https://ia.studiare.mx')).toEqual({});
    holder.cloud = { auth: { getSession: () => Promise.resolve({ data: { session: null } }) } };
    expect(await aiAuthHeaders('https://ia.studiare.mx')).toEqual({});
  });
});
