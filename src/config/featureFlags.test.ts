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
  resolveFlag,
  writeStoredFlags,
  type FlagDef,
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

  it('la prueba gratis y los pases en efectivo solo vienen prendidos en desarrollo, y el servidor los prende (B10)', () => {
    for (const flag of ['freeTrial', 'cashPasses'] as const) {
      expect(isFeatureEnabled(flag, { appEnv: 'development', stored: null }), flag).toBe(true);
      expect(isFeatureEnabled(flag, { appEnv: 'demo', stored: null }), flag).toBe(false);
      expect(isFeatureEnabled(flag, { appEnv: 'production', stored: null }), flag).toBe(false);
      expect(isFeatureEnabled(flag, { appEnv: 'production', stored: { [flag]: true } }), flag).toBe(
        true,
      );
    }
  });

  it('Mercado Pago nace apagado en todos lados y el aviso de modo prueba prendido en todos lados (B10)', () => {
    for (const appEnv of APP_ENVS) {
      expect(isFeatureEnabled('mercadoPago', { appEnv, stored: null }), appEnv).toBe(false);
      expect(isFeatureEnabled('paymentsTestMode', { appEnv, stored: null }), appEnv).toBe(true);
    }
    expect(
      isFeatureEnabled('mercadoPago', { appEnv: 'production', stored: { mercadoPago: true } }),
    ).toBe(true);
    // Al pasar a modo real el servidor lo apaga para todos
    expect(
      isFeatureEnabled('paymentsTestMode', {
        appEnv: 'production',
        stored: { paymentsTestMode: false },
      }),
    ).toBe(false);
  });

  it('Google y el segundo factor nacen apagados en todos lados y los prende el servidor (B9)', () => {
    for (const appEnv of APP_ENVS) {
      // Sin la clave, el servidor tampoco pide segundo factor (staff_mfa_required), así que coinciden
      expect(isFeatureEnabled('googleSignIn', { appEnv, stored: null })).toBe(false);
      expect(isFeatureEnabled('requireMfa', { appEnv, stored: null })).toBe(false);
      expect(isFeatureEnabled('requireMfa', { appEnv, stored: { requireMfa: true } })).toBe(true);
      expect(isFeatureEnabled('googleSignIn', { appEnv, stored: { googleSignIn: true } })).toBe(
        true,
      );
    }
  });

  it('lo que dice el servidor manda sobre el valor del entorno', () => {
    expect(isFeatureEnabled('demoTools', { appEnv: 'demo', stored: { demoTools: false } })).toBe(
      false,
    );
    expect(
      isFeatureEnabled('demoTools', { appEnv: 'development', stored: { demoTools: false } }),
    ).toBe(false);
    expect(
      isFeatureEnabled('demoBank', { appEnv: 'production', stored: { demoBank: false } }),
    ).toBe(false);
    // Una copia sin esa bandera deja el valor del entorno
    expect(isFeatureEnabled('demoTools', { appEnv: 'production', stored: {} })).toBe(false);
  });

  it('en producción nadie prende las herramientas de demostración desde su navegador (B7)', () => {
    expect(FEATURE_FLAGS.demoTools.remoteEnable).toBe(false);
    expect(
      isFeatureEnabled('demoTools', { appEnv: 'production', stored: { demoTools: true } }),
    ).toBe(false);
    // Lo mismo con la copia que alguien escribe a mano en localStorage
    localStorage.setItem(FLAGS_KEY, JSON.stringify({ demoTools: true }));
    expect(isFeatureEnabled('demoTools', { appEnv: 'production' })).toBe(false);
    // Fuera de producción la copia sigue mandando en los dos sentidos
    expect(isFeatureEnabled('demoTools', { appEnv: 'demo', stored: { demoTools: true } })).toBe(
      true,
    );
  });

  it('una bandera sin remoteEnable se prende desde el servidor también en producción', () => {
    // Como googleSignIn o requireMfa, que se prenden desde platform_settings el día que toque
    const launch: FlagDef = {
      description: 'Bandera que se prende desde el servidor',
      defaults: { development: false, demo: false, production: false },
    };
    expect(resolveFlag(launch, 'production', true)).toBe(true);
    expect(resolveFlag(launch, 'production', false)).toBe(false);
    expect(resolveFlag(launch, 'production', undefined)).toBe(false);
    // Con remoteEnable en false la copia solo la apaga, aunque el entorno la tenga prendida
    const lockedOn: FlagDef = {
      ...launch,
      defaults: { development: true, demo: true, production: true },
      remoteEnable: false,
    };
    expect(resolveFlag(lockedOn, 'production', false)).toBe(false);
    expect(resolveFlag(lockedOn, 'production', true)).toBe(true);
    expect(resolveFlag({ ...lockedOn, defaults: launch.defaults }, 'production', true)).toBe(false);
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
