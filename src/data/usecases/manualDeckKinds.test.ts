// Los tres tipos de tarjeta a mano, básica, básica con tarjeta inversa y cloze con huecos anidados
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { NoteSchema, type Card } from '../schemas/decks';
import { makeUser, testApi } from '../testing/fixtures';
import {
  cardOrdinals,
  clozeOrdinals,
  convertDraft,
  createManualDeck,
  draftOf,
  saveManualNote,
  validateDraft,
  type NoteDraft,
} from './manualDecks';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  const deck = await createManualDeck(api, user, { name: 'Mazo' });
  return { api, user, deck };
}

const byOrdinal = (cards: readonly Card[]) =>
  [...cards].sort((a, b) => a.ordinal - b.ordinal).map((card) => [card.ordinal, card.id] as const);

const reverse = (front = 'Frente', back = 'Reverso'): NoteDraft => ({
  kind: 'basic_reverse',
  front,
  back,
});

describe('huecos anidados en el editor', () => {
  const cloze = (text: string) => validateDraft({ kind: 'cloze', text, extra: '' });

  it('reconoce los números de hueco de los huecos anidados', () => {
    expect(clozeOrdinals('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}')).toEqual([
      1, 2,
    ]);
    expect(clozeOrdinals('{{c3::A {{c1::B {{c2::C}}}}}} y {{c1::D}}')).toEqual([1, 2, 3]);
  });

  it('un hueco anidado válido se acepta y genera una carta por número único', () => {
    expect(cloze('{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}')).toBeNull();
    expect(cloze('{{c1::A {{c1::B}} C}}')).toBeNull();
    expect(
      cardOrdinals({ kind: 'cloze', text: '{{c1::A {{c1::B}} C}} {{c2::D}}', extra: '' }),
    ).toEqual([1, 2]);
  });

  it('sigue rechazando un hueco sin cerrar o sin respuesta, también dentro de otro', () => {
    expect(cloze('{{c1::El {{c2::ventrículo izquierdo}} bombea')).toBe('unclosed_cloze');
    expect(cloze('{{c1::El {{c2::ventrículo izquierdo bombea}}')).toBe('unclosed_cloze');
    expect(cloze('{{c1::El {{c2::}} bombea}}')).toBe('unclosed_cloze');
    expect(cloze('{{c1::El {{c0::ventrículo}} bombea}}')).toBe('unclosed_cloze');
    expect(cloze('{{c1::{{c2::   }}}}')).toBe('unclosed_cloze');
    expect(cloze('{{c1::El {{c2::ventrículo}} bombea}} y {{c3::aorta')).toBe('unclosed_cloze');
    expect(cloze('Sin ningún hueco {{ ni }} llaves')).toBe('no_cloze');
  });

  it('un hueco que solo tiene otro hueco adentro sí tiene respuesta', () => {
    expect(cloze('{{c1::{{c2::ventrículo}}}}')).toBeNull();
  });
});

describe('básica con tarjeta inversa', () => {
  it('pide frente y reverso como la básica', () => {
    expect(validateDraft(reverse(' ', 'x'))).toBe('empty_front');
    expect(validateDraft(reverse('x', ''))).toBe('empty_back');
    expect(validateDraft(reverse('x'.repeat(3001), 'y'))).toBe('too_long');
    expect(validateDraft(reverse())).toBeNull();
  });

  it('genera dos cartas, la 0 y la 1, de una misma nota', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: reverse('¿FEVI?', 'Fracción'),
    });
    expect(note).toMatchObject({
      kind: 'basic_reverse',
      origin: 'manual',
      editorialStatus: 'draft',
      front: '<p>¿FEVI?</p>',
      back: '<p>Fracción</p>',
    });
    // Lo que se guarda pasa el esquema
    expect(NoteSchema.parse(await api.repos.notes.get(note.id)).kind).toBe('basic_reverse');
    const cards = await api.repos.cards.list();
    expect(cards.map((card) => card.ordinal).sort()).toEqual([0, 1]);
    for (const card of cards) {
      expect(card).toMatchObject({ noteId: note.id, deckId: deck.id });
    }
    expect(draftOf(note)).toEqual(reverse('¿FEVI?', 'Fracción'));
  });

  it('guarda el texto escapado, así nada de lo que escribe se vuelve código', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: reverse('<img src=x onerror=alert(1)>', '<script>alert(1)</script> & "x"'),
    });
    expect(note).toMatchObject({
      front: '<p>&lt;img src=x onerror=alert(1)&gt;</p>',
      back: '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>',
    });
  });

  it('al editar conserva el ID de las dos cartas y la fecha de creación de la nota', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, { deckId: deck.id, draft: reverse() });
    const before = byOrdinal(await api.repos.cards.list());
    const edited = await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: reverse('Frente nuevo', 'Reverso nuevo'),
    });
    expect(byOrdinal(await api.repos.cards.list())).toEqual(before);
    expect(edited.id).toBe(note.id);
    expect(edited.createdAt).toBe(note.createdAt);
    expect(draftOf(edited)).toEqual(reverse('Frente nuevo', 'Reverso nuevo'));
  });

  it('cambiar de básica a inversa agrega la carta 1 y conserva la carta 0', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'basic', front: 'a', back: 'b' },
    });
    const [first] = await api.repos.cards.list();
    await saveManualNote(api, user, { deckId: deck.id, noteId: note.id, draft: reverse('a', 'b') });
    const after = byOrdinal(await api.repos.cards.list());
    expect(after.map(([ordinal]) => ordinal)).toEqual([0, 1]);
    expect(after[0]?.[1]).toBe(first?.id);
    expect((await api.repos.notes.get(note.id))?.kind).toBe('basic_reverse');
  });

  it('cambiar de inversa a básica quita la carta 1 y conserva la carta 0', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, { deckId: deck.id, draft: reverse() });
    const [zero] = byOrdinal(await api.repos.cards.list());
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'basic', front: 'Frente', back: 'Reverso' },
    });
    expect(byOrdinal(await api.repos.cards.list())).toEqual([zero]);
  });

  it('cambiar entre inversa y cloze reajusta las cartas por número', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, { deckId: deck.id, draft: reverse() });
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: { kind: 'cloze', text: 'A {{c1::uno}} y {{c2::dos}}', extra: '' },
    });
    expect((await api.repos.cards.list()).map((card) => card.ordinal).sort()).toEqual([1, 2]);
    await saveManualNote(api, user, { deckId: deck.id, noteId: note.id, draft: reverse() });
    expect((await api.repos.cards.list()).map((card) => card.ordinal).sort()).toEqual([0, 1]);
  });

  it('una cloze con huecos anidados guarda una carta por número y al editar conserva las que siguen', async () => {
    const { api, user, deck } = await setup();
    const note = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: {
        kind: 'cloze',
        text: '{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}',
        extra: '',
      },
    });
    const before = byOrdinal(await api.repos.cards.list());
    expect(before.map(([ordinal]) => ordinal)).toEqual([1, 2]);
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: note.id,
      draft: {
        kind: 'cloze',
        text: '{{c1::El {{c2::ventrículo izquierdo}} bombea a la {{c3::aorta}}}}',
        extra: '',
      },
    });
    const after = byOrdinal(await api.repos.cards.list());
    expect(after.map(([ordinal]) => ordinal)).toEqual([1, 2, 3]);
    expect(after.slice(0, 2)).toEqual(before);
  });
});

describe('cambiar el tipo de una tarjeta guardada', () => {
  it('al pasar de inversa a básica la carta 1 queda con marca de borrado y al volver revive con su ID', async () => {
    const { api, user, deck } = await setup();
    const saved = await saveManualNote(api, user, { deckId: deck.id, draft: reverse() });
    const before = byOrdinal((await api.repos.cards.list()).filter((c) => c.noteId === saved.id));
    const stamp = new Date('2026-10-09T10:00:00.000Z');

    await saveManualNote(
      api,
      user,
      { deckId: deck.id, noteId: saved.id, draft: { kind: 'basic', front: 'F', back: 'R' } },
      stamp,
    );
    // La carta 1 ya no se ve, pero sigue guardada con su marca para sincronizar
    expect((await api.repos.cards.list()).map((card) => card.ordinal)).toEqual([0]);
    const hidden = (await api.repos.cards.listAll()).find((card) => card.ordinal === 1);
    expect(hidden?.deletedAt).toBe(stamp.toISOString());

    await saveManualNote(api, user, { deckId: deck.id, noteId: saved.id, draft: reverse() });
    const after = byOrdinal((await api.repos.cards.list()).filter((c) => c.noteId === saved.id));
    expect(after).toEqual(before);
  });

  it('al pasar de cloze a básica y de vuelta, la carta del hueco 1 conserva su ID', async () => {
    const { api, user, deck } = await setup();
    const saved = await saveManualNote(api, user, {
      deckId: deck.id,
      draft: { kind: 'cloze', text: '{{c1::uno}} y {{c2::dos}}', extra: '' },
    });
    const first = (await api.repos.cards.list()).find((card) => card.ordinal === 1);
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: saved.id,
      draft: { kind: 'basic', front: 'F', back: 'R' },
    });
    await saveManualNote(api, user, {
      deckId: deck.id,
      noteId: saved.id,
      draft: { kind: 'cloze', text: '{{c1::uno}}', extra: '' },
    });
    const back = (await api.repos.cards.list()).find((card) => card.ordinal === 1);
    expect(back?.id).toBe(first?.id);
  });
});

describe('cambiar de tipo mientras se escribe', () => {
  it('conserva lo escrito entre las dos básicas', () => {
    const basic: NoteDraft = { kind: 'basic', front: 'F', back: 'R' };
    expect(convertDraft(basic, 'basic_reverse')).toEqual(reverse('F', 'R'));
    expect(convertDraft(reverse('F', 'R'), 'basic')).toEqual(basic);
    expect(convertDraft(basic, 'basic')).toBe(basic);
  });

  it('el frente pasa al texto con huecos y el reverso a la nota extra, y de vuelta', () => {
    const cloze = convertDraft(reverse('El {{c1::VI}}', 'Nota'), 'cloze');
    expect(cloze).toEqual({ kind: 'cloze', text: 'El {{c1::VI}}', extra: 'Nota' });
    expect(convertDraft(cloze, 'basic_reverse')).toEqual(reverse('El {{c1::VI}}', 'Nota'));
    expect(convertDraft(cloze, 'basic')).toEqual({
      kind: 'basic',
      front: 'El {{c1::VI}}',
      back: 'Nota',
    });
  });

  it('cada tipo dice cuántas cartas genera', () => {
    expect(cardOrdinals({ kind: 'basic', front: 'a', back: 'b' })).toEqual([0]);
    expect(cardOrdinals(reverse())).toEqual([0, 1]);
    expect(cardOrdinals({ kind: 'cloze', text: '{{c2::a}} {{c1::b}}', extra: '' })).toEqual([1, 2]);
    expect(cardOrdinals({ kind: 'cloze', text: 'sin huecos', extra: '' })).toEqual([]);
  });
});
