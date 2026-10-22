import { describe, expect, it } from 'vitest';
import {
  AI_BATCH_ENV_NAMES,
  AI_PROXY_ENV_NAMES,
  DEFAULT_TICK_DEADLINE_MS,
  readAiBatchEnv,
  readAiProxyEnv,
  type AiProxyEnvSource,
} from './env.ts';

const jwt = (role: string) =>
  ['eyJhbGciOiJIUzI1NiJ9', btoa(JSON.stringify({ role })).replace(/=+$/, ''), 'firma'].join('.');
const ANON = jwt('anon');
const SERVICE = jwt('service_role');

const source = (overrides: Partial<AiProxyEnvSource> = {}): AiProxyEnvSource => ({
  ENARM_ANTHROPIC_KEY: undefined,
  APP_ORIGINS: 'https://rickymm2001-dev.github.io',
  AI_ALLOW_MOCK: undefined,
  SUPABASE_URL: 'https://abcd1234.supabase.co/',
  SUPABASE_ANON_KEY: ANON,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  SUPABASE_PUBLISHABLE_KEYS: undefined,
  SUPABASE_SECRET_KEYS: undefined,
  ...overrides,
});

describe('variables de ai-proxy', () => {
  it('acepta una configuración completa, limpia la dirección y sin clave no inventa una', () => {
    const result = readAiProxyEnv(source({ AI_ALLOW_MOCK: '1' }));
    expect(result).toMatchObject({
      ok: true,
      env: {
        supabaseUrl: 'https://abcd1234.supabase.co',
        anthropicKey: null,
        allowMock: true,
      },
    });
    if (result.ok) expect([...result.env.origins]).toEqual(['https://rickymm2001-dev.github.io']);
    const withKey = readAiProxyEnv(source({ ENARM_ANTHROPIC_KEY: ' clave-de-prueba ' }));
    expect(withKey.ok && withKey.env).toMatchObject({
      anthropicKey: 'clave-de-prueba',
      allowMock: false,
    });
  });

  it('dice todos los problemas juntos y nunca un valor', () => {
    const result = readAiProxyEnv(
      source({
        SUPABASE_URL: 'http://otro.com',
        SUPABASE_ANON_KEY: SERVICE,
        SUPABASE_SERVICE_ROLE_KEY: ANON,
        APP_ORIGINS: 'https://*.malo.com',
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(4);
    expect(result.problems.join(' ')).not.toContain(SERVICE);
    expect(result.problems.join(' ')).not.toContain('malo.com');
  });

  it('las llaves nuevas de Supabase tampoco se cruzan', () => {
    const result = readAiProxyEnv(
      source({
        SUPABASE_ANON_KEY: 'sb_secret_' + '0123456789abcdef',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_' + '0123456789abcdef',
      }),
    );
    expect(result.ok || result.problems).toHaveLength(2);
  });
});

describe('las dos formas de llave de Supabase en ai-proxy', () => {
  const NEW_SECRET = 'sb_secret_' + '0123456789abcdefABCDEF';
  const NEW_PUBLIC = 'sb_publishable_' + '0123456789abcdefABCDEF';
  const dictionary = (key: string) => JSON.stringify({ default: key });

  it('las llaves viejas siguen sirviendo solas, que es como sale todo hasta que Ricardo ponga las nuevas', () => {
    const result = readAiProxyEnv(source());
    expect(result.ok && [result.env.anonKey, result.env.serviceKey]).toEqual([ANON, SERVICE]);
  });

  it('las nuevas ganan sobre las viejas apenas Supabase las pone', () => {
    const result = readAiProxyEnv(
      source({
        SUPABASE_SECRET_KEYS: dictionary(NEW_SECRET),
        SUPABASE_PUBLISHABLE_KEYS: dictionary(NEW_PUBLIC),
      }),
    );
    expect(result.ok && [result.env.anonKey, result.env.serviceKey]).toEqual([
      NEW_PUBLIC,
      NEW_SECRET,
    ]);
  });

  it('funciona solo con las nuevas, sin ninguna de las viejas', () => {
    const result = readAiProxyEnv(
      source({
        SUPABASE_ANON_KEY: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        SUPABASE_SECRET_KEYS: dictionary(NEW_SECRET),
        SUPABASE_PUBLISHABLE_KEYS: dictionary(NEW_PUBLIC),
      }),
    );
    expect(result.ok && [result.env.anonKey, result.env.serviceKey]).toEqual([
      NEW_PUBLIC,
      NEW_SECRET,
    ]);
  });

  it('mezcla una nueva de servicio con la pública de siempre mientras se termina el cambio', () => {
    const result = readAiProxyEnv(source({ SUPABASE_SECRET_KEYS: dictionary(NEW_SECRET) }));
    expect(result.ok && [result.env.anonKey, result.env.serviceKey]).toEqual([ANON, NEW_SECRET]);
  });

  it('un JSON roto o sin una llave con la forma se ignora y cae a las viejas', () => {
    for (const bad of ['', '{', 'null', '[]', '{}', '{"default":"x"}', '{"default":5}']) {
      const result = readAiProxyEnv(
        source({ SUPABASE_SECRET_KEYS: bad, SUPABASE_PUBLISHABLE_KEYS: bad }),
      );
      expect(result.ok && [result.env.anonKey, result.env.serviceKey], bad).toEqual([
        ANON,
        SERVICE,
      ]);
    }
  });

  it('las llaves cruzadas se rechazan, cada una con el nombre de dónde viene, y nunca se imprime un valor', () => {
    const crossed = readAiProxyEnv(
      source({
        SUPABASE_SECRET_KEYS: dictionary(NEW_SECRET),
        SUPABASE_PUBLISHABLE_KEYS: undefined,
        // La llave de servicio de siempre puesta como la pública
        SUPABASE_ANON_KEY: SERVICE,
      }),
    );
    expect(crossed.ok).toBe(false);
    if (crossed.ok) return;
    expect(crossed.problems).toHaveLength(1);
    const text = crossed.problems.join(' ');
    expect(text).toContain('SUPABASE_PUBLISHABLE_KEYS');
    expect(text).not.toContain(SERVICE);
    expect(text).not.toContain(NEW_SECRET);
    // Y al revés: la pública nueva en el lugar de la de servicio
    const reversed = readAiProxyEnv(
      source({ SUPABASE_SECRET_KEYS: undefined, SUPABASE_SERVICE_ROLE_KEY: NEW_PUBLIC }),
    );
    expect(reversed.ok).toBe(false);
    if (reversed.ok) return;
    expect(reversed.problems.join(' ')).toContain('SUPABASE_SECRET_KEYS');
    expect(reversed.problems.join(' ')).not.toContain(NEW_PUBLIC);
  });

  it('sin ninguna llave dice cuáles faltan por nombre', () => {
    const result = readAiProxyEnv(
      source({ SUPABASE_ANON_KEY: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(2);
    expect(result.problems.join(' ')).toContain('SUPABASE_SECRET_KEYS');
  });

  it('APP_ORIGINS con una dirección de pages.dev deja a la función sin atender', () => {
    const result = readAiProxyEnv(source({ APP_ORIGINS: 'https://studiare.pages.dev' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems.join(' ')).toContain('pages.dev');
  });
});

describe('variables de ai-batch', () => {
  const batch = (deadline?: string) =>
    readAiBatchEnv({
      ENARM_ANTHROPIC_KEY: undefined,
      AI_ALLOW_MOCK: undefined,
      AI_TICK_DEADLINE_MS: deadline,
      SUPABASE_URL: 'https://abcd1234.supabase.co',
      SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      SUPABASE_SECRET_KEYS: undefined,
      SUPABASE_PUBLISHABLE_KEYS: undefined,
    });

  it('ai-batch también toma las llaves nuevas si existen', () => {
    const result = readAiBatchEnv({
      ENARM_ANTHROPIC_KEY: undefined,
      AI_ALLOW_MOCK: undefined,
      AI_TICK_DEADLINE_MS: undefined,
      SUPABASE_URL: 'https://abcd1234.supabase.co',
      SUPABASE_ANON_KEY: ANON,
      SUPABASE_SERVICE_ROLE_KEY: SERVICE,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_' + '0123456789abcdefABCDEF' }),
      SUPABASE_PUBLISHABLE_KEYS: undefined,
    });
    expect(result.ok && [result.env.anonKey, result.env.serviceKey]).toEqual([
      ANON,
      'sb_secret_' + '0123456789abcdefABCDEF',
    ]);
  });

  it('el plazo del ciclo es de 100 s por omisión y cabe en el reloj de la función', () => {
    expect(batch()).toMatchObject({ ok: true, env: { tickDeadlineMs: DEFAULT_TICK_DEADLINE_MS } });
    expect(batch('350000').ok).toBe(true);
    for (const bad of ['5000', '400000', 'mucho']) expect(batch(bad).ok, bad).toBe(false);
  });

  it('los nombres que leen las funciones son exactamente los de 2.7', () => {
    expect([...AI_PROXY_ENV_NAMES].sort()).toEqual([
      'AI_ALLOW_MOCK',
      'APP_ORIGINS',
      'ENARM_ANTHROPIC_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEYS',
      'SUPABASE_SECRET_KEYS',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
    ]);
    expect([...AI_BATCH_ENV_NAMES].sort()).toEqual([
      'AI_ALLOW_MOCK',
      'AI_TICK_DEADLINE_MS',
      'ENARM_ANTHROPIC_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_PUBLISHABLE_KEYS',
      'SUPABASE_SECRET_KEYS',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
    ]);
  });
});
