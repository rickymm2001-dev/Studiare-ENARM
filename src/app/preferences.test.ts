import { describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '@/ui/appearance';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_STORAGE_KEY,
  allowedDatabase,
  allowedRole,
  readStoredPreferences,
} from './preferences';

function storageWith(value: string | null) {
  return { getItem: (key: string) => (key === PREFERENCES_STORAGE_KEY ? value : null) };
}

describe('preferencias del dispositivo', () => {
  it('por defecto es alumno, Mi cuenta y tema del sistema', () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      theme: 'system',
      role: 'student',
      database: 'real',
      sessionUserId: null,
      appearance: DEFAULT_APPEARANCE,
      navCollapsed: false,
    });
    expect(readStoredPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(readStoredPreferences(storageWith(null))).toEqual(DEFAULT_PREFERENCES);
  });

  it('lee lo guardado', () => {
    const stored = {
      theme: 'dark',
      role: 'physician',
      database: 'demo',
      sessionUserId: 'abc',
      navCollapsed: true,
    };
    expect(readStoredPreferences(storageWith(JSON.stringify(stored)))).toEqual({
      ...stored,
      appearance: DEFAULT_APPEARANCE,
    });
  });

  it('un valor inválido vuelve a su valor por defecto sin perder los demás', () => {
    const stored = {
      theme: 'neon',
      role: 'admin',
      database: 'otra',
      appearance: { font: 'comic', size: 'lg', animations: false },
      navCollapsed: 'sí',
    };
    expect(readStoredPreferences(storageWith(JSON.stringify(stored)))).toEqual({
      theme: 'system',
      role: 'admin',
      database: 'real',
      sessionUserId: null,
      appearance: { ...DEFAULT_APPEARANCE, size: 'lg', animations: false },
      navCollapsed: false,
    });
  });

  it('un JSON corrupto o un almacenamiento bloqueado no rompen la app', () => {
    expect(readStoredPreferences(storageWith('{no es json'))).toEqual(DEFAULT_PREFERENCES);
    const blocked = {
      getItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readStoredPreferences(blocked)).toEqual(DEFAULT_PREFERENCES);
  });
});

// Producción sin herramientas de demostración (pregunta 73, 5.4 del plan del cambio, B7)
describe('preferencias sin la bandera demoTools', () => {
  const stored = JSON.stringify({ database: 'demo', role: 'admin', sessionUserId: 'abc' });
  const production = { demoTools: false, cloud: true };
  const productionWithoutCloud = { demoTools: false, cloud: false };
  const demo = { demoTools: true, cloud: false };

  it('la base guardada como Demostración se lee como Mi cuenta', () => {
    expect(readStoredPreferences(storageWith(stored), production).database).toBe('real');
    expect(readStoredPreferences(storageWith(stored), productionWithoutCloud).database).toBe(
      'real',
    );
    // La sesión y lo demás no cambian
    expect(readStoredPreferences(storageWith(stored), production).sessionUserId).toBe('abc');
  });

  it('con la nube el rol guardado es el último que dio el servidor y se queda', () => {
    expect(readStoredPreferences(storageWith(stored), production).role).toBe('admin');
  });

  it('sin la nube nadie pudo elegir otro rol, así que es alumno', () => {
    expect(readStoredPreferences(storageWith(stored), productionWithoutCloud).role).toBe('student');
  });

  it('con la bandera prendida, como en la demo, todo se lee como estaba', () => {
    expect(readStoredPreferences(storageWith(stored), demo)).toMatchObject({
      database: 'demo',
      role: 'admin',
    });
  });

  it('pedir la base de demostración sin la bandera deja Mi cuenta', () => {
    expect(allowedDatabase('demo', production)).toBe('real');
    expect(allowedDatabase('real', production)).toBe('real');
    expect(allowedDatabase('demo', demo)).toBe('demo');
  });

  it('elegir un rol en el dispositivo sin la bandera ni la nube deja alumno', () => {
    expect(allowedRole('owner', productionWithoutCloud)).toBe('student');
    expect(allowedRole('physician', production)).toBe('physician');
    expect(allowedRole('physician', demo)).toBe('physician');
  });
});
