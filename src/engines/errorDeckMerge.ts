/**
 * Unión de los mazos Mis errores de una cuenta (B14, 2.6 del plan de B14, hallazgo H05).
 *
 * Qué hace. Cada dispositivo arma su Mis errores con ids que salen de una clave. Antes de B14 la clave
 * era el id del perfil local, distinto en cada dispositivo, y la sincronización traía el mazo del otro
 * con su propio id, así que el alumno veía dos mazos con las mismas tarjetas. Este motor planea cómo
 * dejar uno solo y sin tarjetas repetidas. Es puro: dice qué mudar, qué marcar como borrado y qué marcar
 * como mazo de errores. El caso de uso lo aplica como cambios normales de sync_records.
 * Entradas. Los mazos del alumno, las notas y tarjetas de sus mazos de errores, los repasos de cada
 * tarjeta y los ids que se reconocen como Mis errores aunque no lleven la marca.
 * Salidas. Un plan con el mazo que se queda, los mazos por marcar, las notas y tarjetas por mudar a él,
 * las repetidas por retirar y los mazos que quedan vacíos.
 * Método
 *   - Son mazos de errores los vivos del alumno con la marca system errors o con un id conocido
 *   - Se queda el de la clave de la cuenta o, si no existe, el más antiguo
 *   - Las notas de los otros se mudan con su misma tarjeta. Cambian el mazo y la fecha, no el id, así el
 *     historial de FSRS de la tarjeta sigue
 *   - Dos notas son la misma tarjeta si tienen la misma clave de error. Una nota sin clave, de antes de
 *     B14, se reconoce por su pregunta y su frente, para no confundir una tarjeta de contraste, que
 *     también cita una pregunta, con la tarjeta de esa pregunta
 *   - Entre dos notas repetidas se queda la de la tarjeta con más repasos. Si empatan, la que ya está en el
 *     mazo que se queda y luego la más antigua. La otra se marca como borrada. Su historial sigue en
 *     la bitácora y la tarjeta deja de programarse
 *   - Los mazos que quedan vacíos se marcan como borrados
 * Umbrales. Ninguno.
 */
import { isLive, type Card, type Deck, type Note } from '@/data/schemas/decks';

/** Las claves de las tarjetas de contraste empiezan así. Las de una pregunta son su id */
export const CONTRAST_KEY_PREFIX = 'contraste|';

const frontOf = (note: Pick<Note, 'kind'> & { front?: string; text?: string }) =>
  note.kind === 'cloze' ? (note.text ?? '') : (note.front ?? '');

/**
 * Con qué otras tarjetas de error es la misma. null si no se puede saber. Una tarjeta de contraste se
 * reconoce por su clave. Una de una pregunta, por la pregunta y su frente, tenga clave o no
 */
export function errorGroupKey(card: {
  errorKey?: string | undefined;
  questionVersionId: string | null;
  front: string;
}): string | null {
  const { errorKey } = card;
  if (errorKey?.startsWith(CONTRAST_KEY_PREFIX)) return `k:${errorKey}`;
  const question = errorKey ?? card.questionVersionId;
  return question === null ? null : `q:${question}|${card.front}`;
}

export function errorGroupKeyOfNote(note: Note): string | null {
  return errorGroupKey({
    errorKey: note.errorKey,
    questionVersionId: note.sourceQuestionVersionId,
    front: frontOf(note),
  });
}

export interface ErrorDeckMergeInput {
  userId: string;
  /** Los mazos del alumno, también los marcados como borrados */
  decks: readonly Deck[];
  /** Las notas de los mazos de errores, vivas y borradas */
  notes: readonly Note[];
  /** Las tarjetas de esas notas, vivas y borradas */
  cards: readonly Card[];
  /** Repasos hechos de cada tarjeta. Una tarjeta sin dato cuenta 0 */
  reps: ReadonlyMap<string, number>;
  /** Ids que son un Mis errores aunque no lleven la marca todavía, como el de antes de B14 */
  knownDeckIds: readonly string[];
  /** El mazo con la clave de la cuenta, que se queda si existe */
  preferredDeckId: string;
}

export interface ErrorDeckMergePlan {
  /** El mazo que se queda. null si el alumno no tiene Mis errores */
  survivorId: string | null;
  /** Mazos que reciben la marca system errors */
  markDecks: string[];
  moveNotes: { id: string; toDeckId: string }[];
  moveCards: { id: string; toDeckId: string }[];
  /** Notas repetidas por marcar como borradas, con sus tarjetas */
  retireNotes: string[];
  retireCards: string[];
  /** Mazos que quedan vacíos tras la unión */
  retireDecks: string[];
}

/** Un plan sin nada que hacer y sin mazo que se quede */
export function emptyMergePlan(): ErrorDeckMergePlan {
  return {
    survivorId: null,
    markDecks: [],
    moveNotes: [],
    moveCards: [],
    retireNotes: [],
    retireCards: [],
    retireDecks: [],
  };
}

export function isEmptyPlan(plan: ErrorDeckMergePlan): boolean {
  return (
    plan.markDecks.length === 0 &&
    plan.moveNotes.length === 0 &&
    plan.moveCards.length === 0 &&
    plan.retireNotes.length === 0 &&
    plan.retireCards.length === 0 &&
    plan.retireDecks.length === 0
  );
}

function byAge(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Los grupos de notas vivas que son la misma tarjeta, solo los de más de una. El caso de uso los
 * necesita antes de planear para pedir los repasos de esas tarjetas y no los de todas
 */
export function duplicateNoteGroups(
  notes: readonly Note[],
  deckIds: ReadonlySet<string>,
): Note[][] {
  const groups = new Map<string, Note[]>();
  for (const note of notes) {
    if (!isLive(note) || !deckIds.has(note.deckId)) continue;
    const key = errorGroupKeyOfNote(note) ?? `n:${note.id}`;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function planErrorDeckMerge(input: ErrorDeckMergeInput): ErrorDeckMergePlan {
  const known = new Set(input.knownDeckIds);
  const candidates = input.decks.filter(
    (deck) =>
      deck.ownerId === input.userId &&
      isLive(deck) &&
      (deck.system === 'errors' || known.has(deck.id)),
  );
  if (candidates.length === 0) return emptyMergePlan();
  const survivor =
    candidates.find((deck) => deck.id === input.preferredDeckId) ?? [...candidates].sort(byAge)[0];
  if (!survivor) return emptyMergePlan();
  const candidateIds = new Set(candidates.map((deck) => deck.id));

  const liveCards = new Map<string, Card[]>();
  for (const card of input.cards) {
    if (isLive(card)) liveCards.set(card.noteId, [...(liveCards.get(card.noteId) ?? []), card]);
  }
  const repsOf = (note: Note) =>
    (liveCards.get(note.id) ?? []).reduce((sum, card) => sum + (input.reps.get(card.id) ?? 0), 0);

  const groups = new Map<string, Note[]>();
  for (const note of input.notes) {
    if (!isLive(note) || !candidateIds.has(note.deckId)) continue;
    const key = errorGroupKeyOfNote(note) ?? `n:${note.id}`;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }

  const plan: ErrorDeckMergePlan = {
    survivorId: survivor.id,
    markDecks: candidates
      .filter((deck) => deck.system !== 'errors')
      .map((deck) => deck.id)
      .sort(),
    moveNotes: [],
    moveCards: [],
    retireNotes: [],
    retireCards: [],
    retireDecks: candidates
      .filter((deck) => deck.id !== survivor.id)
      .map((deck) => deck.id)
      .sort(),
  };

  const orderedGroups = [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [, group] of orderedGroups) {
    // Gana la de más repasos y, si empatan, la que ya está en el mazo que se queda y luego la más antigua
    const ranked = [...group].sort(
      (a, b) =>
        repsOf(b) - repsOf(a) ||
        Number(b.deckId === survivor.id) - Number(a.deckId === survivor.id) ||
        byAge(a, b),
    );
    const winner = ranked[0] as Note;
    for (const loser of ranked.slice(1)) {
      plan.retireNotes.push(loser.id);
      for (const card of liveCards.get(loser.id) ?? []) plan.retireCards.push(card.id);
    }
    if (winner.deckId !== survivor.id)
      plan.moveNotes.push({ id: winner.id, toDeckId: survivor.id });
    for (const card of liveCards.get(winner.id) ?? []) {
      if (card.deckId !== survivor.id) plan.moveCards.push({ id: card.id, toDeckId: survivor.id });
    }
  }
  plan.moveNotes.sort((a, b) => (a.id < b.id ? -1 : 1));
  plan.moveCards.sort((a, b) => (a.id < b.id ? -1 : 1));
  plan.retireNotes.sort();
  plan.retireCards.sort();
  return plan;
}
