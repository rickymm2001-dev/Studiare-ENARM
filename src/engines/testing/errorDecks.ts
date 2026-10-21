// Ayudantes de las pruebas de la unión de Mis errores. Arman mazos, notas y tarjetas con ids válidos y fijos
// y aplican un plan como lo hace el caso de uso. Solo los usan las pruebas
import type { Card, Deck, Note } from '@/data/schemas/decks';
import type { ErrorDeckMergeInput, ErrorDeckMergePlan } from '@/engines/errorDeckMerge';

export const USER = '01J0000000000000000000USER';
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Un ULID válido y fijo a partir de un número */
export function idOf(n: number): string {
  let rest = n;
  let out = '';
  for (let index = 0; index < 24; index += 1) {
    out = (CROCKFORD[rest % 32] as string) + out;
    rest = Math.floor(rest / 32);
  }
  return `01${out}`;
}

export const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12)).toISOString();

export function deck(n: number, overrides: Partial<Deck> = {}): Deck {
  return {
    id: idOf(n),
    name: 'Mis errores',
    description: '',
    ownerId: USER,
    origin: 'generated',
    visibility: 'private',
    isDemo: false,
    system: 'errors',
    createdAt: day(n),
    ...overrides,
  };
}

export function note(n: number, deckN: number, question: number, overrides: Partial<Note> = {}) {
  return {
    id: idOf(n),
    deckId: idOf(deckN),
    kind: 'basic',
    front: `<p>Pregunta ${String(question)}</p>`,
    back: '<p>Respuesta</p>',
    tags: [],
    origin: 'generated',
    editorialStatus: 'approved',
    sourceQuote: 'Cita',
    sourceQuestionVersionId: idOf(question),
    errorKey: idOf(question),
    isDemo: false,
    createdAt: day(n),
    ...overrides,
  } as Note;
}

export function card(n: number, noteN: number, deckN: number, overrides: Partial<Card> = {}): Card {
  return {
    id: idOf(n),
    noteId: idOf(noteN),
    deckId: idOf(deckN),
    ordinal: 0,
    createdAt: day(n),
    ...overrides,
  };
}

export const baseInput = (overrides: Partial<ErrorDeckMergeInput> = {}): ErrorDeckMergeInput => ({
  userId: USER,
  decks: [],
  notes: [],
  cards: [],
  reps: new Map(),
  knownDeckIds: [],
  preferredDeckId: idOf(900),
  ...overrides,
});

/** Aplica un plan a mazos, notas y tarjetas, como lo hace el caso de uso */
export function applyPlan(
  input: ErrorDeckMergeInput,
  plan: ErrorDeckMergePlan,
  stamp: string,
): Pick<ErrorDeckMergeInput, 'decks' | 'notes' | 'cards'> {
  const markedDeck = new Set(plan.markDecks);
  const retiredDeck = new Set(plan.retireDecks);
  const movedNote = new Map(plan.moveNotes.map((move) => [move.id, move.toDeckId]));
  const movedCard = new Map(plan.moveCards.map((move) => [move.id, move.toDeckId]));
  const retiredNote = new Set(plan.retireNotes);
  const retiredCard = new Set(plan.retireCards);
  return {
    decks: input.decks.map((entry) => ({
      ...entry,
      ...(markedDeck.has(entry.id) ? { system: 'errors' as const, updatedAt: stamp } : {}),
      ...(retiredDeck.has(entry.id) ? { deletedAt: stamp, updatedAt: stamp } : {}),
    })),
    notes: input.notes.map((entry) => ({
      ...entry,
      ...(movedNote.has(entry.id)
        ? { deckId: movedNote.get(entry.id) as string, updatedAt: stamp }
        : {}),
      ...(retiredNote.has(entry.id) ? { deletedAt: stamp, updatedAt: stamp } : {}),
    })),
    cards: input.cards.map((entry) => ({
      ...entry,
      ...(movedCard.has(entry.id)
        ? { deckId: movedCard.get(entry.id) as string, updatedAt: stamp }
        : {}),
      ...(retiredCard.has(entry.id) ? { deletedAt: stamp, updatedAt: stamp } : {}),
    })),
  };
}
