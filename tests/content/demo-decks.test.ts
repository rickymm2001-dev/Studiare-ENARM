// Mazos precargados de la demo, hoy los de Paco (D-053).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NoteSchema } from '@/data/schemas/decks';
import { topicTaxonomy } from '@/demo/content';
import { buildDeckEntities } from '@/demo/content/deckEntities';
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
    expect(entities.decks).toHaveLength(3);
    expect(entities.notes).toHaveLength(3771);
    for (const note of entities.notes) expect(NoteSchema.safeParse(note).success).toBe(true);
    const clozeCards = decks
      .flatMap((deck) => deck.notes)
      .reduce((sum, note) => sum + (note.kind === 'cloze' ? note.ordinals.length : 1), 0);
    expect(entities.cards).toHaveLength(clozeCards);
    expect(new Set(entities.cards.map((entry) => entry.card.id)).size).toBe(entities.cards.length);
    expect(buildDeckEntities(decks).cards[10]?.card.id).toBe(entities.cards[10]?.card.id);
  });
});
