import { describe, expect, it } from 'vitest';
import { forgetStoredCloudSession } from './client';

function fakeStorage(entries: Record<string, string>) {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => data.delete(key),
    keys: () => [...data.keys()],
  };
}

describe('forgetStoredCloudSession', () => {
  it('quita la sesión que guardó Supabase y deja las preferencias del dispositivo', () => {
    const storage = fakeStorage({
      'sb-abcd1234-auth-token': '{"access_token":"x"}',
      'sb-abcd1234-auth-token-code-verifier': 'y',
      'enarm.preferences.v1': '{"theme":"dark"}',
      otra: '1',
    });
    forgetStoredCloudSession(storage);
    expect(storage.keys()).toEqual(['enarm.preferences.v1', 'otra']);
  });

  it('no falla con un almacenamiento vacío', () => {
    const storage = fakeStorage({});
    forgetStoredCloudSession(storage);
    expect(storage.keys()).toEqual([]);
  });
});
