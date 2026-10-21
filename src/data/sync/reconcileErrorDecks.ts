// Une los mazos Mis errores de una cuenta en uno solo (B14, 2.6 del plan de B14, hallazgo H05). Corre en
// reconcileProfile, después de bajar los registros y antes de subir, así lo que cambia sube en la misma
// corrida como cambios normales de sync_records. El motor src/engines/errorDeckMerge.ts decide qué se
// queda. Aquí se lee de Dexie y se aplica. La primera vez en un dispositivo con un mazo de errores de
// antes de B14, le pone la marca, que lo sube y deja que los otros dispositivos lo reconozcan.
//
// Nunca se borra nada de verdad. Una nota repetida o un mazo vacío se marcan como borrados y su
// historial sigue en la bitácora, que solo se agrega. Una tarjeta mudada conserva su id, así su estado de
// FSRS, que sale de esa bitácora, sigue.
import {
  duplicateNoteGroups,
  emptyMergePlan,
  isEmptyPlan,
  planErrorDeckMerge,
  type ErrorDeckMergePlan,
} from '@/engines/errorDeckMerge';
import type { DataApi } from '../context';
import { isLive, type Card, type Deck, type Note } from '../schemas/decks';
import { errorIds, errorOwnerKeys, liveErrorDecks } from '../usecases/errorCards';

type Api = Pick<DataApi, 'repos'>;

export interface ReconcileErrorDecksDeps {
  api: Api;
  /** El perfil de este navegador */
  userId: string;
  /** La cuenta de la nube, que es la clave del dueño de Mis errores */
  authId: string;
  now: () => Date;
}

/** Aplica el plan con las fechas de hoy. Primero lo que se muda y lo que se retira, al final los mazos */
async function applyPlan(
  api: Api,
  plan: ErrorDeckMergePlan,
  decks: readonly Deck[],
  notes: readonly Note[],
  cards: readonly Card[],
  stamp: string,
): Promise<void> {
  const moved = new Map(plan.moveNotes.map((move) => [move.id, move.toDeckId]));
  const retired = new Set(plan.retireNotes);
  const noteChanges = notes.flatMap((note): Note[] => {
    if (retired.has(note.id)) return [{ ...note, deletedAt: stamp, updatedAt: stamp }];
    const toDeckId = moved.get(note.id);
    return toDeckId === undefined ? [] : [{ ...note, deckId: toDeckId, updatedAt: stamp }];
  });
  if (noteChanges.length > 0) await api.repos.notes.putMany(noteChanges);

  const cardMoves = new Map(plan.moveCards.map((move) => [move.id, move.toDeckId]));
  const retiredCards = new Set(plan.retireCards);
  const cardChanges = cards.flatMap((card): Card[] => {
    if (retiredCards.has(card.id)) return [{ ...card, deletedAt: stamp, updatedAt: stamp }];
    const toDeckId = cardMoves.get(card.id);
    return toDeckId === undefined ? [] : [{ ...card, deckId: toDeckId, updatedAt: stamp }];
  });
  if (cardChanges.length > 0) await api.repos.cards.putMany(cardChanges);

  const marked = new Set(plan.markDecks);
  const retiredDecks = new Set(plan.retireDecks);
  const deckChanges = decks.flatMap((deck): Deck[] => {
    if (retiredDecks.has(deck.id)) {
      return [{ ...deck, system: 'errors', deletedAt: stamp, updatedAt: stamp }];
    }
    return marked.has(deck.id) ? [{ ...deck, system: 'errors', updatedAt: stamp }] : [];
  });
  if (deckChanges.length > 0) await api.repos.decks.putMany(deckChanges);
}

/** Deja un solo Mis errores. Devuelve el plan que aplicó, vacío si no había nada que unir */
export async function reconcileErrorDecks(
  deps: ReconcileErrorDecksDeps,
): Promise<ErrorDeckMergePlan> {
  const { repos } = deps.api;
  const keys = errorOwnerKeys(deps.userId, deps.authId);
  const allDecks = await repos.decks.listAll();
  const candidates = liveErrorDecks(allDecks, deps.userId, keys);
  if (candidates.length === 0) return emptyMergePlan();

  const deckIds = new Set(candidates.map((deck) => deck.id));
  const notes = (await Promise.all([...deckIds].map((id) => repos.notes.listAllByDeck(id)))).flat();
  const cards = await repos.cards.listAllForNotes(notes.map((note) => note.id));
  // Los repasos de cada tarjeta solo hacen falta para elegir entre notas repetidas
  const reps = new Map<string, number>();
  for (const group of duplicateNoteGroups(notes, deckIds)) {
    const groupCards = cards.filter(
      (card) => isLive(card) && group.some((note) => note.id === card.noteId),
    );
    for (const card of groupCards) {
      const state = await repos.caches.cardState.get(card.id);
      reps.set(card.id, state?.fsrs.reps ?? 0);
    }
  }
  const plan = planErrorDeckMerge({
    userId: deps.userId,
    decks: allDecks,
    notes,
    cards,
    reps,
    knownDeckIds: keys.map((key) => errorIds.deck(key)),
    preferredDeckId: errorIds.deck(deps.authId),
  });
  if (isEmptyPlan(plan)) return plan;
  await applyPlan(deps.api, plan, allDecks, notes, cards, deps.now().toISOString());
  return plan;
}
