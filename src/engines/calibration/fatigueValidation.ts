/**
 * Validación del detector de fatiga con datos reales (B14, 3.6 del plan de B14, respuesta 71).
 *
 * Qué hace. En datos reales no hay verdad para medir la sensibilidad del detector de fatiga, así que
 * mide dos cosas que sí se ven y dice si el detector se puede mostrar como un patrón del alumno o sigue
 * calibrando. La app muestra la fatiga de cada alumno con calibrando mientras el estado global no sea
 * validated.
 * Entradas. Las respuestas de los alumnos con permiso con su minuto de sesión, las opciones que vieron,
 * el banco, los motivos de error que reportaron y los umbrales.
 * Salidas. El estado global, cuántos alumnos y sesiones largas se evaluaron, el kappa entre mitades y
 * el límite inferior de la razón de Fatiga entre señalados y no señalados.
 * Método
 *   - Consistencia. A cada alumno con sesiones largas suficientes (más de 30 minutos y 6 respuestas o
 *     más cada una) se le corre fatigueTrendSignal en sus sesiones pares y en las impares, y se
 *     calcula el kappa de Cohen entre las dos mitades. Cada mitad necesita las 3 sesiones largas que
 *     pide el detector, así que en la práctica son 6 sesiones largas por alumno
 *   - Coincidencia con lo que dice el alumno. Entre los errores del último tercio de sesiones largas
 *     que tienen un motivo reportado, qué parte lleva el motivo Fatiga en los alumnos que el detector
 *     señala contra los que no, como razón. Su límite inferior es el límite inferior de Wilson de los
 *     señalados entre el superior de los no señalados
 *   - Estado. calibrating mientras falten alumnos (30), motivos reportados (40) o falte alguno de los
 *     dos grupos. Con datos suficientes, validated si el kappa es de 0.4 o más y el límite inferior de
 *     la razón queda arriba de 1, y not_valid si no
 * Umbrales. Los tres de model_settings.thresholds.fatigue (J) y los de conducta de los umbrales.
 */
import type { ModelSettings } from '@/config/modelSettings';
import type { Thresholds } from '@/config/thresholds';
import { fatigueTrendSignal, type ResponseRecord } from '@/engines/behavior';
import { motiveOfStored } from './motives';
import { addDays } from '@/engines/studyDay';
import { cohenKappa } from '@/engines/stats/kappa';
import { wilsonInterval } from '@/engines/stats/wilson';
import { chronological, indexExposures, lastBefore } from './firstAttempts';
import {
  EXPECTED_BY_PHYSICIAN_DIFFICULTY,
  type AnswerRow,
  type BankItemRow,
  type ExposureRow,
  type FatigueValidation,
  type MotiveRow,
} from './types';

/** Respuestas mínimas de una sesión larga para que el detector la use (igual que behavior.ts) */
const MIN_ANSWERS_PER_LONG_SESSION = 6;

const round = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

interface LongSession {
  first: Pick<AnswerRow, 'daysBefore' | 'seq'>;
  records: ResponseRecord[];
}

export function validateFatigue(input: {
  asOfDay: string;
  answers: readonly AnswerRow[];
  bank: ReadonlyMap<string, BankItemRow>;
  exposures: readonly ExposureRow[];
  motives: readonly MotiveRow[];
  thresholds: Pick<Thresholds, 'behavior'>;
  settings: Pick<ModelSettings, 'thresholds'>;
}): FatigueValidation {
  const limits = input.settings.thresholds.fatigue;
  const behavior = input.thresholds.behavior;
  const exposureIndex = indexExposures(input.exposures);

  // Sesiones por alumno. Solo las respuestas con sesión, minuto y tiempo sirven para el detector
  const byPerson = new Map<string, Map<string, AnswerRow[]>>();
  for (const answer of [...input.answers].sort(chronological)) {
    if (answer.session === null || answer.minute === null || answer.ms === null) continue;
    if (!input.bank.has(answer.versionId)) continue;
    let sessions = byPerson.get(answer.person);
    if (!sessions) {
      sessions = new Map();
      byPerson.set(answer.person, sessions);
    }
    const list = sessions.get(answer.session) ?? [];
    list.push(answer);
    sessions.set(answer.session, list);
  }

  const recordOf = (answer: AnswerRow, session: string): ResponseRecord => {
    const item = input.bank.get(answer.versionId) as BankItemRow;
    const shown = lastBefore(exposureIndex.get(`${answer.person}|${answer.versionId}`), answer.seq);
    const optionWords = new Map(item.options.map((option) => [option.id, option.words]));
    const words =
      item.words + (shown?.options ?? []).reduce((sum, id) => sum + (optionWords.get(id) ?? 0), 0);
    return {
      id: String(answer.seq),
      sessionId: session,
      at: `${addDays(input.asOfDay, -answer.daysBefore)}T12:00:00.000Z`,
      msToAnswer: answer.ms ?? 0,
      words: Math.max(words, 1),
      correct: answer.correct,
      confidence: answer.confidence,
      expected: EXPECTED_BY_PHYSICIAN_DIFFICULTY[item.physician - 1] ?? 0.6,
      changes: [],
      minuteInSession: answer.minute ?? 0,
    };
  };

  const pairs: [string, string][] = [];
  const flagged = new Set<string>();
  const notFlagged = new Set<string>();
  let longSessions = 0;
  for (const [person, sessions] of byPerson) {
    const long: LongSession[] = [];
    for (const [session, answers] of sessions) {
      const minutes = Math.max(...answers.map((answer) => answer.minute ?? 0));
      if (minutes <= behavior.fatigueMinSessionMinutes) continue;
      if (answers.length < MIN_ANSWERS_PER_LONG_SESSION) continue;
      long.push({
        first: answers[0] as AnswerRow,
        records: answers.map((answer) => recordOf(answer, session)),
      });
    }
    if (long.length === 0) continue;
    long.sort((a, b) => chronological(a.first, b.first));
    const all = fatigueTrendSignal(
      long.flatMap((session) => session.records),
      behavior,
    ).fatigued;
    if (all === true) flagged.add(person);
    else if (all === false) notFlagged.add(person);

    const even = fatigueTrendSignal(
      long.filter((_, index) => index % 2 === 0).flatMap((session) => session.records),
      behavior,
    ).fatigued;
    const odd = fatigueTrendSignal(
      long.filter((_, index) => index % 2 === 1).flatMap((session) => session.records),
      behavior,
    ).fatigued;
    if (even !== null && odd !== null) {
      pairs.push([even ? 'yes' : 'no', odd ? 'yes' : 'no']);
      longSessions += long.length;
    }
  }

  // Errores del último tercio de sesiones largas con un motivo reportado, por grupo del detector
  const groups = { flagged: { k: 0, n: 0 }, notFlagged: { k: 0, n: 0 } };
  for (const row of input.motives) {
    if (!row.lastThird) continue;
    const motive = motiveOfStored(row.motive);
    if (motive === null) continue;
    const group = flagged.has(row.person)
      ? groups.flagged
      : notFlagged.has(row.person)
        ? groups.notFlagged
        : null;
    if (group === null) continue;
    group.n += 1;
    if (motive === 'fatigue') group.k += 1;
  }
  const reports = groups.flagged.n + groups.notFlagged.n;

  const kappa = cohenKappa(pairs)?.kappa ?? null;
  let ratioLower: number | null = null;
  if (groups.flagged.n > 0 && groups.notFlagged.n > 0) {
    const lower = wilsonInterval(groups.flagged.k, groups.flagged.n).lower;
    const upper = wilsonInterval(groups.notFlagged.k, groups.notFlagged.n).upper;
    ratioLower = upper > 0 ? lower / upper : null;
  }

  let state: FatigueValidation['state'] = 'calibrating';
  const enough =
    pairs.length >= limits.minStudents &&
    reports >= limits.minMotiveReports &&
    groups.flagged.n > 0 &&
    groups.notFlagged.n > 0;
  if (enough) {
    state =
      kappa !== null && kappa >= limits.minSplitHalfKappa && ratioLower !== null && ratioLower > 1
        ? 'validated'
        : 'not_valid';
  }
  return {
    state,
    students: pairs.length,
    longSessions,
    splitHalfKappa: kappa === null ? null : round(kappa, 4),
    motiveReports: reports,
    ratioLower: ratioLower === null ? null : round(ratioLower, 3),
  };
}
