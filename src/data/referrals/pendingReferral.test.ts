import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  PENDING_REFERRAL_KEY,
  clearPendingReferral,
  readPendingReferral,
  redeemPendingReferral,
  referralCodeFromSearch,
  storePendingReferral,
} from './pendingReferral';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

/** Un cliente de la nube que solo atiende redeem_referral_code */
function cloudAnswering(reply: { data?: unknown; error?: unknown } | Error) {
  const rpc = vi.fn((_name: string, _args: unknown) =>
    reply instanceof Error
      ? Promise.reject(reply)
      : Promise.resolve({ data: reply.data ?? null, error: reply.error ?? null }),
  );
  return { cloud: { rpc } as unknown as SupabaseClient, rpc };
}

describe('código del enlace de invitación', () => {
  it('lee el código de la dirección, limpio y en mayúsculas', () => {
    expect(referralCodeFromSearch('?ref=abcd2345')).toBe('ABCD2345');
    expect(referralCodeFromSearch('?utm=x&ref=ABCD-2345')).toBe('ABCD2345');
    expect(referralCodeFromSearch('?ref=%20wxyz6789%20')).toBe('WXYZ6789');
  });

  it('sin código, o con uno que no tiene la forma de un código, no hay nada que guardar', () => {
    expect(referralCodeFromSearch('')).toBeNull();
    expect(referralCodeFromSearch('?otra=1')).toBeNull();
    expect(referralCodeFromSearch('?ref=corto')).toBeNull();
    expect(referralCodeFromSearch('?ref=<script>')).toBeNull();
  });

  it('se guarda en el navegador, se lee y se borra', () => {
    const storage = memoryStorage();
    expect(readPendingReferral(storage)).toBeNull();
    storePendingReferral('ABCD2345', storage);
    expect(storage.values.get(PENDING_REFERRAL_KEY)).toBe('ABCD2345');
    expect(readPendingReferral(storage)).toBe('ABCD2345');
    clearPendingReferral(storage);
    expect(readPendingReferral(storage)).toBeNull();
  });

  it('no guarda ni devuelve algo que no sea un código', () => {
    const storage = memoryStorage();
    storePendingReferral('no es un código', storage);
    expect(storage.values.size).toBe(0);
    storage.values.set(PENDING_REFERRAL_KEY, 'otra cosa');
    expect(readPendingReferral(storage)).toBeNull();
  });

  it('un almacenamiento bloqueado no rompe nada', () => {
    const blocked = {
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
    expect(() => {
      storePendingReferral('ABCD2345', blocked);
    }).not.toThrow();
    expect(readPendingReferral(blocked)).toBeNull();
    expect(() => {
      clearPendingReferral(blocked);
    }).not.toThrow();
  });
});

describe('canje del código al conectar la cuenta', () => {
  it('sin código guardado no llama al servidor', async () => {
    const { cloud, rpc } = cloudAnswering({ data: 'ok' });
    await expect(redeemPendingReferral(cloud, memoryStorage())).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('canjea el código guardado y lo borra', async () => {
    const storage = memoryStorage();
    storePendingReferral('ABCD2345', storage);
    const { cloud, rpc } = cloudAnswering({ data: 'ok' });
    await expect(redeemPendingReferral(cloud, storage)).resolves.toBe('ok');
    expect(rpc).toHaveBeenCalledWith('redeem_referral_code', { p_code: 'ABCD2345' });
    expect(readPendingReferral(storage)).toBeNull();
  });

  it('si el servidor lo rechaza también lo borra, porque repetirlo daría lo mismo', async () => {
    for (const answer of ['invalid', 'own', 'already', 'too_late', 'already_paid']) {
      const storage = memoryStorage();
      storePendingReferral('ABCD2345', storage);
      const { cloud } = cloudAnswering({ data: answer });
      await expect(redeemPendingReferral(cloud, storage)).resolves.toBe(answer);
      expect(readPendingReferral(storage)).toBeNull();
    }
  });

  it('si no hubo respuesta lo deja para el siguiente intento', async () => {
    const storage = memoryStorage();
    storePendingReferral('ABCD2345', storage);
    await expect(
      redeemPendingReferral(cloudAnswering(new Error('sin red')).cloud, storage),
    ).resolves.toBe('failed');
    expect(readPendingReferral(storage)).toBe('ABCD2345');
    await expect(
      redeemPendingReferral(cloudAnswering({ error: { message: 'caída' } }).cloud, storage),
    ).resolves.toBe('failed');
    expect(readPendingReferral(storage)).toBe('ABCD2345');
  });

  it('dos sincronizaciones seguidas canjean una sola vez', async () => {
    const storage = memoryStorage();
    storePendingReferral('ABCD2345', storage);
    const { cloud, rpc } = cloudAnswering({ data: 'ok' });
    const [first, second] = await Promise.all([
      redeemPendingReferral(cloud, storage),
      redeemPendingReferral(cloud, storage),
    ]);
    expect(first).toBe('ok');
    expect(second).toBe('ok');
    expect(rpc).toHaveBeenCalledTimes(1);
    // Ya terminó, así que un código nuevo se canjea en la siguiente
    storePendingReferral('WXYZ6789', storage);
    await expect(redeemPendingReferral(cloud, storage)).resolves.toBe('ok');
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
