// Sesiones e intercalado (7.2). Las restricciones se cumplen siempre que sea posible y la sesión
// es reproducible con la misma semilla.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { interleavingViolations, planSession, type SessionCandidate } from './session';

/** Candidatos de al menos 4 subtemas donde ninguno pasa de 25%, así un orden válido siempre existe */
const candidatesArbitrary = fc
  .record({
    subtopics: fc.integer({ min: 4, max: 10 }),
    perSubtopic: fc.integer({ min: 1, max: 8 }),
    kinds: fc.array(
      fc.constantFrom('due' as const, 'new' as const, 'error' as const, 'challenge' as const),
      { minLength: 80, maxLength: 80 },
    ),
    retrievability: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), {
      minLength: 80,
      maxLength: 80,
    }),
  })
  .map(({ subtopics, perSubtopic, kinds, retrievability }) => {
    const items: SessionCandidate[] = [];
    for (let s = 0; s < subtopics; s += 1) {
      for (let k = 0; k < perSubtopic; k += 1) {
        const index = items.length;
        const kind = kinds[index % kinds.length] ?? 'due';
        items.push({
          id: `c${index}`,
          kind,
          subtopic: `s${s}`,
          ...(kind === 'due' ? { retrievability: retrievability[index % 80] ?? 0.5 } : {}),
        });
      }
    }
    return items;
  });

describe('propiedades del intercalado', () => {
  it('cumple las reglas cuando un orden válido existe', () => {
    fc.assert(
      fc.property(candidatesArbitrary, fc.string({ minLength: 1 }), (candidates, seed) => {
        // Pares confusables entre subtemas distintos, pocos para que siga habiendo solución
        const pairs = candidates
          .slice(0, 6)
          .map(
            (item, index) =>
              [item.id, candidates[candidates.length - 1 - index]?.id ?? item.id] as const,
          );
        const plan = planSession({
          candidates,
          minutesAvailable: 600,
          seed,
          confusablePairs: pairs,
        });
        expect(plan.items).toHaveLength(candidates.length);
        expect(interleavingViolations(plan.items, pairs)).toBe(0);
      }),
      { numRuns: 300 },
    );
  });

  it('es reproducible con la misma semilla y no repite elementos', () => {
    fc.assert(
      fc.property(
        candidatesArbitrary,
        fc.string({ minLength: 1 }),
        fc.integer({ min: 1, max: 60 }),
        (candidates, seed, minutes) => {
          const plan = planSession({ candidates, minutesAvailable: minutes, seed });
          expect(planSession({ candidates, minutesAvailable: minutes, seed })).toEqual(plan);
          const ids = plan.items.map((item) => item.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(plan.estimatedMinutes).toBeLessThanOrEqual(minutes + 1e-9);
          expect(plan.items.length + plan.leftOut).toBe(candidates.length);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('selección por tiempo', () => {
  const due = (id: string, r: number): SessionCandidate => ({
    id,
    kind: 'due',
    subtopic: `s-${id}`,
    retrievability: r,
  });

  it('si hay más vencidas que tiempo, entran las de menor retrievability', () => {
    const plan = planSession({
      candidates: [due('a', 0.9), due('b', 0.2), due('c', 0.5), due('d', 0.1)],
      minutesAvailable: 0.5,
      mix: { due: 1, new: 0, error: 0, challenge: 0 },
      seed: 's',
    });
    expect(plan.items.map((item) => item.id).sort()).toEqual(['b', 'd']);
    expect(plan.leftOut).toBe(2);
  });

  it('el tiempo que un tipo no usa pasa a los demás', () => {
    const plan = planSession({
      candidates: [
        due('a', 0.5),
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `n${index}`,
          kind: 'new' as const,
          subtopic: `n${index}`,
        })),
      ],
      minutesAvailable: 5,
      seed: 's',
    });
    expect(plan.items.filter((item) => item.kind === 'new').length).toBe(7);
  });

  it('cuando no hay salida rompe la regla lo menos posible', () => {
    const same = Array.from({ length: 5 }, (_, index) => ({
      id: `x${index}`,
      kind: 'new' as const,
      subtopic: 'mismo',
    }));
    const plan = planSession({ candidates: same, minutesAvailable: 60, seed: 's' });
    expect(plan.items).toHaveLength(5);
    expect(interleavingViolations(plan.items)).toBe(3);
  });
});
