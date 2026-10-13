/**
 * Motivos de error (B5, comentario 2 de Ricardo y 4.23 del plan del cambio).
 *
 * Qué hace. Define los siete motivos con que el alumno dice por qué falló, la tabla de equivalencias
 * que lee como uno de ellos cada una de las ocho causas que se guardaban antes, y el motivo vigente
 * de cada error. La bitácora solo se agrega, así que los eventos viejos nunca se editan. Se leen con
 * la tabla, y cambiar de motivo es otro evento en el que gana el último.
 * Entradas. Los eventos del alumno, en cualquier orden.
 * Salidas. El motivo vigente de cada error, el que ya marcó en una pregunta o tarjeta desde un
 * momento dado y el reparto de motivos por grupo, por ejemplo por rama o por trampa.
 * Método. Cada reporte se ata al intento más reciente de esa pregunta o tarjeta que no sea posterior
 * a él, que es el error que explica. Dentro del mismo error gana el reporte más reciente. Un reporte
 * sin intento previo, como uno que bajó de la nube antes que su respuesta, queda suelto con su
 * elemento. Otra razón no dice cuál de los siete fue, así que se lee como sin motivo.
 * Umbrales. Ninguno. Quien lee el reparto aplica su propio mínimo, como el de INSIGHT_MINIMUMS.
 */
import {
  ERROR_MOTIVES,
  LEGACY_ERROR_CAUSES,
  type ErrorMotive,
  type LegacyErrorCause,
  type StoredErrorCause,
} from '@/data/schemas/common';
import type { AppEvent } from '@/data/schemas/events';

// Las listas viven en el esquema, que es la fuente de verdad del modelo de datos (6.1)
export { ERROR_MOTIVES, LEGACY_ERROR_CAUSES };
export type { ErrorMotive, LegacyErrorCause, StoredErrorCause };

/**
 * Tabla de equivalencias de 4.23. Cada causa vieja se lee como el motivo que mejor la describe.
 * Fui muy rápido o estaba cansado juntaba dos cosas y se lee como Tiempo, la primera y la que el
 * texto ponía por delante. Cambié mi respuesta es dudar de lo que ya se sabía, que es Ansiedad. Otra
 * razón no dice cuál fue, así que no se inventa uno y queda sin motivo
 */
export const LEGACY_CAUSE_EQUIVALENCE: Readonly<Record<LegacyErrorCause, ErrorMotive | null>> = {
  not_studied: 'knowledge',
  forgot: 'knowledge',
  confused: 'knowledge',
  misread: 'misinterpretation',
  missed_detail: 'superficial_reading',
  rushed_or_tired: 'time',
  changed_answer: 'anxiety',
  other: null,
};

const MOTIVES: ReadonlySet<string> = new Set(ERROR_MOTIVES);

export function isErrorMotive(value: string): value is ErrorMotive {
  return MOTIVES.has(value);
}

/** El motivo de un valor guardado. Un motivo de hoy se lee igual y una causa vieja con la tabla */
export function motiveOf(cause: StoredErrorCause): ErrorMotive | null {
  return isErrorMotive(cause) ? cause : LEGACY_CAUSE_EQUIVALENCE[cause];
}

/**
 * Los motivos de lectura. En una pregunta negativa cuentan como mala lectura reportada, porque así
 * se pasa por alto el NO o el EXCEPTO
 */
export const READING_MOTIVES: ReadonlySet<ErrorMotive> = new Set<ErrorMotive>([
  'misinterpretation',
  'superficial_reading',
]);

export type MotiveTargetKind = 'question' | 'card';

/** El motivo vigente de un error */
export interface MotiveEntry {
  /** Evento del intento que explica. null si no había un intento antes del reporte */
  attemptId: string | null;
  /** Si ese intento fue un error. null si no hay intento */
  failed: boolean | null;
  kind: MotiveTargetKind;
  /** El elemento como lo nombró el reporte, la versión de la pregunta o la tarjeta */
  targetId: string;
  /** null si el último reporte fue Otra razón, que no dice cuál de los siete fue */
  motive: ErrorMotive | null;
  /** Cuándo se reportó el motivo vigente */
  at: string;
}

const byTime = (a: AppEvent, b: AppEvent) =>
  a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * El motivo vigente de cada error. aliases da los otros IDs con que se puede nombrar una versión de
 * pregunta, como el ID estable de la pregunta, para que un reporte con cualquiera de los dos encuentre
 * su intento
 */
export function errorMotives(
  events: readonly AppEvent[],
  options: { aliases?: (questionVersionId: string) => readonly string[] } = {},
): MotiveEntry[] {
  const latest = new Map<string, { id: string; failed: boolean }>();
  const entries = new Map<string, MotiveEntry>();
  // Solo importan los intentos y los reportes, así no se ordena toda la bitácora
  const relevant = events.filter(
    (event) =>
      event.type === 'question_answered' ||
      event.type === 'card_reviewed' ||
      event.type === 'cause_reported',
  );
  for (const event of relevant.sort(byTime)) {
    if (event.type === 'question_answered') {
      const attempt = { id: event.id, failed: !event.payload.correct };
      const id = event.payload.questionVersionId;
      for (const name of [id, ...(options.aliases?.(id) ?? [])]) {
        latest.set(`question|${name}`, attempt);
      }
    } else if (event.type === 'card_reviewed') {
      latest.set(`card|${event.payload.cardId}`, {
        id: event.id,
        failed: event.payload.rating === 'again',
      });
    } else {
      // Lo que queda es un reporte de motivo
      const { targetKind, targetId, cause } = event.payload;
      const attempt = latest.get(`${targetKind}|${targetId}`);
      // El último reporte de un mismo error reemplaza a los anteriores
      entries.set(attempt ? attempt.id : `${targetKind}|${targetId}|suelto`, {
        attemptId: attempt?.id ?? null,
        failed: attempt?.failed ?? null,
        kind: targetKind,
        targetId,
        motive: motiveOf(cause),
        at: event.at,
      });
    }
  }
  return [...entries.values()];
}

/** El motivo vigente de cada intento, por el ID de su evento */
export function motivesByAttempt(
  entries: readonly MotiveEntry[],
): ReadonlyMap<string, ErrorMotive | null> {
  return new Map(
    entries.flatMap((entry) =>
      entry.attemptId === null ? [] : [[entry.attemptId, entry.motive] as const],
    ),
  );
}

/**
 * Los motivos de los errores, uno por error. Deja fuera los que se leen sin motivo y los reportes
 * atados a un acierto, que la interfaz no pide y no explican ningún error
 */
export function reportedMotives(entries: readonly MotiveEntry[]): MotiveEntry[] {
  return entries.filter((entry) => entry.motive !== null && entry.failed !== false);
}

/**
 * El motivo que el alumno ya marcó en una pregunta o tarjeta desde un momento, el último que marcó.
 * Sirve para mostrar el botón presionado en la revisión. null si no ha marcado nada desde entonces
 */
export function latestMotive(
  events: readonly AppEvent[],
  target: { kind: MotiveTargetKind; ids: readonly string[] },
  since: string,
): ErrorMotive | null {
  let found: { at: string; id: string; motive: ErrorMotive | null } | null = null;
  for (const event of events) {
    if (event.type !== 'cause_reported' || event.at < since) continue;
    const { targetKind, targetId, cause } = event.payload;
    if (targetKind !== target.kind || !target.ids.includes(targetId)) continue;
    if (found === null || event.at > found.at || (event.at === found.at && event.id > found.id)) {
      found = { at: event.at, id: event.id, motive: motiveOf(cause) };
    }
  }
  return found?.motive ?? null;
}

export interface MotiveTally {
  motive: ErrorMotive;
  count: number;
}

export interface GroupMotives<G extends string = string> {
  group: G;
  /** Errores con motivo del grupo */
  total: number;
  /** Los motivos con al menos un error, del más marcado al menos, y en empate en el orden de Ricardo */
  motives: MotiveTally[];
}

/** El reparto de motivos por grupo, por ejemplo por rama. Los grupos van del que más tiene al que menos */
export function motivesByGroup<G extends string>(
  items: readonly { group: G; motive: ErrorMotive }[],
): GroupMotives<G>[] {
  const groups = new Map<G, Map<ErrorMotive, number>>();
  for (const { group, motive } of items) {
    const counts = groups.get(group) ?? new Map<ErrorMotive, number>();
    counts.set(motive, (counts.get(motive) ?? 0) + 1);
    groups.set(group, counts);
  }
  return [...groups.entries()]
    .map(([group, counts]) => ({
      group,
      total: [...counts.values()].reduce((sum, value) => sum + value, 0),
      motives: ERROR_MOTIVES.flatMap((motive) => {
        const count = counts.get(motive) ?? 0;
        return count > 0 ? [{ motive, count }] : [];
      }).sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);
}

/** El motivo más marcado de una lista, con cuántas veces y de cuántas. null si la lista está vacía */
export function topMotive(
  motives: readonly ErrorMotive[],
): { motive: ErrorMotive; count: number; total: number } | null {
  const [group] = motivesByGroup(motives.map((motive) => ({ group: 'all', motive })));
  const first = group?.motives[0];
  return group && first ? { motive: first.motive, count: first.count, total: group.total } : null;
}
