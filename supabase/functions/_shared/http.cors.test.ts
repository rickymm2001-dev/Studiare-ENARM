// El CORS de las funciones con APP_URL y APP_ORIGINS (B17, 4.1). Vive en su archivo para no chocar con
// payments.test.ts. Revisa la lectura de la lista de orígenes, corsHeaders y que cada función que atiende al
// navegador deje pasar el origen nuevo y el viejo juntos durante una mudanza de dominio, y a nadie más.
import { describe, expect, it } from 'vitest';
import type { BankSyncStore } from './bank/sync.ts';
import { handleBankSync } from './bank/sync.ts';
import type { FunctionEnv } from './billingTypes.ts';
import { allowedOrigins, corsHeaders, originOf } from './http.ts';
import { handleCancelSubscription } from './mercadopago.ts';
import { handleResetMfa } from './mfaReset.ts';
import { monitoringDepsFrom } from './monitoring.ts';
import { handleMonitoringTest } from './monitoringTest.ts';
import { handleCreateCheckout, handleCreatePortal } from './payments.ts';
import { originIssue, parseOriginList } from './origins.ts';
import { handleEmailUnsubscribe } from './unsubscribe.ts';

const NEW_ORIGIN = 'https://studiare.example.mx';
const OLD_ORIGIN = 'https://rickymm2001-dev.github.io';
const OTHER_ORIGIN = 'https://intruso.example.com';
// Orígenes que se parecen a uno permitido sin serlo. Una comparación por sufijo, prefijo o subcadena en lugar
// de la igualdad exacta los dejaría pasar, y con ellos cualquier sitio ajeno podría llamar a las funciones
const LOOKALIKES = [
  'https://evil-studiare.example.mx', // termina igual que el permitido
  'https://studiare.example.mx.evil.com', // empieza igual que el permitido
  'https://sub.studiare.example.mx', // subdominio del permitido
  'https://studiare.example.mx:8443', // otro puerto
  'http://studiare.example.mx', // otro esquema
  'https://studiare.example.mx/', // con diagonal final, que un Origin real nunca trae
  'https://evil-rickymm2001-dev.github.io',
  'https://rickymm2001-dev.github.io.evil.com',
];

describe('la lista APP_ORIGINS', () => {
  it('acepta orígenes https exactos, con o sin puerto, y limpia espacios y diagonales finales', () => {
    expect(parseOriginList(` ${OLD_ORIGIN}/ , ${NEW_ORIGIN}:8443 `)).toEqual({
      origins: [OLD_ORIGIN, `${NEW_ORIGIN}:8443`],
      issues: [],
    });
  });

  it('no repite un origen y salta las comas de sobra', () => {
    expect(parseOriginList(`${OLD_ORIGIN},,${OLD_ORIGIN}/, `).origins).toEqual([OLD_ORIGIN]);
    expect(parseOriginList(undefined)).toEqual({ origins: [], issues: [] });
    expect(parseOriginList('')).toEqual({ origins: [], issues: [] });
  });

  it('rechaza http, rutas, comodines, usuarios, mayúsculas y lo que no es una dirección', () => {
    for (const value of [
      'http://studiare.example.mx',
      'https://studiare.example.mx/app',
      'https://*.studiare.example.mx',
      'https://usuario@studiare.example.mx',
      'https://Studiare.example.mx',
      'https://studiare.example.mx?x=1',
      'studiare.example.mx',
      '*',
      'https://',
    ]) {
      expect(originIssue(value), value).toBe('invalid');
      expect(parseOriginList(value), value).toEqual({ origins: [], issues: ['invalid'] });
    }
  });

  it('nunca deja pasar una dirección de pages.dev, porque cualquiera puede publicar en un subdominio', () => {
    for (const value of [
      'https://studiare.pages.dev',
      'https://a1b2c3d4.studiare.pages.dev',
      'https://pages.dev',
      'https://studiare.pages.dev:8443',
    ]) {
      expect(originIssue(value), value).toBe('pages_dev');
      expect(parseOriginList(value).origins, value).toEqual([]);
    }
    // Otro dominio que solo se parece no es de pages.dev
    expect(originIssue('https://notpages.dev')).toBeNull();
    expect(originIssue('https://pages.dev.example.mx')).toBeNull();
  });

  it('una entrada mala no quita las buenas, que es lo que hace el CORS de las funciones', () => {
    const list = parseOriginList(
      `${NEW_ORIGIN},https://*.malo.com,https://x.pages.dev,${OLD_ORIGIN}`,
    );
    expect(list.origins).toEqual([NEW_ORIGIN, OLD_ORIGIN]);
    expect(list.issues).toEqual(['invalid', 'pages_dev']);
  });

  it('el aviso de un problema nunca trae la entrada', () => {
    expect(JSON.stringify(parseOriginList('https://secreto-a-medias.pages.dev'))).not.toContain(
      'secreto',
    );
  });
});

describe('allowedOrigins y corsHeaders', () => {
  it('sin APP_ORIGINS deja pasar solo el origen de APP_URL, aunque lleve ruta, como hasta hoy', () => {
    expect(allowedOrigins({ APP_URL: `${OLD_ORIGIN}/Studiare-ENARM/` })).toEqual([OLD_ORIGIN]);
    const headers = corsHeaders({ APP_URL: `${OLD_ORIGIN}/Studiare-ENARM/` }, OLD_ORIGIN);
    expect(headers['access-control-allow-origin']).toBe(OLD_ORIGIN);
    expect(corsHeaders({ APP_URL: OLD_ORIGIN }, NEW_ORIGIN)['access-control-allow-origin']).toBe(
      undefined,
    );
  });

  it('con APP_ORIGINS deja pasar los dos, cada uno con su propio eco y nunca un asterisco', () => {
    const env = { APP_URL: `${NEW_ORIGIN}/`, APP_ORIGINS: `${NEW_ORIGIN},${OLD_ORIGIN}` };
    expect(allowedOrigins(env)).toEqual([NEW_ORIGIN, OLD_ORIGIN]);
    expect(corsHeaders(env, NEW_ORIGIN)['access-control-allow-origin']).toBe(NEW_ORIGIN);
    expect(corsHeaders(env, OLD_ORIGIN)['access-control-allow-origin']).toBe(OLD_ORIGIN);
    expect(corsHeaders(env, OTHER_ORIGIN)['access-control-allow-origin']).toBeUndefined();
    expect(corsHeaders(env, null)['access-control-allow-origin']).toBeUndefined();
    expect(Object.values(corsHeaders(env, OLD_ORIGIN))).not.toContain('*');
  });

  it('APP_ORIGINS solo, sin APP_URL, también sirve', () => {
    expect(allowedOrigins({ APP_ORIGINS: NEW_ORIGIN })).toEqual([NEW_ORIGIN]);
    expect(
      corsHeaders({ APP_ORIGINS: NEW_ORIGIN }, NEW_ORIGIN)['access-control-allow-origin'],
    ).toBe(NEW_ORIGIN);
  });

  it('una lista vacía, rota o con pages.dev no abre nada más', () => {
    for (const APP_ORIGINS of [
      '',
      ' , ',
      'basura',
      '*',
      'https://*.x.com',
      'https://x.pages.dev',
    ]) {
      expect(allowedOrigins({ APP_URL: OLD_ORIGIN, APP_ORIGINS }), APP_ORIGINS).toEqual([
        OLD_ORIGIN,
      ]);
    }
    expect(allowedOrigins({})).toEqual([]);
    expect(allowedOrigins({ APP_URL: 'no es una url' })).toEqual([]);
    expect(
      corsHeaders({ APP_ORIGINS: 'https://x.pages.dev' }, 'https://x.pages.dev')[
        'access-control-allow-origin'
      ],
    ).toBeUndefined();
  });

  it('no repite el origen de APP_URL cuando también está en la lista', () => {
    expect(allowedOrigins({ APP_URL: `${NEW_ORIGIN}/`, APP_ORIGINS: NEW_ORIGIN })).toEqual([
      NEW_ORIGIN,
    ]);
  });

  it('no deja pasar un origen que solo se parece al permitido por su final, su inicio, su puerto o su esquema', () => {
    const env = { APP_URL: `${NEW_ORIGIN}/`, APP_ORIGINS: `${NEW_ORIGIN},${OLD_ORIGIN}` };
    for (const origin of LOOKALIKES) {
      expect(corsHeaders(env, origin)['access-control-allow-origin'], origin).toBeUndefined();
    }
    // Y los permitidos de verdad siguen pasando con su propio eco
    for (const origin of [NEW_ORIGIN, OLD_ORIGIN]) {
      expect(corsHeaders(env, origin)['access-control-allow-origin'], origin).toBe(origin);
    }
  });

  it('siempre avisa que la respuesta depende del origen y pide los mismos encabezados', () => {
    const headers = corsHeaders({ APP_URL: OLD_ORIGIN }, null);
    expect(headers.vary).toBe('origin');
    expect(headers['access-control-allow-methods']).toBe('POST, OPTIONS');
    expect(headers['access-control-allow-headers']).toBe(
      'authorization, content-type, apikey, x-client-info',
    );
    expect(originOf('no es una url')).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------
// Cada función que atiende al navegador

const unused = (): never => {
  throw new Error('Esta prueba no debe llegar hasta aquí');
};
const quiet = () => undefined;
const noFetch: typeof fetch = () => Promise.reject(new Error('Esta prueba no sale a la red'));
const noUser = () => Promise.resolve(null);

interface Caller {
  name: string;
  /** Llama a la función con esas variables y esa petición */
  call: (env: FunctionEnv, request: Request) => Promise<Response>;
  /** Si responde 401 a un POST sin sesión ni ficha, con los mismos encabezados de CORS */
  rejectsUnauthenticated: boolean;
}

const payments = (env: FunctionEnv) => ({
  env,
  fetch: noFetch,
  now: () => 0,
  log: quiet,
  authenticate: noUser,
  checkoutContext: unused,
});

const CALLERS: Caller[] = [
  {
    name: 'create-checkout',
    call: (env, request) =>
      handleCreateCheckout(request, { ...payments(env), linkCustomer: unused }),
    rejectsUnauthenticated: true,
  },
  {
    name: 'create-portal-session',
    call: (env, request) => handleCreatePortal(request, payments(env)),
    rejectsUnauthenticated: true,
  },
  {
    name: 'cancel-subscription',
    call: (env, request) =>
      handleCancelSubscription(request, { ...payments(env), applySubscriptionState: unused }),
    rejectsUnauthenticated: true,
  },
  {
    name: 'admin-reset-mfa',
    call: (env, request) =>
      handleResetMfa(request, {
        appUrl: env.APP_URL,
        appOrigins: env.APP_ORIGINS,
        authorize: unused,
        listFactors: unused,
        deleteFactor: unused,
        log: quiet,
      }),
    rejectsUnauthenticated: true,
  },
  {
    name: 'bank-sync',
    call: (env, request) =>
      handleBankSync(request, {
        env: { appUrl: env.APP_URL, appOrigins: env.APP_ORIGINS },
        log: quiet,
        authorizeAdmin: noUser,
        cronOk: () => Promise.resolve(false),
        store: {} as BankSyncStore,
        google: unused,
        waitUntil: quiet,
      }),
    rejectsUnauthenticated: true,
  },
  {
    name: 'email-unsubscribe',
    call: (env, request) =>
      handleEmailUnsubscribe(request, {
        appUrl: env.APP_URL,
        appOrigins: env.APP_ORIGINS,
        unsubscribe: unused,
        log: quiet,
      }),
    rejectsUnauthenticated: false,
  },
  {
    name: 'monitoring-test',
    call: (env, request) =>
      handleMonitoringTest(request, {
        appUrl: env.APP_URL,
        appOrigins: env.APP_ORIGINS,
        adminOk: () => Promise.resolve(false),
        monitoring: monitoringDepsFrom(() => undefined),
      }),
    rejectsUnauthenticated: true,
  },
];

const FUNCTION_URL = 'https://abcd1234.supabase.co/functions/v1/prueba';
const preflight = (origin: string) =>
  new Request(FUNCTION_URL, {
    method: 'OPTIONS',
    headers: { origin, 'access-control-request-method': 'POST' },
  });
const unauthenticatedPost = (origin: string) =>
  new Request(FUNCTION_URL, { method: 'POST', headers: { origin }, body: '{}' });

describe.each(CALLERS)('$name', ({ call }) => {
  const migration: FunctionEnv = {
    APP_URL: `${NEW_ORIGIN}/`,
    APP_ORIGINS: `${NEW_ORIGIN},${OLD_ORIGIN}`,
  };

  it('en la mudanza deja pasar el origen nuevo y el viejo, y a nadie más', async () => {
    for (const origin of [NEW_ORIGIN, OLD_ORIGIN]) {
      const reply = await call(migration, preflight(origin));
      expect(reply.status, origin).toBe(204);
      expect(reply.headers.get('access-control-allow-origin'), origin).toBe(origin);
    }
    const stranger = await call(migration, preflight(OTHER_ORIGIN));
    expect(stranger.status).toBe(204);
    expect(stranger.headers.get('access-control-allow-origin')).toBeNull();
    // Una vista previa de pages.dev, ni siquiera si alguien la pone en la lista
    const preview = await call(
      {
        ...migration,
        APP_ORIGINS: `${migration.APP_ORIGINS ?? ''},https://abc.studiare.pages.dev`,
      },
      preflight('https://abc.studiare.pages.dev'),
    );
    expect(preview.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('un origen que solo se parece al permitido no recibe access-control-allow-origin', async () => {
    for (const origin of LOOKALIKES) {
      const reply = await call(migration, preflight(origin));
      expect(reply.headers.get('access-control-allow-origin'), origin).toBeNull();
      const post = await call(migration, unauthenticatedPost(origin));
      expect(post.headers.get('access-control-allow-origin'), origin).toBeNull();
    }
  });

  it('sin APP_ORIGINS sigue dejando pasar solo el origen de APP_URL', async () => {
    const single: FunctionEnv = { APP_URL: `${OLD_ORIGIN}/Studiare-ENARM/` };
    const mine = await call(single, preflight(OLD_ORIGIN));
    expect(mine.headers.get('access-control-allow-origin')).toBe(OLD_ORIGIN);
    const other = await call(single, preflight(NEW_ORIGIN));
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('sin ninguna de las dos variables no deja pasar a nadie', async () => {
    const reply = await call({}, preflight(NEW_ORIGIN));
    expect(reply.headers.get('access-control-allow-origin')).toBeNull();
  });
});

// email-unsubscribe no pide sesión (la ficha de baja es lo que identifica), así que no tiene el 401 de aquí
describe.each(CALLERS.filter((caller) => caller.rejectsUnauthenticated))('$name', ({ call }) => {
  it('un POST sin sesión contesta 401 con el CORS del origen que llamó, para que la app lea el error', async () => {
    const migration: FunctionEnv = {
      APP_URL: `${NEW_ORIGIN}/`,
      APP_ORIGINS: `${NEW_ORIGIN},${OLD_ORIGIN}`,
    };
    for (const origin of [NEW_ORIGIN, OLD_ORIGIN]) {
      const reply = await call(migration, unauthenticatedPost(origin));
      expect(reply.status, origin).toBe(401);
      expect(reply.headers.get('access-control-allow-origin'), origin).toBe(origin);
    }
  });
});
