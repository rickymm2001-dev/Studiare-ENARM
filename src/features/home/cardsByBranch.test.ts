import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import { deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { branchNames } from '@/i18n/features';
import { cardsByBranch } from './cardsByBranch';

const root = deckIds.deck(ROOT_DECK_KEY);
const mi = deckIds.deck('paco-mi');
const miSubject = deckIds.subject('paco-mi', 'Cardiología');
const gyo = deckIds.deck('paco-gyo');
const errors = newId();
const imported = newId();

const decks = [
  { id: root, name: 'ENARM 2027', parentId: null },
  { id: mi, name: 'Medicina interna (Paco)', parentId: root },
  { id: miSubject, name: 'Cardiología', parentId: mi },
  { id: gyo, name: 'Ginecología y obstetricia (Paco)', parentId: root },
  { id: errors, name: 'Mis errores', parentId: null },
  { id: imported, name: 'Mi mazo importado', parentId: null },
];

const card = (deckId: string, noteId = newId()) => ({ id: newId(), deckId, noteId });

describe('tarjetas por rama para la dona de Inicio (D-150)', () => {
  it('resuelve la rama por el mazo precargado, también desde su submazo, y por la etiqueta de tema', () => {
    const errorNote = newId();
    const cards = [card(mi), card(miSubject), card(gyo), card(errors, errorNote)];
    // Mis errores guarda la subespecialidad de la pregunta, que es el tema de la taxonomía
    const noteTags = new Map([[errorNote, { tags: ['topic:cardiology'] }]]);
    const result = cardsByBranch({
      cards,
      decks,
      noteTags,
      activeCardIds: new Set(cards.map((entry) => entry.id)),
    });
    expect(result.byBranch).toBe(true);
    expect(result.total).toBe(4);
    expect(result.groups).toEqual([
      { key: 'internal_medicine', name: branchNames.internal_medicine, count: 3, tone: 'mi' },
      {
        key: 'obstetrics_gynecology',
        name: branchNames.obstetrics_gynecology,
        count: 1,
        tone: 'gyo',
      },
    ]);
  });

  it('con una tarjeta sin rama agrupa todo por mazo de primer nivel, de más a menos', () => {
    const cards = [card(mi), card(imported), card(imported)];
    const result = cardsByBranch({
      cards,
      decks,
      noteTags: new Map(),
      activeCardIds: new Set(cards.map((entry) => entry.id)),
    });
    expect(result.byBranch).toBe(false);
    expect(result.groups).toEqual([
      { key: imported, name: 'Mi mazo importado', count: 2, tone: 'neutral' },
      { key: mi, name: 'Medicina interna (Paco)', count: 1, tone: 'neutral' },
    ]);
  });

  it('solo cuentan las tarjetas activas', () => {
    const active = card(mi);
    const result = cardsByBranch({
      cards: [active, card(mi)],
      decks,
      noteTags: new Map(),
      activeCardIds: new Set([active.id]),
    });
    expect(result.total).toBe(1);
    expect(result.groups[0]?.count).toBe(1);
  });
});
