import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DECK_DEPTH } from '../../engines/deckTree';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { queueErrorCards } from './errorCards';
import {
  clozeOrdinals,
  createManualDeck,
  deleteManualDeck,
  deleteManualNote,
  draftOf,
  saveManualNote,
  validateDraft,
} from './manualDecks';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  return { api, user: makeUser() };
}

describe('huecos y validación de una tarjeta a mano', () => {
  it('encuentra los números de hueco sin repetir y en orden', () => {
    expect(clozeOrdinals('A {{c2::dos}} B {{c1::uno}} C {{c2::otra vez::pista}}')).toEqual([1, 2]);
    expect(clozeOrdinals('Sin huecos {c1:: así no}')).toEqual([]);
    expect(clozeOrdinals('{{c0::cero}} {{c101::muy alto}} {{c100::límite}}')).toEqual([100]);
  });

  it('pide frente y reverso, o un texto con al menos un hueco', () => {
    expect(validateDraft({ kind: 'basic', front: ' ', back: 'x' })).toBe('empty_front');
    expect(validateDraft({ kind: 'basic', front: 'x', back: '' })).toBe('empty_back');
    expect(validateDraft({ kind: 'basic', front: 'x', back: 'y' })).toBeNull();
    expect(validateDraft({ kind: 'cloze', text: '', extra: '' })).toBe('empty_text');
    expect(validateDraft({ kind: 'cloze', text: 'sin hueco', extra: '' })).toBe('no_cloze');
    expect(validateDraft({ kind: 'cloze', text: 'con {{c1::hueco}}', extra: '' })).toBeNull();
    expect(validateDraft({ kind: 'basic', front: 'x'.repeat(3001), back: 'y' })).toBe('too_long');
  });

  it('un hueco que no cierra o que no tiene respuesta no se acepta, porque dejaría la respuesta a la vista', () => {
    const cloze = (text: string) => validateDraft({ kind: 'cloze', text, extra: '' });
    expect(cloze('La {{c1::creatinina sube')).toBe('unclosed_cloze');
    expect(cloze('La {{c1::creatinina} sube')).toBe('unclosed_cloze');
    expect(cloze('La {{c1::}} sube')).toBe('unclosed_cloze');
    expect(cloze('La {{c1::   }} sube')).toBe('unclosed_cloze');
    expect(cloze('La {{c0::creatinina}} sube')).toBe('unclosed_cloze');
    // Un hueco bueno no salva a uno que no cierra
    expect(cloze('La {{c1::creatinina}} y la {{c2::urea sube')).toBe('unclosed_cloze');
    // Un hueco con pista y varios huecos completos sí pasan
    expect(cloze('La {{c1::creatinina::analito}} y la {{c2::urea}} suben')).toBeNull();
  });

  it('los huecos incompletos tampoco cuentan como cartas', () => {
    expect(clozeOrdinals('La {{c1::creatinina sube')).toEqual([]);
    expect(clozeOrdinals('{{c1::}} y {{c2::urea}}')).toEqual([2]);
  });
});

describe('mazos a mano', () => {
  it('crea un mazo privado del alumno, de origen manual y sin etiqueta de demostración', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: '  Mi mazo  ', description: ' Notas ' });
    expect(deck).toMatchObject({
      name: 'Mi mazo',
      description: 'Notas',
      ownerId: user.id,
      origin: 'manual',
      visibility: 'private',
      isDemo: false,
    });
    expect(await api.repos.decks.get(deck.id)).toEqual(deck);
  });

  it('una tarjeta básica guarda su texto escapado y tiene una carta', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: '¿3 < 4 & "x"?', back: 'Sí\nclaro' },
    });
    expect(note).toMatchObject({
      kind: 'basic',
      origin: 'manual',
      editorialStatus: 'draft',
      front: '<p>¿3 &lt; 4 &amp; &quot;x&quot;?</p>',
      back: '<p>Sí<br>claro</p>',
    });
    const cards = await api.repos.cards.list();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ noteId: note.id, deckId: deck.id, ordinal: 0 });
    expect(draftOf(note)).toEqual({ kind: 'basic', front: '¿3 < 4 & "x"?', back: 'Sí\nclaro' });
  });

  it('una cloze lleva una carta por hueco y al editar conserva las que siguen', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'cloze', text: 'A {{c1::uno}} y {{c2::dos}}', extra: '' },
    });
    const before = await api.repos.cards.list();
    expect(before.map((card) => card.ordinal).sort()).toEqual([1, 2]);
    const first = before.find((card) => card.ordinal === 1);

    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: 'A {{c1::uno}} y {{c3::tres}}', extra: 'Nota' },
    });
    const after = await api.repos.cards.list();
    expect(after.map((card) => card.ordinal).sort()).toEqual([1, 3]);
    // La carta del hueco 1 sigue siendo la misma, así que conserva su historial
    expect(after.find((card) => card.ordinal === 1)?.id).toBe(first?.id);
    // La nota conserva su fecha de creación
    expect((await api.repos.notes.get(note.id))?.createdAt).toBe(note.createdAt);
  });

  it('cambiar de básica a cloze en la misma nota reajusta las cartas', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'a', back: 'b' },
    });
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: '{{c1::x}}', extra: '' },
    });
    expect((await api.repos.cards.list()).map((card) => card.ordinal)).toEqual([1]);
  });

  it('borrar una tarjeta quita sus cartas y borrar el mazo quita todo', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const one = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'cloze', text: '{{c1::a}} {{c2::b}}', extra: '' },
    });
    await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
    });
    await deleteManualNote(api, user, one.id);
    expect(await api.repos.notes.list()).toHaveLength(1);
    expect(await api.repos.cards.list()).toHaveLength(1);
    await deleteManualDeck(api, user, deck.id);
    expect(await api.repos.decks.list()).toHaveLength(0);
    expect(await api.repos.notes.list()).toHaveLength(0);
    expect(await api.repos.cards.list()).toHaveLength(0);
  });

  it('borrar deja una marca de borrado con fecha y no quita el registro, para sincronizar', async () => {
    const { api, user } = setup();
    const at = new Date('2026-10-08T12:00:00.000Z');
    const deck = await createManualDeck(
      api,
      user,
      { name: 'Mazo' },
      new Date('2026-10-01T12:00:00.000Z'),
    );
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
    });
    await deleteManualNote(api, user, note.id, at);
    // Ninguna pantalla lo ve, pero sigue guardado con su marca
    expect(await api.repos.notes.get(note.id)).toBeUndefined();
    expect(await api.repos.notes.list()).toHaveLength(0);
    expect(await api.repos.notes.getRaw(note.id)).toMatchObject({
      deletedAt: at.toISOString(),
      updatedAt: at.toISOString(),
    });
    const cards = await api.repos.cards.listAll();
    expect(cards).toHaveLength(1);
    expect(cards[0]?.deletedAt).toBe(at.toISOString());
  });

  it('una carta que se quita y se vuelve a poner conserva su ID y su historial', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'cloze', text: '{{c1::a}} {{c2::b}}', extra: '' },
    });
    const second = (await api.repos.cards.list()).find((card) => card.ordinal === 2);
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: '{{c1::a}} b', extra: '' },
    });
    expect((await api.repos.cards.list()).map((card) => card.ordinal)).toEqual([1]);
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: '{{c1::a}} {{c2::b}}', extra: '' },
    });
    const back = (await api.repos.cards.list()).find((card) => card.ordinal === 2);
    expect(back?.id).toBe(second?.id);
    expect(back?.deletedAt).toBeNull();
    expect(await api.repos.cards.listAll()).toHaveLength(2);
  });

  it('cada edición pone su fecha de modificación y la creación no cambia', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const created = new Date('2026-10-01T12:00:00.000Z');
    const note = await saveManualNote(
      api,
      user,
      { deckId: deck.id, draft: { kind: 'basic', front: 'a', back: 'b' } },
      created,
    );
    const later = new Date('2026-10-09T08:30:00.000Z');
    await saveManualNote(
      api,
      user,
      { deckId: deck.id, noteId: note.id, draft: { kind: 'basic', front: 'a2', back: 'b' } },
      later,
    );
    const stored = await api.repos.notes.get(note.id);
    expect(stored?.createdAt).toBe(created.toISOString());
    expect(stored?.updatedAt).toBe(later.toISOString());
  });

  it('un mazo puede colgar de otro mazo propio y borrar el de arriba borra los de abajo', async () => {
    const { api, user } = setup();
    const parent = await createManualDeck(api, user, { name: 'Residencia' });
    const child = await createManualDeck(api, user, { name: 'Nefrología', parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    await saveManualNote(api, user, {
      deckId: child.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
    });
    await deleteManualDeck(api, user, parent.id);
    expect(await api.repos.decks.list()).toHaveLength(0);
    expect(await api.repos.notes.list()).toHaveLength(0);
    expect(await api.repos.cards.list()).toHaveLength(0);
    expect(await api.repos.decks.listAll()).toHaveLength(2);
    // No se cuelga de un mazo ajeno
    const stranger = makeUser();
    const theirs = await createManualDeck(api, stranger, { name: 'Ajeno' });
    await expect(
      createManualDeck(api, user, { name: 'Intruso', parentId: theirs.id }),
    ).rejects.toThrow();
  });

  it('no deja guardar una tarjeta inválida ni tocar mazos ajenos o generados', async () => {
    const { api, user } = setup();
    const other = makeUser();
    const mine = await createManualDeck(api, user, { name: 'Mío' });
    const theirs = await createManualDeck(api, other, { name: 'Ajeno' });
    await expect(
      saveManualNote(api, user, {
        deckId: mine.id,
        draft: { kind: 'basic', front: '', back: 'x' },
      }),
    ).rejects.toThrow('empty_front');
    await expect(
      saveManualNote(api, user, {
        deckId: theirs.id,
        draft: { kind: 'basic', front: 'a', back: 'b' },
      }),
    ).rejects.toThrow('mazos que creaste');
    await expect(deleteManualDeck(api, user, theirs.id)).rejects.toThrow('mazos que creaste');

    // Mis errores es del alumno pero lo arma la app, no se edita a mano
    await queueErrorCards(
      api,
      user,
      [
        {
          questionVersionId: '01JAA6S0000000000000000001',
          topic: 'cardiology',
          editorialStatus: 'approved',
          isDemo: false,
          front: '<p>f</p>',
          back: '<p>b</p>',
          quote: 'q',
        },
      ],
      { name: 'Mis errores', description: '' },
    );
    const generated = (await api.repos.decks.list()).find((deck) => deck.origin === 'generated');
    expect(generated).toBeDefined();
    await expect(
      saveManualNote(api, user, {
        deckId: generated?.id ?? '',
        draft: { kind: 'basic', front: 'a', back: 'b' },
      }),
    ).rejects.toThrow('mazos que creaste');
  });

  it('una tarjeta que no es de ese mazo no se edita desde él', async () => {
    const { api, user } = setup();
    const a = await createManualDeck(api, user, { name: 'A' });
    const b = await createManualDeck(api, user, { name: 'B' });
    const note = await saveManualNote(api, user, {
      deckId: a.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
    });
    await expect(
      saveManualNote(api, user, {
        deckId: b.id,
        noteId: note.id,
        draft: { kind: 'basic', front: 'x', back: 'y' },
      }),
    ).rejects.toThrow('no está en este mazo');
  });
});

describe('niveles de mazos al crear', () => {
  it('no deja crear un mazo más abajo del último nivel', async () => {
    const { api, user } = setup();
    let parent = await createManualDeck(api, user, { name: 'Nivel 1' });
    for (let level = 2; level <= MAX_DECK_DEPTH; level += 1) {
      parent = await createManualDeck(api, user, { name: `Nivel ${level}`, parentId: parent.id });
    }
    await expect(
      createManualDeck(api, user, { name: 'Demasiado abajo', parentId: parent.id }),
    ).rejects.toThrow('demasiados niveles');
  });
});

describe('etiquetas y unión con un apunte al guardar una tarjeta (D-090)', () => {
  const LINK = { outlineId: newId(), nodeId: newId() };

  it('sin etiquetas ni apunte la nota queda como siempre, sin campos de apunte', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
    });
    expect(note.tags).toEqual([]);
    expect(note).not.toHaveProperty('outlineId');
    expect(note).not.toHaveProperty('outlineNodeId');
    expect(await api.repos.notes.get(note.id)).toEqual(note);
  });

  it('guarda las etiquetas ya limpias y las reemplaza al editar, y sin etiquetas conserva las que tenía', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
      tags: ['Medicina Interna::Nefrología', 'medicina interna::nefrología', '  ', 'Otra'],
    });
    expect(note.tags).toEqual(['Medicina_Interna::Nefrología', 'Otra']);

    const edited = await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'basic', front: 'f2', back: 'b' },
    });
    expect(edited.tags).toEqual(['Medicina_Interna::Nefrología', 'Otra']);

    const replaced = await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'basic', front: 'f2', back: 'b' },
      tags: ['Nueva'],
    });
    expect(replaced.tags).toEqual(['Nueva']);
    const cleared = await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'basic', front: 'f2', back: 'b' },
      tags: [],
    });
    expect(cleared.tags).toEqual([]);
    expect((await api.repos.notes.get(note.id))?.tags).toEqual([]);
  });

  it('guarda la unión con la línea de un apunte y la conserva en las ediciones siguientes', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'f', back: 'b' },
      outline: LINK,
    });
    expect(note).toMatchObject({ outlineId: LINK.outlineId, outlineNodeId: LINK.nodeId });
    expect(await api.repos.notes.listAllByOutline(LINK.outlineId)).toEqual([note]);

    const edited = await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'basic', front: 'otro', back: 'b' },
    });
    expect(edited).toMatchObject({ outlineId: LINK.outlineId, outlineNodeId: LINK.nodeId });
  });

  it('una nota con solo la mitad de la unión no se guarda', async () => {
    const { api } = setup();
    const note = {
      id: '01JAA6Q0000000000000000001',
      deckId: '01JAA6P0000000000000000001',
      tags: [],
      origin: 'manual' as const,
      editorialStatus: 'draft' as const,
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: '2026-10-01T15:00:00.000Z',
      kind: 'basic' as const,
      front: '<p>f</p>',
      back: '<p>b</p>',
    };
    await expect(api.repos.notes.put({ ...note, outlineId: LINK.outlineId })).rejects.toThrow();
    await expect(api.repos.notes.put({ ...note, outlineNodeId: LINK.nodeId })).rejects.toThrow();
  });

  it('las cartas que ya están como se piden no se vuelven a escribir al editar', async () => {
    const { api, user } = setup();
    const deck = await createManualDeck(api, user, { name: 'Mazo' });
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'cloze', text: '{{c1::a}} {{c2::b}}', extra: '' },
    });
    const before = await api.repos.cards.listAll();
    const spy = vi.spyOn(api.repos.cards, 'putMany');
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: '{{c1::a}} {{c2::b}} editado', extra: '' },
    });
    expect(spy).not.toHaveBeenCalled();
    expect(await api.repos.cards.listAll()).toEqual(before);
  });
});
