/**
 * Señales de conducta y calibración metacognitiva (7.6).
 *
 * Qué hace. A partir de las respuestas del alumno calcula su ritmo personal, el puntaje z de cada
 * tiempo, la adivinanza rápida, si fue más rápido que su percentil 25, la dirección de los cambios
 * de respuesta, la fatiga dentro de sesiones largas, la distracción, el desempeño por franja
 * horaria y por duración de sesión, y la calibración de su confianza.
 * Entradas. Respuestas con tiempo, palabras del enunciado, acierto, confianza, cambios, sesión,
 * momento y la probabilidad esperada de acierto (de Elo o Rasch) para ajustar por dificultad.
 * Salidas. Señales por respuesta y resúmenes por alumno, cada uno con su estado calibrando.
 * Método
 *   - Tiempo normalizado. Logaritmo de milisegundos por palabra y puntaje z contra la media y la
 *     desviación del propio alumno
 *   - Adivinanza rápida. Menos tiempo que el mínimo plausible de lectura (palabras entre 6 por
 *     segundo) o menos que el percentil 10 personal de tiempo por palabra
 *   - Fatiga. En sesiones de más de 30 minutos, la exactitud ajustada por dificultad (acierto
 *     menos probabilidad esperada) del último tercio cae frente al primero y el tiempo sube
 *   - Calibración. Exactitud por nivel de confianza con Wilson contra una probabilidad nominal de
 *     cada nivel (Adiviné 0.25, Dudé 0.60, Seguro 0.90, J). Sobreconfianza si la exactitud con
 *     Seguro queda claramente debajo de 0.90
 * Umbrales. 6 palabras por segundo, percentiles 10 y 25, 30 minutos y pausa larga de 120 segundos
 * (J, configurables). Ritmo personal desde 20 respuestas y calibración desde 30 (J).
 */
import type { Thresholds } from '@/config/thresholds';
import { wilsonInterval, type ProportionInterval } from './stats/wilson';

/** Respuestas mínimas para usar el ritmo personal (J) */
export const MIN_RESPONSES_FOR_PACE = 20;
/** Respuestas mínimas para mostrar la calibración de la confianza (J) */
export const MIN_RESPONSES_FOR_CALIBRATION = 30;
/** Probabilidad nominal de cada nivel de confianza (J) */
export const NOMINAL_CONFIDENCE = { guessed: 0.25, unsure: 0.6, sure: 0.9 } as const;

export type Confidence = keyof typeof NOMINAL_CONFIDENCE;

export interface ResponseRecord {
  id: string;
  sessionId: string;
  /** Momento de la respuesta, ISO UTC */
  at: string;
  msToAnswer: number;
  /** Palabras de la viñeta, la frase y las opciones mostradas */
  words: number;
  correct: boolean;
  confidence: Confidence;
  /** Probabilidad de acierto esperada por la dificultad y la habilidad, para ajustar */
  expected: number;
  /** Cambios de respuesta, cada uno con si la opción anterior y la nueva eran correctas */
  changes: readonly { fromCorrect: boolean; toCorrect: boolean }[];
  /** Minutos desde el inicio de la sesión */
  minuteInSession: number;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}

const logPace = (response: Pick<ResponseRecord, 'msToAnswer' | 'words'>) =>
  Math.log(Math.max(response.msToAnswer, 1) / Math.max(response.words, 1));

export interface PersonalPace {
  responses: number;
  /** Ritmo personal listo para usarse */
  ready: boolean;
  mean: number;
  sd: number;
  p10: number;
  p25: number;
}

/** Ritmo personal con el logaritmo de milisegundos por palabra */
export function personalPace(
  responses: readonly Pick<ResponseRecord, 'msToAnswer' | 'words'>[],
  thresholds: Thresholds['behavior'],
): PersonalPace {
  const values = responses.map(logPace).sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(values.length - 1, 1);
  return {
    responses: values.length,
    ready: values.length >= MIN_RESPONSES_FOR_PACE,
    mean,
    sd: Math.sqrt(variance) || 1,
    p10: quantile(values, thresholds.rapidGuessPercentile),
    p25: quantile(values, thresholds.easyPercentile),
  };
}

export interface ResponseSignals {
  timeZ: number | null;
  rapidGuess: boolean;
  fasterThanP25: boolean;
  /** Tiempo mínimo plausible de lectura, en milisegundos */
  minReadingMs: number;
}

export function responseSignals(
  response: Pick<ResponseRecord, 'msToAnswer' | 'words'>,
  pace: PersonalPace,
  thresholds: Thresholds['behavior'],
): ResponseSignals {
  const minReadingMs = (response.words / thresholds.maxWordsPerSecond) * 1000;
  const value = logPace(response);
  const belowReading = response.msToAnswer < minReadingMs;
  return {
    timeZ: pace.ready ? (value - pace.mean) / pace.sd : null,
    rapidGuess: belowReading || (pace.ready && value < pace.p10),
    fasterThanP25: pace.ready && value < pace.p25,
    minReadingMs,
  };
}

export interface ChangeSummary {
  total: number;
  correctToIncorrect: number;
  incorrectToCorrect: number;
  incorrectToIncorrect: number;
  /** Respuestas con al menos un cambio */
  responsesWithChanges: number;
}

export function summarizeChanges(
  responses: readonly Pick<ResponseRecord, 'changes'>[],
): ChangeSummary {
  const summary: ChangeSummary = {
    total: 0,
    correctToIncorrect: 0,
    incorrectToCorrect: 0,
    incorrectToIncorrect: 0,
    responsesWithChanges: 0,
  };
  for (const response of responses) {
    if (response.changes.length > 0) summary.responsesWithChanges += 1;
    for (const change of response.changes) {
      summary.total += 1;
      if (change.fromCorrect && !change.toCorrect) summary.correctToIncorrect += 1;
      else if (!change.fromCorrect && change.toCorrect) summary.incorrectToCorrect += 1;
      else if (!change.fromCorrect && !change.toCorrect) summary.incorrectToIncorrect += 1;
    }
  }
  return summary;
}

export interface ThirdsComparison {
  sessionId: string;
  minutes: number;
  /** Exactitud ajustada por dificultad, acierto menos probabilidad esperada */
  firstResidual: number;
  lastResidual: number;
  firstLogPace: number;
  lastLogPace: number;
  items: number;
}

/** Compara el primer y el último tercio de cada sesión larga */
export function sessionThirds(
  responses: readonly ResponseRecord[],
  thresholds: Thresholds['behavior'],
): ThirdsComparison[] {
  const bySession = new Map<string, ResponseRecord[]>();
  for (const response of responses) {
    const list = bySession.get(response.sessionId) ?? [];
    list.push(response);
    bySession.set(response.sessionId, list);
  }
  const result: ThirdsComparison[] = [];
  for (const [sessionId, list] of bySession) {
    const ordered = [...list].sort((a, b) => a.minuteInSession - b.minuteInSession);
    const minutes = Math.max(...ordered.map((response) => response.minuteInSession));
    if (minutes <= thresholds.fatigueMinSessionMinutes || ordered.length < 6) continue;
    const third = Math.floor(ordered.length / 3);
    const first = ordered.slice(0, third);
    const last = ordered.slice(-third);
    const residual = (items: readonly ResponseRecord[]) =>
      items.reduce((sum, item) => sum + (item.correct ? 1 : 0) - item.expected, 0) / items.length;
    const pace = (items: readonly ResponseRecord[]) =>
      items.reduce((sum, item) => sum + logPace(item), 0) / items.length;
    result.push({
      sessionId,
      minutes,
      firstResidual: residual(first),
      lastResidual: residual(last),
      firstLogPace: pace(first),
      lastLogPace: pace(last),
      items: ordered.length,
    });
  }
  return result;
}

export interface FatigueSignal {
  /** Sesiones largas analizadas */
  sessions: number;
  /** Caída media de la exactitud ajustada, último tercio menos primero */
  accuracyDrop: number;
  /** Error estándar de esa caída entre sesiones */
  standardError: number;
  /** Subida media del tiempo, en logaritmo de ms por palabra */
  timeIncrease: number;
  /** Patrón probable de fatiga. null si sigue calibrando */
  fatigued: boolean | null;
  /** Sesiones largas que faltan para dejar de calibrar */
  sessionsNeeded: number;
}

/** Sesiones largas mínimas para hablar de fatiga (J) */
export const MIN_LONG_SESSIONS_FOR_FATIGUE = 3;

/**
 * Patrón de fatiga entre sesiones largas. La exactitud ajustada del último tercio cae de forma
 * clara (la caída supera 1.64 errores estándar, una cola) y el tiempo sube
 */
export function fatigueSignal(
  responses: readonly ResponseRecord[],
  thresholds: Thresholds['behavior'],
): FatigueSignal {
  const thirds = sessionThirds(responses, thresholds);
  const drops = thirds.map((session) => session.lastResidual - session.firstResidual);
  const n = drops.length;
  const meanDrop = n === 0 ? 0 : drops.reduce((sum, value) => sum + value, 0) / n;
  const sd =
    n < 2
      ? Number.POSITIVE_INFINITY
      : Math.sqrt(drops.reduce((sum, value) => sum + (value - meanDrop) ** 2, 0) / (n - 1));
  const standardError = n < 2 ? Number.POSITIVE_INFINITY : Math.max(sd, 0.05) / Math.sqrt(n);
  const timeIncrease =
    n === 0
      ? 0
      : thirds.reduce((sum, session) => sum + session.lastLogPace - session.firstLogPace, 0) / n;
  const ready = n >= MIN_LONG_SESSIONS_FOR_FATIGUE;
  return {
    sessions: n,
    accuracyDrop: meanDrop,
    standardError,
    timeIncrease,
    fatigued: ready ? meanDrop < -1.64 * standardError && timeIncrease > 0 : null,
    sessionsNeeded: Math.max(0, MIN_LONG_SESSIONS_FOR_FATIGUE - n),
  };
}

export interface DistractionSummary {
  /** Veces que salió de la pestaña */
  tabSwitches: number;
  /** Minutos fuera de la pestaña */
  minutesAway: number;
  /** Respuestas con pausas largas, que tardaron más que la pausa larga */
  longPauses: number;
}

export function summarizeDistraction(input: {
  awayMs: readonly number[];
  responses: readonly Pick<ResponseRecord, 'msToAnswer'>[];
  thresholds: Thresholds['behavior'];
}): DistractionSummary {
  return {
    tabSwitches: input.awayMs.length,
    minutesAway: input.awayMs.reduce((sum, value) => sum + value, 0) / 60000,
    longPauses: input.responses.filter(
      (response) => response.msToAnswer > input.thresholds.longPauseSeconds * 1000,
    ).length,
  };
}

export type HourBand = 'madrugada' | 'manana' | 'tarde' | 'noche';

/** Franja horaria local. Madrugada de 0 a 6, mañana de 6 a 12, tarde de 12 a 19 y noche de 19 a 24 */
export function hourBand(localHour: number): HourBand {
  if (localHour < 6) return 'madrugada';
  if (localHour < 12) return 'manana';
  if (localHour < 19) return 'tarde';
  return 'noche';
}

/** Exactitud por grupo con su intervalo, por ejemplo por franja horaria o duración de sesión */
export function accuracyBy<K extends string>(
  responses: readonly Pick<ResponseRecord, 'correct'>[],
  keyOf: (index: number) => K,
): Record<K, ProportionInterval & { n: number }> {
  const tallies = new Map<K, { correct: number; n: number }>();
  responses.forEach((response, index) => {
    const key = keyOf(index);
    const tally = tallies.get(key) ?? { correct: 0, n: 0 };
    tally.n += 1;
    if (response.correct) tally.correct += 1;
    tallies.set(key, tally);
  });
  const result = {} as Record<K, ProportionInterval & { n: number }>;
  for (const [key, tally] of tallies)
    result[key] = { ...wilsonInterval(tally.correct, tally.n), n: tally.n };
  return result;
}

export interface CalibrationReport {
  responses: number;
  ready: boolean;
  responsesNeeded: number;
  levels: Record<Confidence, ProportionInterval & { n: number; nominal: number }>;
  /** Errores con confianza Seguro */
  sureErrors: number;
  /** Media ponderada de nominal menos real. Positivo es sobreconfianza */
  calibrationGap: number;
  label: 'overconfident' | 'underconfident' | 'calibrated' | null;
}

export function calibrationReport(
  responses: readonly Pick<ResponseRecord, 'correct' | 'confidence'>[],
): CalibrationReport {
  const levels = {} as CalibrationReport['levels'];
  let weightedGap = 0;
  for (const level of ['guessed', 'unsure', 'sure'] as const) {
    const subset = responses.filter((response) => response.confidence === level);
    const correct = subset.filter((response) => response.correct).length;
    levels[level] = {
      ...wilsonInterval(correct, subset.length),
      n: subset.length,
      nominal: NOMINAL_CONFIDENCE[level],
    };
    if (subset.length > 0)
      weightedGap += (NOMINAL_CONFIDENCE[level] - correct / subset.length) * subset.length;
  }
  const n = responses.length;
  const ready = n >= MIN_RESPONSES_FOR_CALIBRATION;
  const sure = levels.sure;
  const lowConfidence = [levels.guessed, levels.unsure];
  let label: CalibrationReport['label'] = null;
  if (ready) {
    if (sure.n > 0 && sure.upper < NOMINAL_CONFIDENCE.sure) label = 'overconfident';
    else if (lowConfidence.some((level) => level.n > 0 && level.lower > level.nominal))
      label = 'underconfident';
    else label = 'calibrated';
  }
  return {
    responses: n,
    ready,
    responsesNeeded: Math.max(0, MIN_RESPONSES_FOR_CALIBRATION - n),
    levels,
    sureErrors: responses.filter((response) => response.confidence === 'sure' && !response.correct)
      .length,
    calibrationGap: n === 0 ? 0 : weightedGap / n,
    label,
  };
}
