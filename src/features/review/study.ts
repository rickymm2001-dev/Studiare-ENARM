// Lógica de estudio de tarjetas sin React. Estado FSRS más reciente de cada tarjeta desde la
// bitácora, lo repasado hoy y el texto de las notas cloze.
import { parseCloze, renderClozeFace } from '@/data/content/cloze';
import type { FsrsCardState } from '@/data/schemas/common';
import type { Card, Note } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { TOPIC_TAG_PREFIX } from '@/data/usecases/errorCards';
import type { ReviewedToday } from '@/engines/fsrs';
import { studyDayOf } from '@/engines/studyDay';
import { isVolumeAward } from '@/engines/xp';

export type ReviewEndReason = 'completed' | 'abandoned';

export function reviewEndReason(
  position: number,
  queueLength: number,
  explicit?: ReviewEndReason,
): ReviewEndReason {
  return explicit ?? (position >= queueLength ? 'completed' : 'abandoned');
}

export function latestCardStates(events: readonly AppEvent[]): Map<string, FsrsCardState> {
  const states = new Map<string, FsrsCardState>();
  for (const event of events) {
    if (event.type === 'card_reviewed') states.set(event.payload.cardId, event.payload.stateAfter);
  }
  return states;
}

export function reviewedToday(
  events: readonly AppEvent[],
  today: string,
  noteOfCard: ReadonlyMap<string, string>,
): ReviewedToday {
  let newCount = 0;
  let reviewCount = 0;
  const noteIds = new Set<string>();
  for (const event of events) {
    if (event.type !== 'card_reviewed' || studyDayOf(new Date(event.at), event.tz) !== today)
      continue;
    if (event.payload.stateBefore === null || event.payload.stateBefore.state === 'new')
      newCount += 1;
    else reviewCount += 1;
    const note = noteOfCard.get(event.payload.cardId);
    if (note) noteIds.add(note);
  }
  return { newCount, reviewCount, noteIds: [...noteIds] };
}

/** XP de volumen ya ganado hoy, para el tope diario (9.5) */
export function volumeXpToday(events: readonly AppEvent[], today: string): number {
  let total = 0;
  for (const event of events) {
    if (event.type !== 'xp_awarded' || studyDayOf(new Date(event.at), event.tz) !== today) continue;
    if (isVolumeAward({ reason: event.payload.reason })) total += event.payload.amount;
  }
  return total;
}

/**
 * Texto de una nota cloze para la tarjeta del hueco ordinal. Al frente todo hueco con ese número se
 * ve como […] o con su pista, y con él lo que lleva adentro, aunque sean otros huecos. Al revelar se
 * resaltan. Los demás huecos muestran su texto sin llaves. Recibe HTML ya saneado y solo agrega
 * etiquetas mark
 */
export function renderCloze(html: string, ordinal: number, reveal: boolean): string {
  return renderClozeFace(parseCloze(html).nodes, ordinal, reveal);
}

/** La tarjeta salió de una pregunta del banco, como las de Mis errores */
export function isQuestionNote(note: Pick<Note, 'sourceQuestionVersionId'> | undefined): boolean {
  return note !== undefined && note.sourceQuestionVersionId !== null;
}

/**
 * Las tarjetas de preguntas falladas primero y en el orden en que se fallaron, y después las demás
 * en su orden. La cola del día toma las nuevas en este orden, así los errores no esperan detrás de
 * los mazos
 */
export function errorsFirst(
  cards: readonly Card[],
  notes: ReadonlyMap<string, Pick<Note, 'sourceQuestionVersionId'>>,
): Card[] {
  const isError = (card: Card) => isQuestionNote(notes.get(card.noteId));
  return [...cards].sort((a, b) => {
    const left = isError(a);
    const right = isError(b);
    if (left !== right) return left ? -1 : 1;
    return left ? a.createdAt.localeCompare(b.createdAt) : 0;
  });
}

/** Subespecialidad guardada en las etiquetas de una nota, o null */
export function topicFromTags(tags: readonly string[] | undefined): string | null {
  const tag = tags?.find((entry) => entry.startsWith(TOPIC_TAG_PREFIX));
  return tag ? tag.slice(TOPIC_TAG_PREFIX.length) : null;
}
