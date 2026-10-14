// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  APP_ENVS,
  FEATURE_FLAGS,
  FEATURE_FLAG_NAMES,
  FLAGS_KEY,
  isFeatureEnabled,
  readAppEnv,
  readStoredFlags,
  writeStoredFlags,
} from './featureFlags';

afterEach(() => {
  localStorage.clear();
});

describe('entorno de la app', () => {
  it('toma VITE_APP_ENV cuando es uno de los tres entornos', () => {
    for (const env of APP_ENVS) {
      expect(readAppEnv({ VITE_APP_ENV: ` ${env} `, PROD: true })).toBe(env);
    }
  });

  it('sin la variable, un build de producción es la demo publicada y lo demás es desarrollo', () => {
    expect(readAppEnv({ PROD: true })).toBe('demo');
    expect(readAppEnv({ PROD: false })).toBe('development');
    expect(readAppEnv({})).toBe('development');
    expect(readAppEnv({ VITE_APP_ENV: 'otra cosa', PROD: true })).toBe('demo');
  });
});

describe('banderas de lanzamiento', () => {
  it('cada bandera trae un valor para los tres entornos y una descripción', () => {
    expect(FEATURE_FLAG_NAMES.length).toBeGreaterThan(0);
    for (const name of FEATURE_FLAG_NAMES) {
      const flag = FEATURE_FLAGS[name];
      expect(flag.description.length).toBeGreaterThan(10);
      expect(Object.keys(flag.defaults).sort()).toEqual([...APP_ENVS].sort());
    }
  });

  it('las herramientas de demostración se ven en desarrollo y en la demo, y no en producción (5.4)', () => {
    expect(isFeatureEnabled('demoTools', { appEnv: 'development', stored: null })).toBe(true);
    expect(isFeatureEnabled('demoTools', { appEnv: 'demo', stored: null })).toBe(true);
    expect(isFeatureEnabled('demoTools', { appEnv: 'production', stored: null })).toBe(false);
    // El aviso de Versión de demostración sigue prendido en producción hasta que llegue el banco real (B11)
    expect(isFeatureEnabled('demoBank', { appEnv: 'production', stored: null })).toBe(true);
  });

  it('la prueba gratis está apagada en los tres entornos hasta que B10 la crea, y el servidor la prende', () => {
    for (const appEnv of APP_ENVS) {
      expect(isFeatureEnabled('freeTrial', { appEnv, stored: null }), appEnv).toBe(false);
    }
    expect(
      isFeatureEnabled('freeTrial', { appEnv: 'production', stored: { freeTrial: true } }),
    ).toBe(true);
  });

  it('lo que dice el servidor manda sobre el valor del entorno', () => {
    expect(
      isFeatureEnabled('demoTools', { appEnv: 'production', stored: { demoTools: true } }),
    ).toBe(true);
    expect(
      isFeatureEnabled('demoTools', { appEnv: 'development', stored: { demoTools: false } }),
    ).toBe(false);
    // Una copia sin esa bandera deja el valor del entorno
    expect(isFeatureEnabled('demoTools', { appEnv: 'production', stored: {} })).toBe(false);
  });

  it('sin opciones lee la copia guardada en el navegador', () => {
    expect(writeStoredFlags({ demoTools: false })).toBe(true);
    expect(isFeatureEnabled('demoTools', { appEnv: 'development' })).toBe(false);
    expect(writeStoredFlags(null)).toBe(true);
    expect(readStoredFlags()).toBeNull();
    expect(isFeatureEnabled('demoTools', { appEnv: 'development' })).toBe(true);
  });

  it('una bandera que este build no conoce se ignora y una que no es booleana invalida la copia', () => {
    localStorage.setItem(FLAGS_KEY, JSON.stringify({ demoTools: true, delFuturo: true }));
    expect(readStoredFlags()).toEqual({ demoTools: true });
    for (const raw of ['{ no es json', '[]', JSON.stringify({ demoTools: 'sí' })]) {
      localStorage.setItem(FLAGS_KEY, raw);
      expect(readStoredFlags(), raw).toBeNull();
    }
  });
});
