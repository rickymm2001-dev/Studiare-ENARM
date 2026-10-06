import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { makeUser, testApi } from '../testing/fixtures';
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
