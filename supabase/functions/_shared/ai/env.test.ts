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
        SUPABASE_ANON_KEY: 'sb_secret_0123456789abcdef',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_0123456789abcdef',
      }),
    );
    expect(result.ok || result.problems).toHaveLength(2);
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
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
    ]);
    expect([...AI_BATCH_ENV_NAMES].sort()).toEqual([
      'AI_ALLOW_MOCK',
      'AI_TICK_DEADLINE_MS',
      'ENARM_ANTHROPIC_KEY',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_URL',
    ]);
  });
});
