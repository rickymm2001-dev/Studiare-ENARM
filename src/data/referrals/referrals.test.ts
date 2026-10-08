import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { fetchReferralState, normalizeReferralCode, redeemReferralCode } from './referrals';

function fakeCloud(replies: Record<string, { data?: unknown; error?: unknown } | 'throw'>) {
  const calls: [string, unknown][] = [];
  const cloud = {
    rpc: (name: string, args?: unknown) => {
      calls.push([name, args]);
      const reply = replies[name];
      if (reply === 'throw') return Promise.reject(new Error('red'));
      return Promise.resolve({ data: reply?.data ?? null, error: reply?.error ?? null });
    },
  } as unknown as SupabaseClient;
  return { cloud, calls };
}

const summary = {
  pending: 1,
  completed: 2,
  monthsEarned: 2,
  grantedUntil: '2026-12-01T00:00:00.000Z',
  referredBy: false,
};

describe('referidos', () => {
  it('lee el código y el resumen', async () => {
    const { cloud } = fakeCloud({
      my_referral_code: { data: 'ABCD2345' },
      my_referrals: { data: summary },
    });
    expect(await fetchReferralState(cloud)).toEqual({ code: 'ABCD2345', summary });
  });

  it('si algo falla o no se entiende devuelve null', async () => {
    expect(
      await fetchReferralState(
        fakeCloud({
          my_referral_code: { error: { code: '42501' } },
          my_referrals: { data: summary },
        }).cloud,
      ),
    ).toBeNull();
    expect(
      await fetchReferralState(
        fakeCloud({ my_referral_code: { data: 'corto' }, my_referrals: { data: summary } }).cloud,
      ),
    ).toBeNull();
    expect(
      await fetchReferralState(
        fakeCloud({
          my_referral_code: { data: 'ABCD2345' },
          my_referrals: { data: { pending: -1 } },
        }).cloud,
      ),
    ).toBeNull();
    expect(
      await fetchReferralState(
        fakeCloud({ my_referral_code: 'throw', my_referrals: { data: summary } }).cloud,
      ),
    ).toBeNull();
  });

  it('limpia lo que se escribió', () => {
    expect(normalizeReferralCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeReferralCode('ab cd 23 45')).toBe('ABCD2345');
  });

  it('canjea un código y traduce cada respuesta del servidor', async () => {
    for (const result of ['ok', 'invalid', 'own', 'already', 'too_late', 'already_paid'] as const) {
      const { cloud, calls } = fakeCloud({ redeem_referral_code: { data: result } });
      expect(await redeemReferralCode(cloud, 'abcd 2345')).toBe(result);
      expect(calls[0]).toEqual(['redeem_referral_code', { p_code: 'ABCD2345' }]);
    }
  });

  it('un código mal formado no llega al servidor y un fallo se avisa', async () => {
    const { cloud, calls } = fakeCloud({});
    expect(await redeemReferralCode(cloud, 'corto')).toBe('invalid');
    expect(await redeemReferralCode(cloud, '')).toBe('invalid');
    expect(calls).toHaveLength(0);
    expect(
      await redeemReferralCode(
        fakeCloud({ redeem_referral_code: { error: { message: 'x' } } }).cloud,
        'ABCD2345',
      ),
    ).toBe('failed');
    expect(
      await redeemReferralCode(
        fakeCloud({ redeem_referral_code: { data: 'otra cosa' } }).cloud,
        'ABCD2345',
      ),
    ).toBe('failed');
    expect(
      await redeemReferralCode(fakeCloud({ redeem_referral_code: 'throw' }).cloud, 'ABCD2345'),
    ).toBe('failed');
  });
});
