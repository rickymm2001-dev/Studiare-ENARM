import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, readStoredPreferences } from './preferences';

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
    });
    expect(readStoredPreferences(undefined)).toEqual(DEFAULT_PREFERENCES);
    expect(readStoredPreferences(storageWith(null))).toEqual(DEFAULT_PREFERENCES);
  });

  it('lee lo guardado', () => {
    const stored = { theme: 'dark', role: 'physician', database: 'demo', sessionUserId: 'abc' };
    expect(readStoredPreferences(storageWith(JSON.stringify(stored)))).toEqual(stored);
  });

  it('un valor inválido vuelve a su valor por defecto sin perder los demás', () => {
    const stored = { theme: 'neon', role: 'admin', database: 'otra' };
    expect(readStoredPreferences(storageWith(JSON.stringify(stored)))).toEqual({
      theme: 'system',
      role: 'admin',
      database: 'real',
      sessionUserId: null,
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
