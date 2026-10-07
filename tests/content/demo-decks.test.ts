// Mazos precargados de la demo, hoy los de Paco (D-053).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { createCardSanitizer } from '@/data/content/cardHtml';
import { NoteSchema } from '@/data/schemas/decks';
import { topicTaxonomy } from '@/demo/content';
import { buildDeckEntities, deckIds, noteSubject } from '@/demo/content/deckEntities';
import { tagSegments } from '@/engines/tagPath';
import { loadDemoDecks } from '@/demo/content/decks';

const decks = await loadDemoDecks();
const topicsOf = new Map(
  topicTaxonomy.branches.map((branch) => [branch.key, new Set(branch.topics.map((t) => t.key))]),
);
const html = (note: (typeof decks)[number]['notes'][number]) =>
  note.kind === 'basic' ? note.front + note.back : note.text + note.extra;

describe('mazos de Paco en la demo (D-053)', () => {
  it('son los 3 mazos completos con crédito y pendientes de revisión médica', () => {
    expect(decks.map((deck) => [deck.key, deck.notes.length])).toEqual([
      ['paco-gyo', 1526],
      ['paco-mi', 2122],
      ['paco-urgencias', 123],
    ]);
    for (const deck of decks) {
      expect(deck.author).toBe('Paco');
      expect(deck.status).toBe('pending_physician_review');
      expect(deck.description).toContain('Demostración');
    }
  });

  it('cada nota tiene clave única y una rama y tema que existen en la taxonomía', () => {
    const keys = decks.flatMap((deck) => deck.notes.map((note) => note.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const note of decks.flatMap((deck) => deck.notes)) {
      if (note.branch === null) {
        expect(note.topic).toBeNull();
        continue;
      }
      expect(topicsOf.has(note.branch), note.key).toBe(true);
      if (note.topic !== null)
        expect(topicsOf.get(note.branch)?.has(note.topic), note.key).toBe(true);
    }
  });

  it('el HTML viene saneado. Sin estilos, scripts, eventos ni recursos externos', () => {
    for (const note of decks.flatMap((deck) => deck.notes)) {
      const text = html(note);
      expect(text, note.key).not.toMatch(
        /<script|<iframe|<a\b|\son\w+=|style=|javascript:|https?:/i,
      );
    }
  });

  it(
    'el HTML guardado ya está saneado. Sanearlo otra vez no cambia nada',
    { timeout: 60_000 },
    () => {
      const sanitizer = createCardSanitizer(new JSDOM('').window);
      for (const deck of decks) {
        const declared = new Set(deck.media);
        const keep = (file: string) => (declared.has(file) ? file : null);
        for (const note of deck.notes) {
          const fields = note.kind === 'basic' ? [note.front, note.back] : [note.text, note.extra];
          for (const field of fields) expect(sanitizer.sanitize(field, keep), note.key).toBe(field);
        }
      }
    },
  );

  it('cada imagen que usan las notas existe en public y está declarada en su mazo', () => {
    for (const deck of decks) {
      const declared = new Set(deck.media);
      for (const note of deck.notes) {
        for (const [, src] of html(note).matchAll(/<img src="([^"]+)"/g)) {
          expect(declared.has(src ?? ''), `${note.key} ${src}`).toBe(true);
        }
      }
      for (const path of deck.media) {
        expect(existsSync(join(import.meta.dirname, '..', '..', 'public', path)), path).toBe(true);
      }
    }
  });

  it('se convierten en mazos, notas y tarjetas válidas, una por hueco en las cloze', () => {
    const entities = buildDeckEntities(decks);
    // La raíz ENARM 2027, los 3 mazos de Paco y 37 materias como submazos (D-085)
    expect(entities.decks).toHaveLength(1 + 3 + 37);
    expect(entities.notes).toHaveLength(3771);
    for (const note of entities.notes) expect(NoteSchema.safeParse(note).success).toBe(true);
    const clozeCards = decks
      .flatMap((deck) => deck.notes)
      .reduce((sum, note) => sum + (note.kind === 'cloze' ? note.ordinals.length : 1), 0);
    expect(entities.cards).toHaveLength(clozeCards);
    expect(new Set(entities.cards.map((entry) => entry.card.id)).size).toBe(entities.cards.length);
    expect(buildDeckEntities(decks).cards[10]?.card.id).toBe(entities.cards[10]?.card.id);
  });

  it('forman un árbol sin perder notas ni tarjetas, cada una bajo la materia de su etiqueta', () => {
    const entities = buildDeckEntities(decks);
    const byId = new Map(entities.decks.map((deck) => [deck.id, deck]));
    const root = entities.decks.filter((deck) => !deck.parentId);
    expect(root.map((deck) => deck.name)).toEqual(['ENARM 2027']);
    const branches = entities.decks.filter((deck) => deck.parentId === root[0]?.id);
    expect(branches.map((deck) => deck.id).sort()).toEqual(
      decks.map((deck) => deckIds.deck(deck.key)).sort(),
    );
    for (const deck of entities.decks) {
      if (deck.parentId) expect(byId.has(deck.parentId), deck.name).toBe(true);
    }
    // Conteos y claves iguales a las del archivo, sin perder ni duplicar nada
    const sourceNotes = decks.flatMap((deck) => deck.notes);
    expect(entities.notes.map((note) => note.id).sort()).toEqual(
      sourceNotes.map((note) => deckIds.note(note.key)).sort(),
    );
    const noteById = new Map(entities.notes.map((note) => [note.id, note]));
    for (const entry of entities.cards) {
      const note = noteById.get(entry.card.noteId);
      expect(note?.deckId, entry.key).toBe(entry.card.deckId);
      expect(byId.has(entry.card.deckId), entry.key).toBe(true);
    }
    // La materia es el segundo nivel de la etiqueta y su mazo tiene ese nombre
    for (const source of sourceNotes) {
      const note = noteById.get(deckIds.note(source.key));
      const subject = noteSubject(source);
      const holder = byId.get(note?.deckId ?? '');
      if (subject === null) expect(holder?.parentId).toBe(root[0]?.id);
      else expect(holder?.name, source.key).toBe(subject.replace(/[-_]+/g, ' ').trim());
    }
  });

  it('ninguna etiqueta guardada tiene espacios y las rutas conservan su jerarquía', () => {
    const entities = buildDeckEntities(decks);
    const sourceNotes = decks.flatMap((deck) => deck.notes);
    const noteById = new Map(entities.notes.map((note) => [note.id, note]));
    // Las 42 etiquetas conocidas que llevaban espacio, que salían de partir la ruta original
    const withSpace = new Set(
      sourceNotes.flatMap((note) => note.tags).filter((tag) => /\s/.test(tag)),
    );
    expect(withSpace.size).toBe(42);
    const looseSegments = new Set<string>();
    for (const source of sourceNotes) {
      const note = noteById.get(deckIds.note(source.key));
      expect(note?.tags, source.key).toHaveLength(1);
      for (const tag of note?.tags ?? []) {
        expect(tag, source.key).not.toMatch(/\s/);
        // Mismos niveles que tenía la ruta original, uno por cada etiqueta partida
        expect(tagSegments(tag), source.key).toHaveLength(source.tags.length);
        for (const segment of tagSegments(tag)) looseSegments.add(segment.replace(/[-_]+/g, ' '));
      }
    }
    // Cada una de las 42 sigue existiendo como un nivel de alguna ruta, ahora sin espacio
    for (const old of withSpace) expect(looseSegments.has(old), old).toBe(true);
  });
});
