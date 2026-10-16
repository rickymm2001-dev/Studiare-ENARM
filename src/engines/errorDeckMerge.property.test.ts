// Propiedades de la unión de Mis errores (B14, 2.6 del plan), con fast-check
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Card, Deck, Note } from '@/data/schemas/decks';
import {
  errorGroupKeyOfNote,
  isEmptyPlan,
  planErrorDeckMerge,
  type ErrorDeckMergeInput,
} from './errorDeckMerge';
import { applyPlan, baseInput, card, day, deck, idOf, note } from './testing/errorDecks';

/** Un escenario con 1 a 4 mazos, notas de 5 preguntas, algunas sin clave o de contraste, y repasos */
const scenario = fc
  .record({
    decks: fc.array(
      fc.record({
        marked: fc.boolean(),
        age: fc.integer({ min: 1, max: 20 }),
        deleted: fc.boolean(),
      }),
      { minLength: 1, maxLength: 4 },
    ),
    notes: fc.array(
      fc.record({
        deckIndex: fc.integer({ min: 0, max: 3 }),
        question: fc.integer({ min: 100, max: 104 }),
        kind: fc.constantFrom('plain' as const, 'legacy' as const, 'contrast' as const),
        reps: fc.integer({ min: 0, max: 5 }),
        cardDeckIndex: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
        deleted: fc.boolean(),
      }),
      { maxLength: 14 },
    ),
    accountDeck: fc.option(fc.integer({ min: 0, max: 3 }), { nil: undefined }),
  })
  .map((spec): ErrorDeckMergeInput => {
    const decks: Deck[] = spec.decks.map((entry, index) =>
      deck(index + 1, {
        createdAt: day(entry.age),
        ...(entry.marked ? {} : { system: undefined }),
        ...(entry.deleted ? { deletedAt: day(25) } : {}),
      }),
    );
    const at = (index: number) => idOf((index % decks.length) + 1);
    const notes: Note[] = [];
    const cards: Card[] = [];
    const reps = new Map<string, number>();
    spec.notes.forEach((entry, index) => {
      const noteN = 100 + index;
      const created = note(noteN, 1, entry.question, {
        deckId: at(entry.deckIndex),
        ...(entry.kind === 'legacy' ? { errorKey: undefined } : {}),
        ...(entry.kind === 'contrast'
          ? {
              errorKey: `contraste|${idOf(entry.question)}|${idOf(entry.question + 1)}`,
              front: `<p>Contraste ${String(entry.question)}</p>`,
            }
          : {}),
        ...(entry.deleted ? { deletedAt: day(25) } : {}),
      });
      notes.push(created);
      const cardN = 300 + index;
      cards.push(card(cardN, noteN, 1, { deckId: at(entry.cardDeckIndex ?? entry.deckIndex) }));
      reps.set(idOf(cardN), entry.reps);
    });
    return baseInput({
      decks,
      notes,
      cards,
      reps,
      // Los mazos sin marca se reconocen por su id, como el de antes de B14
      knownDeckIds: decks.filter((entry) => entry.system !== 'errors').map((entry) => entry.id),
      preferredDeckId: spec.accountDeck === undefined ? idOf(900) : at(spec.accountDeck),
    });
  });

const shuffled = <T>(list: readonly T[], seed: number): T[] =>
  [...list]
    .map((item, index) => ({ item, sort: Math.sin(seed * 9301 + index * 49297) }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);

describe('propiedades de la unión de Mis errores', () => {
  it('después de aplicar el plan no queda nada por hacer', () => {
    fc.assert(
      fc.property(scenario, (input) => {
        const plan = planErrorDeckMerge(input);
        const next = { ...input, ...applyPlan(input, plan, day(28)) };
        expect(isEmptyPlan(planErrorDeckMerge(next))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('queda un solo mazo vivo de errores, sin tarjetas repetidas y con todo dentro de él', () => {
    fc.assert(
      fc.property(scenario, (input) => {
        const plan = planErrorDeckMerge(input);
        const next = { ...input, ...applyPlan(input, plan, day(28)) };
        const known = new Set(input.knownDeckIds);
        const isErrors = (entry: Deck) =>
          entry.ownerId === input.userId &&
          !entry.deletedAt &&
          (entry.system === 'errors' || known.has(entry.id));
        const live = next.decks.filter(isErrors);
        if (plan.survivorId === null) {
          expect(live).toEqual([]);
          return;
        }
        expect(live.map((entry) => entry.id)).toEqual([plan.survivorId]);
        const survivorId = plan.survivorId;
        // Solo el mazo marcado vive, y las notas vivas que eran de un mazo de errores están en él
        const wasInErrors = new Set(
          input.decks
            .filter(
              (entry) => !entry.deletedAt && (entry.system === 'errors' || known.has(entry.id)),
            )
            .map((entry) => entry.id),
        );
        const liveNotes = next.notes.filter(
          (entry) =>
            !entry.deletedAt &&
            wasInErrors.has(input.notes.find((n) => n.id === entry.id)?.deckId ?? ''),
        );
        expect(liveNotes.every((entry) => entry.deckId === survivorId)).toBe(true);
        const keys = liveNotes.map((entry) => errorGroupKeyOfNote(entry) ?? `n:${entry.id}`);
        expect(new Set(keys).size).toBe(keys.length);
        // Y la tarjeta de cada nota viva está en el mazo que se queda
        const liveIds = new Set(liveNotes.map((entry) => entry.id));
        for (const entry of next.cards) {
          if (!entry.deletedAt && liveIds.has(entry.noteId)) expect(entry.deckId).toBe(survivorId);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('en cada grupo se queda la nota con más repasos', () => {
    fc.assert(
      fc.property(scenario, (input) => {
        const plan = planErrorDeckMerge(input);
        const retired = new Set(plan.retireNotes);
        const repsOfNote = (id: string) =>
          input.cards
            .filter((entry) => entry.noteId === id && !entry.deletedAt)
            .reduce((sum, entry) => sum + (input.reps.get(entry.id) ?? 0), 0);
        for (const kept of input.notes) {
          if (kept.deletedAt || retired.has(kept.id)) continue;
          const key = errorGroupKeyOfNote(kept) ?? `n:${kept.id}`;
          for (const other of input.notes) {
            if (other.deletedAt || !retired.has(other.id)) continue;
            if ((errorGroupKeyOfNote(other) ?? `n:${other.id}`) !== key) continue;
            expect(repsOfNote(kept.id)).toBeGreaterThanOrEqual(repsOfNote(other.id));
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('el plan no depende del orden en que llegan los mazos, las notas y las tarjetas', () => {
    fc.assert(
      fc.property(scenario, fc.integer({ min: 1, max: 1000 }), (input, seed) => {
        const expected = planErrorDeckMerge(input);
        const other = planErrorDeckMerge({
          ...input,
          decks: shuffled(input.decks, seed),
          notes: shuffled(input.notes, seed + 1),
          cards: shuffled(input.cards, seed + 2),
        });
        expect(other).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });
});
