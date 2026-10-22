import { describe, expect, it } from 'vitest';
import {
  aiOriginOf,
  buildHeaderCsp,
  buildHeadersFile,
  buildMetaCsp,
  posthogOriginOf,
  sentryOriginOf,
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

  it('acepta la dirección con ruta, como la de la función de Supabase, y se queda con el origen', () => {
    expect(aiOriginOf('https://abcd1234.supabase.co/functions/v1/ai-proxy')).toBe(
      'https://abcd1234.supabase.co',
    );
    expect(aiOriginOf(' https://ia.studiare.mx:8443/ia/ ')).toBe('https://ia.studiare.mx:8443');
  });

  it('rechaza http, comodines, espacios, consultas y texto que no es una dirección', () => {
    for (const url of [
      undefined,
      '',
      'http://ia.studiare.mx',
      'https://*.studiare.mx',
      'https://ia.studiare.mx/ia?x=1',
      'https://ia.studiare.mx/ia#a',
      'https://ia.studiare.mx/a b',
      'https://ia studiare.mx',
      'https://ia.studiare.mx; script-src *',
      'javascript:alert(1)',
    ]) {
      expect(aiOriginOf(url)).toBeUndefined();
    }
  });
});

describe('posthogOriginOf (B15, 5.1)', () => {
  it('acepta solo los dos orígenes de captura de PostHog Cloud, con o sin diagonal final', () => {
    expect(posthogOriginOf('https://us.i.posthog.com')).toBe('https://us.i.posthog.com');
    expect(posthogOriginOf(' https://eu.i.posthog.com/ ')).toBe('https://eu.i.posthog.com');
  });

  it('rechaza cualquier otro dominio, protocolo, ruta o comodín', () => {
    for (const url of [
      undefined,
      '',
      'http://us.i.posthog.com',
      'https://app.posthog.com',
      'https://us.posthog.com',
      'https://us.i.posthog.com.malo.com',
      'https://us.i.posthog.com/batch/',
      'https://*.posthog.com',
      'https://malo.com/us.i.posthog.com',
      'https://us.i.posthog.com; script-src *',
    ]) {
      expect(posthogOriginOf(url)).toBeUndefined();
    }
  });
});

describe('sentryOriginOf (B15, 5.1)', () => {
  const KEY = '0123456789abcdef0123456789abcdef';

  it('saca el origen de un DSN con la forma de Sentry, con o sin región en medio', () => {
    expect(
      sentryOriginOf(`https://${KEY}@o4500000000000000.ingest.sentry.io/4500000000000001`),
    ).toBe('https://o4500000000000000.ingest.sentry.io');
    expect(sentryOriginOf(`https://${KEY}@o123.ingest.us.sentry.io/456`)).toBe(
      'https://o123.ingest.us.sentry.io',
    );
    expect(sentryOriginOf(` https://${KEY}@o123.ingest.de.sentry.io/456 `)).toBe(
      'https://o123.ingest.de.sentry.io',
    );
  });

  it('rechaza un DSN con otro dominio, sin proyecto, sin llave, con http o con rutas raras', () => {
    for (const dsn of [
      undefined,
      '',
      `http://${KEY}@o123.ingest.sentry.io/456`,
      `https://${KEY}@o123.ingest.sentry.io`,
      `https://${KEY}@o123.ingest.sentry.io/456/extra`,
      `https://${KEY}@o123.ingest.sentry.io/abc`,
      `https://${KEY}@malo.com/456`,
      `https://${KEY}@o123.ingest.sentry.io.malo.com/456`,
      `https://${KEY}@sentry.malo.com/456`,
      `https://${KEY}@o123.ingest.xx.sentry.io/456`,
      'https://o123.ingest.sentry.io/456',
      `https://corta@o123.ingest.sentry.io/456`,
      `https://${KEY}@o123.ingest.sentry.io/456; script-src *`,
      `https://*@o123.ingest.sentry.io/456`,
    ]) {
      expect(sentryOriginOf(dsn)).toBeUndefined();
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

  it('PostHog y Sentry se suman solo a connect-src y script-src no cambia (B15, 5.1)', () => {
    const options = {
      supabaseOrigin: 'https://abcd1234.supabase.co',
      posthogOrigin: 'https://us.i.posthog.com',
      sentryOrigin: 'https://o123.ingest.sentry.io',
    };
    for (const policy of [buildMetaCsp(options), buildHeaderCsp(options)]) {
      expect(directive(policy, 'connect-src')).toBe(
        "'self' https://abcd1234.supabase.co https://us.i.posthog.com https://o123.ingest.sentry.io",
      );
      expect(directive(policy, 'script-src')).toBe("'self' 'wasm-unsafe-eval'");
      expect(directive(policy, 'default-src')).toBe("'self'");
      // Ni el origen de PostHog ni el de Sentry aparecen en otra directiva
      for (const name of ['img-src', 'frame-src', 'form-action', 'worker-src']) {
        expect(directive(policy, name)).not.toMatch(/posthog|sentry/);
      }
    }
    expect(buildMetaCsp({ posthogOrigin: 'https://eu.i.posthog.com' })).toContain(
      "connect-src 'self' https://eu.i.posthog.com;",
    );
  });

  it('sin las variables de PostHog y de Sentry la política queda como estaba (B15)', () => {
    expect(buildMetaCsp({ posthogOrigin: undefined, sentryOrigin: undefined })).toBe(
      buildMetaCsp(),
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
