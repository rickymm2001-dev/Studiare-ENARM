import { describe, expect, it } from 'vitest';
import {
  aiOriginOf,
  buildHeaderCsp,
  buildHeadersFile,
  buildMetaCsp,
  supabaseOriginOf,
} from './csp';

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('supabaseOriginOf', () => {
  it('acepta el formato oficial y quita la diagonal final', () => {
    expect(supabaseOriginOf('https://abcd1234.supabase.co')).toBe('https://abcd1234.supabase.co');
    expect(supabaseOriginOf(' https://abcd1234.supabase.co/ ')).toBe(
      'https://abcd1234.supabase.co',
    );
  });

  it('rechaza cualquier otro dominio, protocolo o ruta', () => {
    for (const url of [
      undefined,
      '',
      'http://abcd1234.supabase.co',
      'https://abcd1234.supabase.co.malo.com',
      'https://malo.com/abcd.supabase.co',
      'https://abcd1234.supabase.co/rest/v1',
      'https://*.supabase.co',
      'wss://abcd1234.supabase.co',
    ]) {
      expect(supabaseOriginOf(url)).toBeUndefined();
    }
  });
});

describe('aiOriginOf', () => {
  it('acepta un origen https y quita la diagonal final', () => {
    expect(aiOriginOf('https://ia.studiare.mx')).toBe('https://ia.studiare.mx');
    expect(aiOriginOf(' https://ia.studiare.mx:8443/ ')).toBe('https://ia.studiare.mx:8443');
  });

  it('rechaza http, comodines, rutas, espacios y texto que no es una dirección', () => {
    for (const url of [
      undefined,
      '',
      'http://ia.studiare.mx',
      'https://*.studiare.mx',
      'https://ia.studiare.mx/ia',
      'https://ia studiare.mx',
      'https://ia.studiare.mx; script-src *',
      'javascript:alert(1)',
    ]) {
      expect(aiOriginOf(url)).toBeUndefined();
    }
  });
});

describe('política de seguridad de contenido', () => {
  it('no permite scripts en línea ni eval, solo scripts propios y WebAssembly', () => {
    for (const policy of [buildMetaCsp(), buildHeaderCsp()]) {
      expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(directive(policy, 'object-src')).toBe("'none'");
      expect(directive(policy, 'base-uri')).toBe("'self'");
      expect(directive(policy, 'default-src')).toBe("'self'");
    }
  });

  it('sin Supabase solo se conecta al propio sitio, y con él suma su origen y nada más', () => {
    expect(directive(buildMetaCsp(), 'connect-src')).toBe("'self'");
    expect(
      directive(buildMetaCsp({ supabaseOrigin: 'https://abcd1234.supabase.co' }), 'connect-src'),
    ).toBe("'self' https://abcd1234.supabase.co");
  });

  it('con el proxy de IA alojado suma su origen exacto, junto a Supabase', () => {
    const policy = buildMetaCsp({
      supabaseOrigin: 'https://abcd1234.supabase.co',
      aiOrigin: 'https://ia.studiare.mx',
    });
    expect(directive(policy, 'connect-src')).toBe(
      "'self' https://abcd1234.supabase.co https://ia.studiare.mx",
    );
    expect(directive(buildMetaCsp({ aiOrigin: 'https://ia.studiare.mx' }), 'connect-src')).toBe(
      "'self' https://ia.studiare.mx",
    );
  });

  it('frame-ancestors va solo en los encabezados, porque en una etiqueta meta se ignora', () => {
    expect(buildMetaCsp()).not.toContain('frame-ancestors');
    expect(directive(buildHeaderCsp(), 'frame-ancestors')).toBe("'none'");
  });

  it('el archivo _headers lleva la política completa y los demás encabezados', () => {
    const file = buildHeadersFile({ supabaseOrigin: 'https://abcd1234.supabase.co' });
    expect(file.startsWith('/*\n')).toBe(true);
    expect(file).toContain(
      `Content-Security-Policy: ${buildHeaderCsp({ supabaseOrigin: 'https://abcd1234.supabase.co' })}`,
    );
    expect(file).toContain('X-Content-Type-Options: nosniff');
    expect(file).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(file).toContain('X-Frame-Options: DENY');
  });
});
