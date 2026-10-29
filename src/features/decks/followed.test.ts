// El contador de Mazos que sigues cuenta los mazos como se ven en la lista, uno por unidad, y no sus
// submazos ni el contenedor ENARM 2027 (defecto menor del diagnóstico de la beta).
import { describe, expect, it } from 'vitest';
import { newId } from '@/data/testing/fixtures';
import { deckIds, ROOT_DECK_KEY } from '@/demo/content/deckEntities';
import { followedDeckIds, followedTopLevelCount } from './followed';

const root = deckIds.deck(ROOT_DECK_KEY);
const mi = deckIds.deck('paco-mi');
const gyo = deckIds.deck('paco-gyo');
const errors = newId();
const userId = newId();

const stored = [
  { id: root, name: 'ENARM 2027', ownerId: null, parentId: null },
  { id: mi, name: 'Medicina interna (Paco)', ownerId: null, parentId: root },
  {
    id: deckIds.subject('paco-mi', 'Cardiología'),
    name: 'Cardiología',
    ownerId: null,
    parentId: mi,
  },
  { id: deckIds.subject('paco-mi', 'Nefrología'), name: 'Nefrología', ownerId: null, parentId: mi },
  { id: gyo, name: 'Ginecología y obstetricia (Paco)', ownerId: null, parentId: root },
  {
    id: deckIds.subject('paco-gyo', 'Obstetricia'),
    name: 'Obstetricia',
    ownerId: null,
    parentId: gyo,
  },
  { id: errors, name: 'Mis errores', ownerId: userId, parentId: null },
];

describe('followedTopLevelCount', () => {
  it('cuenta un mazo por unidad, sin sus materias, y suma los mazos propios', () => {
    const session = {
      isDemo: false,
      user: { id: userId },
      settings: { followedDecks: ['paco-mi', 'paco-gyo'] },
    };
    const followed = followedDeckIds(session, stored);
    // Seguir trae también las materias, que no se cuentan aparte
    expect(followed.size).toBe(6);
    expect(followedTopLevelCount(followed, stored)).toBe(3);
  });

  it('en la demo el contenedor ENARM 2027 no cuenta como mazo', () => {
    const session = { isDemo: true, user: { id: userId }, settings: { followedDecks: [] } };
    const followed = followedDeckIds(session, stored);
    expect(followed.has(root)).toBe(true);
    expect(followedTopLevelCount(followed, stored)).toBe(3);
  });

  it('sin mazos seguidos es cero', () => {
    expect(followedTopLevelCount(new Set(), stored)).toBe(0);
  });
});
