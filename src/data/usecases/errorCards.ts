// Errores al repaso (7.1). Cada pregunta fallada pasa a Repasar como una tarjeta de pregunta, en un
// mazo privado del alumno. Los IDs son estables por alumno y pregunta, así fallar la misma
// pregunta dos veces no duplica la tarjeta ni reinicia su historial.
import { stableUlid } from '@/demo/stableId';
import type { DataApi } from '../context';
import type { Card, Deck, Note } from '../schemas/decks';
import type { User } from '../schemas/people';

/** Momento fijo de los IDs. Lo que cambia entre alumnos y preguntas es la parte aleatoria */
const ID_TIME = Date.UTC(2026, 0, 1);

export const errorIds = {
  deck: (userId: string) => stableUlid(`error-deck|${userId}`, ID_TIME),
  note: (userId: string, questionVersionId: string) =>
    stableUlid(`error-note|${userId}|${questionVersionId}`, ID_TIME),
  card: (userId: string, questionVersionId: string) =>
    stableUlid(`error-card|${userId}|${questionVersionId}`, ID_TIME),
};

/** Etiqueta de la nota con la subespecialidad de la pregunta, para filtrar en Repasar */
export const TOPIC_TAG_PREFIX = 'topic:';

export interface ErrorCardInput {
  /** Versión de la pregunta que falló */
  questionVersionId: string;
  /** Subespecialidad de la pregunta */
  topic: string;
  /** La tarjeta hereda el estado editorial y la marca de demostración de su pregunta */
  editorialStatus: Note['editorialStatus'];
  isDemo: boolean;
  front: string;
  back: string;
  /** Frase del banco que respalda la tarjeta (4.1) */
  quote: string;
}

/**
 * Crea las tarjetas de error que todavía no existen y el mazo si falta. Devuelve cuántas tarjetas
 * nuevas quedaron. Una pregunta que ya tiene tarjeta no se toca
 */
export async function queueErrorCards(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  inputs: readonly ErrorCardInput[],
  deck: { name: string; description: string },
  now: Date = new Date(),
): Promise<number> {
  const seen = new Set<string>();
  const unique = inputs.filter((input) => {
    if (seen.has(input.questionVersionId)) return false;
    seen.add(input.questionVersionId);
    return true;
  });
  if (unique.length === 0) return 0;

  const existing = await Promise.all(
    unique.map((input) => api.repos.notes.get(errorIds.note(user.id, input.questionVersionId))),
  );
  const fresh = unique.filter((_, index) => existing[index] === undefined);

  const deckId = errorIds.deck(user.id);
  const stored = await api.repos.decks.get(deckId);
  const anyDemo = fresh.some((input) => input.isDemo);
  if (fresh.length > 0 && (!stored || (anyDemo && !stored.isDemo))) {
    const entity: Deck = {
      id: deckId,
      name: stored?.name ?? deck.name,
      description: stored?.description ?? deck.description,
      ownerId: user.id,
      origin: 'generated',
      visibility: 'private',
      // Basta una tarjeta de demostración para que el mazo lleve la etiqueta (4.6)
      isDemo: anyDemo || (stored?.isDemo ?? false),
      createdAt: stored?.createdAt ?? now.toISOString(),
    };
    await api.repos.decks.put(entity);
  }
  if (fresh.length === 0) return 0;

  const notes: Note[] = [];
  const cards: Card[] = [];
  fresh.forEach((input, index) => {
    // Un milisegundo de diferencia por tarjeta conserva el orden en que se fallaron
    const createdAt = new Date(now.getTime() + index).toISOString();
    const noteId = errorIds.note(user.id, input.questionVersionId);
    notes.push({
      id: noteId,
      deckId,
      kind: 'basic',
      front: input.front,
      back: input.back,
      tags: [`${TOPIC_TAG_PREFIX}${input.topic}`],
      origin: 'generated',
      editorialStatus: input.editorialStatus,
      sourceQuote: input.quote,
      sourceQuestionVersionId: input.questionVersionId,
      isDemo: input.isDemo,
      createdAt,
    });
    cards.push({
      id: errorIds.card(user.id, input.questionVersionId),
      noteId,
      deckId,
      ordinal: 0,
      createdAt,
    });
  });
  await api.repos.notes.putMany(notes);
  await api.repos.cards.putMany(cards);
  return fresh.length;
}
