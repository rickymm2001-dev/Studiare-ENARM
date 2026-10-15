// La cuota del día con el banco de la nube (B11, 2.2, 2.3 y 5.5 del plan de B11). Función pura, sin
// Dexie ni red. El servidor cuenta las preguntas nuevas que el alumno bajó en el día de estudio y la app
// cuenta las que contestó. Lo que le queda es el menor de los dos, así el servidor frena la descarga y la
// app frena la práctica de lo ya bajado. Una cuota de un día que ya pasó no cuenta.
import type { DenyReason, QuotaInfo } from './contracts';

/** La cuota sigue siendo del día de estudio en curso */
export function quotaIsCurrent(quota: Pick<QuotaInfo, 'resetsAt'>, now: Date): boolean {
  const resetsAt = Date.parse(quota.resetsAt);
  return !Number.isNaN(resetsAt) && now.getTime() < resetsAt;
}

/**
 * Lo que le queda hoy, el menor entre lo que dice la app por sus respuestas y lo que dice el servidor
 * por sus lecturas nuevas. null es sin tope. Sin cuota del servidor, o con una de otro día, manda la app
 */
export function combinedLeft(
  appLeft: number | null,
  quota: QuotaInfo | null | undefined,
  now: Date,
): number | null {
  if (!quota || !quotaIsCurrent(quota, now) || quota.left === null) return appLeft;
  return appLeft === null ? quota.left : Math.min(appLeft, quota.left);
}

/** Hasta cuándo frena el servidor a un plan de pago. null si no hay freno o ya pasó */
export function brakeUntil(quota: QuotaInfo | null | undefined, now: Date): Date | null {
  const retryAt = quota?.brake.retryAt;
  if (!retryAt) return null;
  const time = Date.parse(retryAt);
  return Number.isNaN(time) || time <= now.getTime() ? null : new Date(time);
}

/** Por qué no llegó todo lo pedido, para decirlo en una línea. null si llegó todo */
export type ShortfallReason = 'offline' | 'closed' | 'brake' | 'daily_limit' | 'unavailable';

/**
 * El motivo principal de lo que no llegó. Primero lo que impide todo (sin conexión, banco cerrado),
 * luego los topes y al final lo que ya no está en el banco
 */
export function shortfallReason(result: {
  denied: readonly { reason: DenyReason }[];
  offline: boolean;
  missing: number;
}): ShortfallReason | null {
  const reasons = new Set(result.denied.map((item) => item.reason));
  if (result.offline) return 'offline';
  if (reasons.has('closed')) return 'closed';
  if (reasons.has('brake')) return 'brake';
  if (reasons.has('daily_limit')) return 'daily_limit';
  if (reasons.size > 0 || result.missing > 0) return 'unavailable';
  return null;
}
