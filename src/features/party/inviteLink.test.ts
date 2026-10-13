import { describe, expect, it } from 'vitest';
import { forgetInviteCode, INVITE_STORAGE_KEY, inviteLink, readInviteCode } from './inviteLink';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

const NOW = Date.UTC(2026, 9, 13, 15, 0, 0);

describe('enlace de invitación', () => {
  it('abre Party con el código, también en la app publicada en una subruta', () => {
    expect(inviteLink('ABC234', 'https://studiare.mx', '/')).toBe(
      'https://studiare.mx/party?codigo=ABC234',
    );
    expect(inviteLink('ABC234', 'https://rickymm2001-dev.github.io', '/Studiare-ENARM/')).toBe(
      'https://rickymm2001-dev.github.io/Studiare-ENARM/party?codigo=ABC234',
    );
  });

  it('lee el código del enlace en mayúsculas y lo recuerda un día', () => {
    const store = memoryStore();
    expect(readInviteCode('?codigo=abc234', store, NOW)).toBe('ABC234');
    expect(readInviteCode('', store, NOW + 3_600_000)).toBe('ABC234');
    expect(readInviteCode('', store, NOW + 2 * 86_400_000)).toBeNull();
  });

  it('un código con forma inválida no se usa ni se recuerda', () => {
    const store = memoryStore();
    expect(readInviteCode('?codigo=O0I1L1', store, NOW)).toBeNull();
    expect(store.data.has(INVITE_STORAGE_KEY)).toBe(false);
  });

  it('al entrar se olvida y sin almacenamiento nada se rompe', () => {
    const store = memoryStore();
    readInviteCode('?codigo=ABC234', store, NOW);
    forgetInviteCode(store);
    expect(readInviteCode('', store, NOW)).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readInviteCode('?codigo=ABC234', broken, NOW)).toBe('ABC234');
    expect(readInviteCode('', broken, NOW)).toBeNull();
    expect(() => {
      forgetInviteCode(broken);
    }).not.toThrow();
    expect(readInviteCode('', null, NOW)).toBeNull();
  });
});
