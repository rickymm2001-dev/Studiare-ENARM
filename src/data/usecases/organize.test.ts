import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { suspendedCardIds } from '../../engines/suspension';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { createManualDeck, saveManualNote } from './manualDecks';
import { addTags, moveDeck, moveNotes, removeTag, renameDeck, setSuspended } from './organize';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

const NOW = new Date('2026-10-08T12:00:00.000Z');

const PRELOADED_DECK = '01JAA6P0000000000000000000';
const PRELOADED_NOTE = '01JAA6Q0000000000000000000';

async function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  const actor = { id: user.id, timeZone: user.timeZone };
  const origin = await createManualDeck(api, user, { name: 'Origen' });
  const target = await createManualDeck(api, user, { name: 'Destino' });
  const cloze = await saveManualNote(api, user, {
    deckId: origin.id,
    draft: { kind: 'cloze', text: 'A {{c1::uno}} y {{c2::dos}}', extra: '' },
  });
  const basic = await saveManualNote(api, user, {
    deckId: origin.id,
    draft: { kind: 'basic', front: 'Frente', back: 'Reverso' },
  });
  // Una nota precargada: sin dueño y de origen precargado
  await api.repos.decks.put({
    id: PRELOADED_DECK,
    name: 'Precargado',
    description: '',
    ownerId: null,
    origin: 'preloaded',
    visibility: 'public',
    isDemo: true,
    createdAt: '2026-10-01T15:00:00.000Z',
  });
  const preloaded = {
    id: PRELOADED_NOTE,
    deckId: PRELOADED_DECK,
    tags: ['paco::tema'],
    origin: 'preloaded' as const,
    editorialStatus: 'draft' as const,
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: true,
    createdAt: '2026-10-01T15:00:00.000Z',
    kind: 'basic' as const,
    front: 'P',
    back: 'R',
  };
  await api.repos.notes.put(preloaded);
  return { api, user, actor, origin, target, cloze, basic, preloaded };
}

describe('mover notas', () => {
  it('pasa la nota con todas sus cartas al otro mazo y conserva los IDs de las cartas', async () => {
    const { api, user, origin, target, cloze } = await setup();
    const before = (await api.repos.cards.list()).filter((card) => card.noteId === cloze.id);
    const result = await moveNotes(api, user, [cloze.id], target.id, NOW);
    expect(result).toEqual({ changed: 1, skipped: 0 });
    const after = (await api.repos.cards.list()).filter((card) => card.noteId === cloze.id);
    expect(after.map((card) => card.id).sort()).toEqual(before.map((card) => card.id).sort());
    expect(after.every((card) => card.deckId === target.id)).toBe(true);
    expect((await api.repos.notes.get(cloze.id))?.deckId).toBe(target.id);
    expect((await api.repos.notes.get(cloze.id))?.updatedAt).toBe(NOW.toISOString());
    expect(origin.id).not.toBe(target.id);
  });

  it('no mueve lo precargado ni cuenta lo que ya estaba en el mazo', async () => {
    const { api, user, origin, target, basic, preloaded } = await setup();
    const result = await moveNotes(api, user, [basic.id, preloaded.id], target.id, NOW);
    expect(result).toEqual({ changed: 1, skipped: 1 });
    expect((await api.repos.notes.get(preloaded.id))?.deckId).toBe(preloaded.deckId);
    // Moverla al mazo donde ya está no cambia nada
    const again = await moveNotes(api, user, [basic.id], target.id, NOW);
    expect(again.changed).toBe(0);
    expect(origin.id).not.toBe(target.id);
  });

  it('solo mueve a mazos propios hechos a mano', async () => {
    const { api, user, basic, preloaded } = await setup();
    await expect(moveNotes(api, user, [basic.id], preloaded.deckId, NOW)).rejects.toThrow(
      'Solo puedes cambiar',
    );
    await expect(moveNotes(api, makeUser(), [basic.id], newId(), NOW)).rejects.toThrow();
  });
});

describe('etiquetas por lote', () => {
  it('agrega etiquetas limpias, sin repetir, y no toca lo precargado', async () => {
    const { api, user, basic, cloze, preloaded } = await setup();
    const result = await addTags(
      api,
      user,
      [basic.id, cloze.id, preloaded.id],
      ['Cardio logía::Arritmias', 'cardio_logía::arritmias', '  '],
      NOW,
    );
    expect(result).toEqual({ changed: 2, skipped: 1 });
    expect((await api.repos.notes.get(basic.id))?.tags).toEqual(['Cardio_logía::Arritmias']);
    expect((await api.repos.notes.get(preloaded.id))?.tags).toEqual(['paco::tema']);
    // Repetirlo no cambia nada
    const again = await addTags(api, user, [basic.id], ['cardio_logía::arritmias'], NOW);
    expect(again.changed).toBe(0);
  });

  it('quita una etiqueta exacta y deja las que cuelgan de ella', async () => {
    const { api, user, basic } = await setup();
    await addTags(api, user, [basic.id], ['a', 'a::b', 'c'], NOW);
    const result = await removeTag(api, user, [basic.id], 'A', NOW);
    expect(result.changed).toBe(1);
    expect((await api.repos.notes.get(basic.id))?.tags).toEqual(['a::b', 'c']);
    expect((await removeTag(api, user, [basic.id], 'no-existe', NOW)).changed).toBe(0);
  });
});

describe('suspender tarjetas', () => {
  it('registra eventos y el motor los reconstruye, también con tarjetas precargadas', async () => {
    const { api, user, actor, cloze } = await setup();
    const cards = (await api.repos.cards.list()).filter((card) => card.noteId === cloze.id);
    const ids = cards.map((card) => card.id);
    expect(await setSuspended(api, actor, [...ids, ...ids, 'no-existe'], true)).toBe(ids.length);
    const events = await api.repos.events.query({ userId: user.id });
    expect(events.map((event) => event.type)).toEqual(['cards_suspended']);
    expect(suspendedCardIds(events).size).toBe(ids.length);
    await setSuspended(api, actor, [ids[0] as string], false);
    const later = await api.repos.events.query({ userId: user.id });
    expect([...suspendedCardIds(later)]).toEqual([ids[1]]);
  });

  it('parte en lotes de 500 tarjetas por evento', async () => {
    const { api, actor, basic } = await setup();
    const many = Array.from({ length: 1100 }, (_, index) => ({
      id: `01JAAC${String(index).padStart(20, '0')}`,
      noteId: basic.id,
      deckId: basic.deckId,
      ordinal: 0,
      createdAt: '2026-10-01T15:00:00.000Z',
    }));
    await api.repos.cards.putMany(many);
    const total = await setSuspended(
      api,
      actor,
      many.map((card) => card.id),
      true,
    );
    expect(total).toBe(1100);
    const events = (await api.repos.events.query({ userId: actor.id })).filter(
      (event) => event.type === 'cards_suspended',
    );
    expect(events.map((event) => event.payload.cardIds.length)).toEqual([500, 500, 100]);
  });
});

describe('mazos', () => {
  it('mueve un mazo propio a otro, o lo regresa al primer nivel, sin ciclos', async () => {
    const { api, user, origin, target } = await setup();
    expect(await moveDeck(api, user, origin.id, target.id, NOW)).toBeNull();
    expect((await api.repos.decks.get(origin.id))?.parentId).toBe(target.id);
    // El destino no puede colgar de su propio descendiente
    expect(await moveDeck(api, user, target.id, origin.id, NOW)).toBe('cycle');
    expect(await moveDeck(api, user, origin.id, origin.id, NOW)).toBe('self');
    expect(await moveDeck(api, user, origin.id, null, NOW)).toBeNull();
    expect((await api.repos.decks.get(origin.id))?.parentId).toBeNull();
  });

  it('no mueve ni renombra mazos precargados', async () => {
    const { api, user, target, preloaded } = await setup();
    await expect(moveDeck(api, user, preloaded.deckId, target.id)).rejects.toThrow();
    await expect(renameDeck(api, user, preloaded.deckId, 'Otro')).rejects.toThrow();
  });

  it('renombra con el nombre recortado y pone la fecha de modificación', async () => {
    const { api, user, origin } = await setup();
    await renameDeck(api, user, origin.id, '  Cardiología  ', NOW);
    const deck = await api.repos.decks.get(origin.id);
    expect(deck?.name).toBe('Cardiología');
    expect(deck?.updatedAt).toBe(NOW.toISOString());
  });
});
