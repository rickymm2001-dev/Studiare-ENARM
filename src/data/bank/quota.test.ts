import { describe, expect, it } from 'vitest';
import { wireQuota } from '../testing/bankCloud';
import { brakeUntil, combinedLeft, quotaIsCurrent, shortfallReason } from './quota';

const now = new Date('2026-10-20T18:00:00.000Z');

describe('cuota del día con la nube (2.2 y 5.5)', () => {
  it('le queda el menor entre lo que dice la app y lo que dice el servidor', () => {
    expect(combinedLeft(15, wireQuota({ used: 12, left: 8 }), now)).toBe(8);
    expect(combinedLeft(3, wireQuota({ used: 12, left: 8 }), now)).toBe(3);
    // Sin tope en la app, como un plan de pago local, manda el servidor si tiene tope
    expect(combinedLeft(null, wireQuota({ left: 4 }), now)).toBe(4);
  });

  it('sin cuota, con una de otro día o sin tope en el servidor, manda la app', () => {
    expect(combinedLeft(15, null, now)).toBe(15);
    expect(combinedLeft(15, undefined, now)).toBe(15);
    expect(combinedLeft(null, null, now)).toBeNull();
    const yesterday = wireQuota({ left: 0, resetsAt: '2026-10-20T10:00:00.000Z' });
    expect(quotaIsCurrent(yesterday, now)).toBe(false);
    expect(combinedLeft(20, yesterday, now)).toBe(20);
    expect(combinedLeft(20, wireQuota({ plan: 'monthly', limit: null, left: null }), now)).toBe(20);
    expect(quotaIsCurrent({ resetsAt: 'no es fecha' }, now)).toBe(false);
  });

  it('el freno dice hasta cuándo y deja de valer al pasar la hora', () => {
    expect(brakeUntil(null, now)).toBeNull();
    expect(brakeUntil(wireQuota(), now)).toBeNull();
    const braked = wireQuota({ brake: { retryAt: '2026-10-20T18:01:00.000Z' } });
    expect(brakeUntil(braked, now)?.toISOString()).toBe('2026-10-20T18:01:00.000Z');
    expect(brakeUntil(braked, new Date('2026-10-20T18:02:00.000Z'))).toBeNull();
    expect(brakeUntil(wireQuota({ brake: { retryAt: 'mal' } }), now)).toBeNull();
  });

  it('el motivo de lo que no llegó va de lo que impide todo a lo que ya no está', () => {
    const denied = (...reasons: ('daily_limit' | 'brake' | 'not_found' | 'retired' | 'closed')[]) =>
      reasons.map((reason) => ({ reason }));
    expect(shortfallReason({ denied: [], offline: false, missing: 0 })).toBeNull();
    expect(shortfallReason({ denied: denied('daily_limit'), offline: true, missing: 3 })).toBe(
      'offline',
    );
    expect(shortfallReason({ denied: denied('brake', 'closed'), offline: false, missing: 0 })).toBe(
      'closed',
    );
    expect(
      shortfallReason({ denied: denied('daily_limit', 'brake'), offline: false, missing: 0 }),
    ).toBe('brake');
    expect(
      shortfallReason({ denied: denied('not_found', 'daily_limit'), offline: false, missing: 0 }),
    ).toBe('daily_limit');
    expect(shortfallReason({ denied: denied('retired'), offline: false, missing: 0 })).toBe(
      'unavailable',
    );
    expect(shortfallReason({ denied: [], offline: false, missing: 1 })).toBe('unavailable');
  });
});
