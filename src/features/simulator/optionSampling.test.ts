import { describe, expect, it } from 'vitest';
import { DUEL_OPTIONS } from '@/engines/party';
import type { SamplerOption } from '@/engines/sampler';
import { correctPositionCounts, sampleForQuestion } from './optionSampling';

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

describe('opciones dirigidas a las trampas del alumno', () => {
  const targetTags = ['sesgo1', 'sesgo2'];

  it('suben sus trampas sin llenar toda la pregunta con ellas', () => {
    for (let index = 0; index < 20; index += 1) {
      const result = sampleForQuestion({
        ...base,
        sessionId: `s${index}`,
        duelId: null,
        targetTags,
      });
      expect(result.mode).toBe('targeted');
      const tags = result.shown.map(
        (entry) => options.find((option) => option.id === entry.optionId)?.biasTag,
      );
      // Con 4 opciones hay 3 distractores y a lo más 2 son de sus trampas
      expect(tags.filter((tag) => tag !== null && targetTags.includes(tag as string))).toHaveLength(
        2,
      );
      expect(shownIds(result)).toContain('o0');
    }
  });

  it('sin trampas o en un duelo no cambian el muestreo', () => {
    expect(sampleForQuestion({ ...base, sessionId: 's1', duelId: null, targetTags: [] }).mode).toBe(
      'diverse',
    );
    const duel = sampleForQuestion({ ...base, sessionId: 's1', duelId: 'duelo', targetTags });
    expect(duel.mode).toBe('canonical');
    expect(shownIds(duel)).toEqual(
      shownIds(sampleForQuestion({ ...base, sessionId: 's9', duelId: 'duelo' })),
    );
  });
});

describe('posición de la correcta', () => {
  it('cuenta las posiciones y deja fuera lo que no es una posición', () => {
    expect(correctPositionCounts([0, 2, 2, 5, -1, 1.5], 4)).toEqual([1, 0, 2, 0]);
    expect(correctPositionCounts([], 3)).toEqual([0, 0, 0]);
  });

  it('con los conteos de la práctica la reparte parejo entre las posiciones', () => {
    const positions: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const result = sampleForQuestion({
        ...base,
        questionId: `q${index}`,
        sessionId: 'sesion',
        duelId: null,
        correctPositionCounts: correctPositionCounts(positions, 4),
      });
      positions.push(result.correctPosition);
    }
    expect(Math.max(...correctPositionCounts(positions, 4))).toBe(5);
    expect(Math.min(...correctPositionCounts(positions, 4))).toBe(5);
  });

  it('sin conteos se queda con el azar de siempre, que a veces junta varias en una posición', () => {
    const worst = Math.max(
      ...Array.from({ length: 30 }, (_, run) => {
        const positions = Array.from(
          { length: 20 },
          (__, index) =>
            sampleForQuestion({
              ...base,
              questionId: `q${index}`,
              sessionId: `sesion-${run}`,
              duelId: null,
            }).correctPosition,
        );
        return Math.max(...correctPositionCounts(positions, 4));
      }),
    );
    expect(worst).toBeGreaterThan(5);
  });
});
