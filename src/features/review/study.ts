// Lógica de estudio de tarjetas sin React. Estado FSRS más reciente de cada tarjeta desde la
// bitácora, lo repasado hoy y el texto de las notas cloze.
import type { FsrsCardState } from '@/data/schemas/common';
import type { AppEvent } from '@/data/schemas/events';
import type { ReviewedToday } from '@/engines/fsrs';
import { studyDayOf } from '@/engines/studyDay';
import { isVolumeAward } from '@/engines/xp';

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

const CLOZE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

/**
 * Texto de una nota cloze para la tarjeta del hueco ordinal. Al frente el hueco activo se ve como
 * [...] o con su pista, y al revelar se resalta la respuesta. Los demás huecos muestran su texto.
 * Recibe HTML ya saneado y solo agrega etiquetas mark
 */
export function renderCloze(html: string, ordinal: number, reveal: boolean): string {
  return html.replace(CLOZE, (_match, number: string, answer: string, hint: string | undefined) => {
    if (Number(number) !== ordinal) return answer;
    return reveal ? `<mark>${answer}</mark>` : `<mark>[${hint ?? '…'}]</mark>`;
  });
}
