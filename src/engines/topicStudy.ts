/**
 * Estudio por tema (V4-B3, lo que pidió Paco).
 *
 * Qué hace. Arma la sesión de quien quiere estudiar un tema o un mazo aparte de lo que le toca hoy,
 * por ejemplo quemaduras desde cero, sin suspender y reactivar tarjetas a mano como en Anki.
 * Entradas. Las tarjetas ya filtradas por la selección del alumno (QueueCard), el momento actual y
 * un tope opcional.
 * Salidas. Los cardId en el orden en que se estudian.
 * Método
 *   - Entran todas las tarjetas de la selección, no solo las que vencen hoy. Las nuevas también
 *   - Primero lo que ya venció o vence hoy, de la más vencida a la menos vencida. Después lo que
 *     todavía no vence, de lo más cercano a lo más lejano, y al final las nuevas por cardId
 *   - La sesión no tiene límite diario y se corta en TOPIC_SESSION_LIMIT para que no sea eterna
 *   - Es determinista. Todo empate se rompe por cardId
 * Lo que no hace. No cambia la cola de hoy. Quien lo usa marca cada repaso de esta sesión como extra
 * para que no gaste el cupo de nuevas ni de repasos del día. Calificar sí actualiza FSRS, que sabe
 * tratar un repaso temprano con el tiempo que de verdad pasó desde el anterior
 */
import type { QueueCard } from './fsrs';

/** Tarjetas de una sesión por tema. Más que eso se estudia en otra sesión */
export const TOPIC_SESSION_LIMIT = 200;

function dueMs(card: QueueCard): number | null {
  if (!card.state || card.state.state === 'new') return null;
  const ms = Date.parse(card.state.due);
  return Number.isNaN(ms) ? null : ms;
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function buildTopicQueue(input: {
  cards: readonly QueueCard[];
  now: Date;
  limit?: number;
}): string[] {
  const limit = Math.max(0, Math.trunc(input.limit ?? TOPIC_SESSION_LIMIT));
  const nowMs = input.now.getTime();
  const due: { card: QueueCard; ms: number }[] = [];
  const upcoming: { card: QueueCard; ms: number }[] = [];
  const fresh: QueueCard[] = [];
  for (const card of input.cards) {
    const ms = dueMs(card);
    if (ms === null) fresh.push(card);
    else if (ms <= nowMs) due.push({ card, ms });
    else upcoming.push({ card, ms });
  }
  const byDue = (a: { card: QueueCard; ms: number }, b: { card: QueueCard; ms: number }) =>
    a.ms - b.ms || compareIds(a.card.cardId, b.card.cardId);
  due.sort(byDue);
  upcoming.sort(byDue);
  fresh.sort((a, b) => compareIds(a.cardId, b.cardId));
  return [...due.map((e) => e.card), ...upcoming.map((e) => e.card), ...fresh]
    .slice(0, limit)
    .map((card) => card.cardId);
}
