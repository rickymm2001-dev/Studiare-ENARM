import { describe, expect, it } from 'vitest';
import type { Deck } from '@/data/schemas/decks';
import { newId } from '@/data/testing/fixtures';
import { questionCardChoices } from './deckChoices';

const USER = newId();
const NOW = '2026-10-13T16:00:00.000Z';

function deck(overrides: Partial<Deck> & Pick<Deck, 'name'>): Deck {
  return {
    id: newId(),
    description: '',
    ownerId: USER,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    parentId: null,
    createdAt: NOW,
    ...overrides,
  };
}

describe('los mazos para la tarjeta de una pregunta', () => {
  it('ofrece los suyos y los precargados que sigue, en árbol, sin Mis errores, la capa ni el contenedor', () => {
    const root = deck({
      name: 'ENARM 2027',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
    });
    const branch = deck({
      name: 'Medicina interna (Paco)',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      parentId: root.id,
    });
    const subject = deck({
      name: 'Infectología',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      parentId: branch.id,
    });
    const notFollowed = deck({
      name: 'Urgencias (Paco)',
      ownerId: null,
      origin: 'preloaded',
      visibility: 'public',
      parentId: root.id,
    });
    const layer = deck({ name: 'Mis tarjetas', parentId: subject.id });
    const errors = deck({ name: 'Mis errores', origin: 'generated' });
    const own = deck({ name: 'Cardiología' });
    const child = deck({ name: 'Arritmias', parentId: own.id });
    const imported = deck({ name: 'Mazo de Anki', origin: 'imported' });
    const foreign = deck({ name: 'Ajeno', ownerId: newId() });
    const choices = questionCardChoices({
      decks: [root, branch, subject, notFollowed, layer, errors, own, child, imported, foreign],
      userId: USER,
      followed: new Set([root.id, branch.id, subject.id, layer.id, errors.id, own.id, child.id]),
      containers: new Set([root.id]),
    });
    expect(choices).toEqual([
      { deckId: own.id, label: 'Cardiología', group: 'own' },
      { deckId: child.id, label: '  Arritmias', group: 'own' },
      { deckId: imported.id, label: 'Mazo de Anki', group: 'own' },
      { deckId: branch.id, label: 'Medicina interna (Paco)', group: 'preloaded' },
      { deckId: subject.id, label: '  Infectología', group: 'preloaded' },
    ]);
  });
});
