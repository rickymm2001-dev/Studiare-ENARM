import { describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { accessNotice, aiDetailText } from './text';

describe('textos de la IA según su estado', () => {
  it('cada estado tiene su explicación, y una función que responde sin IA se explica distinto', () => {
    expect(aiDetailText({ kind: 'real' })).toBe(t.ai.detail.real);
    expect(aiDetailText({ kind: 'no-proxy' })).toBe(t.ai.detail['no-proxy']);
    expect(aiDetailText({ kind: 'unavailable', reachable: false })).toBe(t.ai.detail.unavailable);
    expect(aiDetailText({ kind: 'unavailable', reachable: true })).toBe(t.ai.detailReachable);
  });

  it('cuando se puede usar no hay aviso, y si no, dice por qué', () => {
    expect(accessNotice('open')).toBeNull();
    expect(accessNotice('gated')).toBe(t.ai.access.gated);
    expect(accessNotice('gated', t.ai.access.gatedCards)).toBe(t.ai.access.gatedCards);
    expect(accessNotice('unavailable')).toBe(t.ai.access.unavailable);
    expect(accessNotice('offline')).toBe(t.ai.access.offline);
    expect(accessNotice('staff_only')).toBe(t.ai.access.staffOnly);
    expect(accessNotice('checking')).toBe(t.ai.access.checking);
  });

  it('los avisos hablan de tú y no usan dos puntos', () => {
    for (const text of Object.values(t.ai.access)) expect(text).not.toContain(':');
  });
});
