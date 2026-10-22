// Configuración de la analítica (B15, 1.4)
import { describe, expect, it } from 'vitest';
import { readAnalyticsConfig } from './config';

const KEY = 'phc_SimuladaPruebasStudiare00000000000000000000';

describe('readAnalyticsConfig', () => {
  it('acepta una llave de proyecto y uno de los dos hosts de PostHog Cloud', () => {
    expect(
      readAnalyticsConfig({ VITE_POSTHOG_KEY: KEY, VITE_POSTHOG_HOST: 'https://us.i.posthog.com' }),
    ).toEqual({
      key: KEY,
      host: 'https://us.i.posthog.com',
    });
    expect(
      readAnalyticsConfig({
        VITE_POSTHOG_KEY: ` ${KEY} `,
        VITE_POSTHOG_HOST: 'https://eu.i.posthog.com/',
      }),
    ).toEqual({ key: KEY, host: 'https://eu.i.posthog.com' });
  });

  it('sin llave, sin host o con valores que no son textos, no hay configuración', () => {
    for (const env of [
      {},
      { VITE_POSTHOG_KEY: KEY },
      { VITE_POSTHOG_HOST: 'https://us.i.posthog.com' },
      { VITE_POSTHOG_KEY: 1, VITE_POSTHOG_HOST: 'https://us.i.posthog.com' },
      { VITE_POSTHOG_KEY: KEY, VITE_POSTHOG_HOST: null },
    ]) {
      expect(readAnalyticsConfig(env)).toBeNull();
    }
  });

  it('rechaza una llave personal (phx_), una con otra forma y un host que no es de PostHog Cloud', () => {
    const host = 'https://us.i.posthog.com';
    for (const key of [
      `phx_${'a'.repeat(40)}`,
      'phc_corta',
      `phc_${'a'.repeat(80)}`,
      `phc_${'a'.repeat(30)} x`,
      `${KEY};`,
      'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    ]) {
      expect(readAnalyticsConfig({ VITE_POSTHOG_KEY: key, VITE_POSTHOG_HOST: host })).toBeNull();
    }
    for (const badHost of [
      'http://us.i.posthog.com',
      'https://app.posthog.com',
      'https://posthog.malo.com',
      'https://us.i.posthog.com/batch/',
    ]) {
      expect(readAnalyticsConfig({ VITE_POSTHOG_KEY: KEY, VITE_POSTHOG_HOST: badHost })).toBeNull();
    }
  });
});
