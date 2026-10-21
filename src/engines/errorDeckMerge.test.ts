import { describe, expect, it } from 'vitest';
import {
  duplicateNoteGroups,
  errorGroupKey,
  isEmptyPlan,
  planErrorDeckMerge,
} from './errorDeckMerge';
import { applyPlan, baseInput, card, day, deck, idOf, note } from './testing/errorDecks';

describe('unir los mazos Mis errores', () => {
  it('sin mazos de errores no hay nada que hacer', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1, { system: undefined, origin: 'manual' }), deck(2, { ownerId: null })],
      }),
    );
    expect(plan.survivorId).toBeNull();
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('con un solo mazo marcado y sin repetidas el plan está vacío', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1)],
        notes: [note(10, 1, 100), note(11, 1, 101)],
        cards: [card(20, 10, 1), card(21, 11, 1)],
      }),
    );
    expect(plan.survivorId).toBe(idOf(1));
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('el mazo de antes de B14 se reconoce por su id y recibe la marca', () => {
    const legacy = deck(1, { system: undefined });
    const plan = planErrorDeckMerge(baseInput({ decks: [legacy], knownDeckIds: [legacy.id] }));
    expect(plan.survivorId).toBe(legacy.id);
    expect(plan.markDecks).toEqual([legacy.id]);
    // Sin ser conocido ni marcado, un mazo generado cualquiera no es Mis errores
    expect(planErrorDeckMerge(baseInput({ decks: [legacy] })).survivorId).toBeNull();
  });

  it('se queda el mazo de la clave de la cuenta y las notas de los otros se mudan con su tarjeta', () => {
    const account = deck(900, { createdAt: day(20) });
    const local = deck(5, { system: undefined });
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [local, account],
        knownDeckIds: [local.id],
        notes: [note(10, 900, 100), note(11, 5, 101), note(12, 5, 102)],
        cards: [card(20, 10, 900), card(21, 11, 5), card(22, 12, 5)],
      }),
    );
    expect(plan.survivorId).toBe(account.id);
    expect(plan.moveNotes).toEqual([
      { id: idOf(11), toDeckId: account.id },
      { id: idOf(12), toDeckId: account.id },
    ]);
    expect(plan.moveCards).toEqual([
      { id: idOf(21), toDeckId: account.id },
      { id: idOf(22), toDeckId: account.id },
    ]);
    expect(plan.markDecks).toEqual([local.id]);
    expect(plan.retireDecks).toEqual([local.id]);
    expect(plan.retireNotes).toEqual([]);
  });

  it('sin el mazo de la cuenta se queda el más antiguo', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(8), deck(3), deck(6)],
        notes: [note(10, 8, 100)],
        cards: [card(20, 10, 8)],
      }),
    );
    expect(plan.survivorId).toBe(idOf(3));
    expect(plan.retireDecks).toEqual([idOf(6), idOf(8)]);
    expect(plan.moveNotes).toEqual([{ id: idOf(10), toDeckId: idOf(3) }]);
  });

  it('la misma pregunta en dos mazos deja la tarjeta con más repasos y retira la otra', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1), deck(2)],
        // La misma pregunta, con claves de ids distintos
        notes: [note(10, 1, 100), note(11, 2, 100)],
        cards: [card(20, 10, 1), card(21, 11, 2)],
        reps: new Map([
          [idOf(20), 2],
          [idOf(21), 9],
        ]),
      }),
    );
    expect(plan.survivorId).toBe(idOf(1));
    // Gana la de B, que se muda, y la de A, con menos repasos, se retira
    expect(plan.moveNotes).toEqual([{ id: idOf(11), toDeckId: idOf(1) }]);
    expect(plan.moveCards).toEqual([{ id: idOf(21), toDeckId: idOf(1) }]);
    expect(plan.retireNotes).toEqual([idOf(10)]);
    expect(plan.retireCards).toEqual([idOf(20)]);
    expect(plan.retireDecks).toEqual([idOf(2)]);
  });

  it('con los mismos repasos gana la que ya está en el mazo que se queda, y luego la más antigua', () => {
    const inSurvivor = planErrorDeckMerge(
      baseInput({
        decks: [deck(1), deck(2)],
        notes: [note(30, 1, 100), note(11, 2, 100)],
        cards: [card(20, 30, 1), card(21, 11, 2)],
      }),
    );
    expect(inSurvivor.retireNotes).toEqual([idOf(11)]);
    expect(inSurvivor.moveNotes).toEqual([]);
    const older = planErrorDeckMerge(
      baseInput({
        decks: [deck(1)],
        notes: [note(30, 1, 100), note(11, 1, 100)],
        cards: [card(20, 30, 1), card(21, 11, 1)],
      }),
    );
    expect(older.retireNotes).toEqual([idOf(30)]);
  });

  it('una tarjeta de contraste no se confunde con la tarjeta de su pregunta', () => {
    const contrastFront = '<p><strong>Contraste</strong></p><p>Pregunta 100</p>';
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1), deck(2)],
        notes: [
          // Las dos de antes de B14, sin clave, y las dos citan la pregunta 100
          note(10, 1, 100, { errorKey: undefined }),
          note(11, 2, 100, { errorKey: undefined, front: contrastFront }),
        ],
        cards: [card(20, 10, 1), card(21, 11, 2)],
      }),
    );
    expect(plan.retireNotes).toEqual([]);
    expect(plan.moveNotes).toEqual([{ id: idOf(11), toDeckId: idOf(1) }]);
  });

  it('dos tarjetas de contraste con la misma clave son la misma', () => {
    const key = 'contraste|A|B';
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1), deck(2)],
        notes: [
          note(10, 1, 100, { errorKey: key, front: '<p>x</p>' }),
          note(11, 2, 100, { errorKey: key, front: '<p>y</p>' }),
        ],
        cards: [card(20, 10, 1), card(21, 11, 2)],
      }),
    );
    expect(plan.retireNotes).toHaveLength(1);
  });

  it('una nota con clave y una de antes sin clave de la misma pregunta son la misma tarjeta', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1), deck(2)],
        notes: [note(10, 1, 100), note(11, 2, 100, { errorKey: undefined })],
        cards: [card(20, 10, 1), card(21, 11, 2)],
      }),
    );
    expect(plan.retireNotes).toEqual([idOf(11)]);
  });

  it('no toca lo borrado, lo de otro alumno ni las notas de otros mazos', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [
          deck(1),
          deck(2, { deletedAt: day(25) }),
          deck(3, { ownerId: '01J0000000000000000000OTRO' }),
          deck(4, { system: undefined, origin: 'manual' }),
        ],
        notes: [
          note(10, 1, 100),
          note(11, 2, 100),
          note(12, 4, 100),
          note(13, 1, 101, { deletedAt: day(25) }),
        ],
        cards: [card(20, 10, 1)],
      }),
    );
    expect(plan.survivorId).toBe(idOf(1));
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it('una tarjeta que quedó en otro mazo se muda aunque su nota ya esté en el que se queda', () => {
    const plan = planErrorDeckMerge(
      baseInput({
        decks: [deck(1), deck(2)],
        notes: [note(10, 1, 100)],
        cards: [card(20, 10, 2)],
      }),
    );
    expect(plan.moveCards).toEqual([{ id: idOf(20), toDeckId: idOf(1) }]);
    expect(plan.moveNotes).toEqual([]);
  });
});

describe('claves y grupos', () => {
  it('errorGroupKey distingue contraste, pregunta y lo que no se puede saber', () => {
    expect(errorGroupKey({ errorKey: 'contraste|A|B', questionVersionId: 'A', front: 'x' })).toBe(
      'k:contraste|A|B',
    );
    expect(errorGroupKey({ errorKey: 'Q', questionVersionId: 'Q', front: 'x' })).toBe('q:Q|x');
    expect(errorGroupKey({ errorKey: undefined, questionVersionId: 'Q', front: 'x' })).toBe(
      'q:Q|x',
    );
    expect(errorGroupKey({ errorKey: undefined, questionVersionId: null, front: 'x' })).toBeNull();
  });

  it('duplicateNoteGroups solo devuelve los grupos de más de una nota viva', () => {
    const notes = [
      note(10, 1, 100),
      note(11, 2, 100),
      note(12, 1, 101),
      note(13, 2, 102, { deletedAt: day(25) }),
      note(14, 2, 102),
    ];
    const groups = duplicateNoteGroups(notes, new Set([idOf(1), idOf(2)]));
    expect(groups.map((group) => group.map((entry) => entry.id))).toEqual([[idOf(10), idOf(11)]]);
    expect(duplicateNoteGroups(notes, new Set([idOf(1)]))).toEqual([]);
  });
});

describe('aplicar el plan', () => {
  it('después de aplicarlo no queda nada por hacer', () => {
    const input = baseInput({
      decks: [deck(900, { createdAt: day(20) }), deck(5, { system: undefined }), deck(6)],
      knownDeckIds: [idOf(5)],
      notes: [
        note(10, 900, 100),
        note(11, 5, 100),
        note(12, 5, 101),
        note(13, 6, 101, { errorKey: undefined }),
        note(14, 6, 102),
      ],
      cards: [
        card(20, 10, 900),
        card(21, 11, 5),
        card(22, 12, 5),
        card(23, 13, 6),
        card(24, 14, 6),
      ],
      reps: new Map([[idOf(22), 3]]),
    });
    const plan = planErrorDeckMerge(input);
    expect(isEmptyPlan(plan)).toBe(false);
    const next = { ...input, ...applyPlan(input, plan, day(28)) };
    expect(isEmptyPlan(planErrorDeckMerge(next))).toBe(true);
    // Queda un solo mazo vivo con una tarjeta viva por pregunta
    const liveDecks = next.decks.filter((entry) => !entry.deletedAt);
    expect(liveDecks.map((entry) => entry.id)).toEqual([idOf(900)]);
    const liveNotes = next.notes.filter((entry) => !entry.deletedAt);
    expect(liveNotes.map((entry) => entry.deckId)).toEqual(liveNotes.map(() => idOf(900)));
    expect(liveNotes).toHaveLength(3);
    // Las tarjetas que se quedan conservan su id
    const liveCards = next.cards.filter((entry) => !entry.deletedAt);
    expect(liveCards.every((entry) => entry.deckId === idOf(900))).toBe(true);
  });
});
