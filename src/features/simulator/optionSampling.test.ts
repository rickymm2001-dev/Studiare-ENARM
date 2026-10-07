import { describe, expect, it } from 'vitest';
import { DUEL_OPTIONS } from '@/engines/party';
import type { SamplerOption } from '@/engines/sampler';
import { sampleForQuestion } from './optionSampling';

const options: SamplerOption[] = Array.from({ length: 10 }, (_, index) => ({
  id: `o${index}`,
  isCorrect: index === 0,
  biasTag: index === 0 ? null : `sesgo${index}`,
}));
const canonicalOptionIds = ['o0', 'o3', 'o5', 'o7'];
const base = { options, canonicalOptionIds, questionId: 'q1', optionsShown: 4 };
const shownIds = (result: ReturnType<typeof sampleForQuestion>) =>
  result.shown.map((entry) => entry.optionId);

describe('opciones de un duelo', () => {
  it('son las mismas para quien lo juegue aunque cambie su sesión y su ajuste de opciones', () => {
    const first = sampleForQuestion({ ...base, sessionId: 's1', duelId: 'duelo', optionsShown: 4 });
    const second = sampleForQuestion({
      ...base,
      sessionId: 's2',
      duelId: 'duelo',
      optionsShown: 8,
    });
    expect(shownIds(second)).toEqual(shownIds(first));
    expect(first.shown).toHaveLength(DUEL_OPTIONS);
  });

  it('salen del set canónico y lo dicen en el evento', () => {
    const result = sampleForQuestion({ ...base, sessionId: 's1', duelId: 'duelo' });
    expect(result.mode).toBe('canonical');
    expect(result.isCanonicalSet).toBe(true);
    expect([...shownIds(result)].sort()).toEqual([...canonicalOptionIds].sort());
  });

  it('otro duelo puede acomodarlas distinto, pero siempre con la correcta', () => {
    const orders = new Set(
      Array.from({ length: 12 }, (_, index) =>
        shownIds(sampleForQuestion({ ...base, sessionId: 's1', duelId: `duelo-${index}` })).join(),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
    for (const order of orders) expect(order.split(',')).toContain('o0');
  });
});

describe('opciones de una práctica libre', () => {
  it('siguen variando por sesión y respetan cuántas quiere ver el alumno', () => {
    const results = Array.from({ length: 12 }, (_, index) =>
      sampleForQuestion({ ...base, sessionId: `sesion-${index}`, duelId: null, optionsShown: 6 }),
    );
    for (const result of results) {
      expect(result.mode).toBe('diverse');
      expect(result.shown).toHaveLength(6);
    }
    expect(new Set(results.map((result) => shownIds(result).join())).size).toBeGreaterThan(1);
  });

  it('con la misma sesión y la misma pregunta salen igual', () => {
    const a = sampleForQuestion({ ...base, sessionId: 's1', duelId: null });
    const b = sampleForQuestion({ ...base, sessionId: 's1', duelId: null });
    expect(shownIds(b)).toEqual(shownIds(a));
  });
});
