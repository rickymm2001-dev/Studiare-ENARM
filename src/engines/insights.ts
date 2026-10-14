/**
 * Motor de autoconocimiento (D-074). Junta las señales de conducta, estructura, sesgos y repaso en
 * un informe para el alumno con tres áreas. Cómo respondes un examen, qué trampas te atrapan y
 * cómo estudias. Cada hallazgo dice si ya hay datos suficientes (calibrando) y, cuando los hay, si
 * es una fortaleza, algo a vigilar o un foco de mejora. La interfaz convierte cada uno en una frase
 * con una acción concreta. Las trampas siguen docs/ANALISIS_DOCENTE_ENARM.md.
 * Entradas. Hechos de cada respuesta de opción múltiple, de cada repaso de tarjeta, de cada sesión,
 * las causas que reportó el alumno y sus días de estudio.
 * Salidas. Hallazgos ordenados y el resumen de fortalezas y focos.
 * Método
 *   - Ritmo contra los 77 segundos por reactivo del ENARM (280 en unas 6 horas)
 *   - Adivinanza rápida contra el ritmo de lectura plausible, tiempo atascado, cambios de respuesta, calibración de la confianza y
 *     fatiga con el motor behavior. Fatiga con tercios, el método vigente de 7.6 (D-054 pendiente)
 *   - Negativas con negationSignal y la marca de probable mala lectura de cada respuesta
 *   - Tarea, casos seriados y viñetas largas con exactitud por grupo e intervalo de Wilson
 *   - Sesgos con analyzeBias en error_share (D-051) contra una línea base de azar, la parte de
 *     errores que irían a cada etiqueta si eligiera al azar entre los distractores visibles. Es
 *     honesta sin población real y se calcula con sus propios datos
 *   - Retención, sanguijuelas, constancia y causas reportadas
 * Umbrales. Todos (J) y en INSIGHT_MINIMUMS.
 */
import type { Thresholds } from '@/config/thresholds';
import { wilsonInterval } from './stats/wilson';
import {
  calibrationReport,
  fatigueSignal,
  hourBand,
  negationSignal,
  personalPace,
  responseSignals,
  summarizeChanges,
  type Confidence,
  type ResponseRecord,
} from './behavior';
import { analyzeBias, type BiasExposure } from './bias';

/** Segundos por reactivo en el ENARM, 6 horas para 280 */
export const ENARM_SECONDS_PER_ITEM = 77;

export const INSIGHT_MINIMUMS = {
  answers: 20,
  perGroup: 10,
  changes: 10,
  reviews: 50,
  causes: 8,
  studyWindowDays: 28,
  daysSinceStart: 7,
  longVignetteWords: 110,
} as const;

export interface AnswerFact extends ResponseRecord {
  localHour: number;
  polarity: 'affirmative' | 'negative';
  task: string | null;
  /** Orden dentro de un caso seriado. null si no es seriado */
  caseOrder: number | null;
  branch: string;
  topic: string;
  visibleTags: readonly string[];
  chosenTag: string | null;
  /** El motor structure la marcó como probable mala lectura */
  misread: boolean;
}

export interface ReviewFact {
  rating: 'again' | 'hard' | 'good' | 'easy';
  /** Estado de la tarjeta antes del repaso. null si era nueva */
  stateBefore: 'new' | 'learning' | 'review' | 'relearning' | null;
  lapsesAfter: number;
  cardId: string;
}

export interface InsightInput {
  answers: readonly AnswerFact[];
  reviews: readonly ReviewFact[];
  /** Minutos activos de cada sesión terminada */
  sessionMinutes: readonly number[];
  causes: readonly string[];
  /** Días de estudio AAAA-MM-DD con actividad */
  studyDays: readonly string[];
  today: string;
  /** Días desde que empezó el alumno */
  daysSinceStart: number;
  desiredRetention: number;
  thresholds: Pick<Thresholds, 'behavior' | 'bias' | 'structure'>;
}

export type InsightArea = 'exam' | 'traps' | 'study';
export type InsightLevel = 'strength' | 'watch' | 'focus';
export type CalibrationUnit =
  'answers' | 'sessions' | 'tagged_errors' | 'reviews' | 'days' | 'changes' | 'causes';

export type InsightState =
  | { kind: 'calibrating'; have: number; need: number; unit: CalibrationUnit }
  | {
      kind: 'ready';
      level: InsightLevel;
      /** Números para la frase de la interfaz */
      values: Record<string, number>;
      /** Claves de texto para la frase, por ejemplo la tarea más débil */
      refs: Record<string, string>;
    };

export interface Insight {
  id: string;
  area: InsightArea;
  state: InsightState;
  /** Qué tanto pesa para ordenar los focos. Mayor es más importante */
  weight: number;
}

export interface InsightReport {
  insights: Insight[];
  strengths: Insight[];
  focus: Insight[];
  totals: { answers: number; reviews: number; taggedErrors: number; sessions: number };
}

const calibrating = (have: number, need: number, unit: CalibrationUnit): InsightState => ({
  kind: 'calibrating',
  have,
  need,
  unit,
});
const ready = (
  level: InsightLevel,
  values: Record<string, number> = {},
  refs: Record<string, string> = {},
): InsightState => ({ kind: 'ready', level, values, refs });

const accuracy = (list: readonly { correct: boolean }[]) =>
  list.length === 0 ? 0 : list.filter((item) => item.correct).length / list.length;
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length === 0
    ? 0
    : sorted.length % 2
      ? (sorted[middle] as number)
      : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
};

/** Compara la exactitud de un grupo con la del resto. Foco si su intervalo queda debajo */
function groupGap(
  group: readonly { correct: boolean }[],
  rest: readonly { correct: boolean }[],
): { level: InsightLevel; groupAccuracy: number; restAccuracy: number } {
  const g = wilsonInterval(group.filter((item) => item.correct).length, group.length);
  const r = wilsonInterval(rest.filter((item) => item.correct).length, rest.length);
  const level: InsightLevel =
    g.upper < r.estimate ? 'focus' : g.lower > r.estimate ? 'strength' : 'watch';
  return { level, groupAccuracy: g.estimate, restAccuracy: r.estimate };
}

/** Línea base de azar por etiqueta para error_share, con los distractores que vio al fallar */
export function chanceBaseline(exposures: readonly BiasExposure[]): Record<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const exposure of exposures) {
    if (exposure.chosenTag === null || exposure.visibleTags.length === 0) continue;
    for (const tag of new Set(exposure.visibleTags)) {
      const share =
        exposure.visibleTags.filter((visible) => visible === tag).length /
        exposure.visibleTags.length;
      const entry = sums.get(tag) ?? { sum: 0, n: 0 };
      entry.sum += share;
      entry.n += 1;
      sums.set(tag, entry);
    }
  }
  const baseline: Record<string, number> = {};
  for (const [tag, { sum, n }] of sums) baseline[tag] = sum / n;
  return baseline;
}

function examInsights(input: InsightInput): Insight[] {
  const { answers, thresholds } = input;
  const min = INSIGHT_MINIMUMS;
  const out: Insight[] = [];
  const enough = answers.length >= min.answers;

  // Ritmo
  const seconds = median(answers.map((answer) => answer.msToAnswer / 1000));
  out.push({
    id: 'pace',
    area: 'exam',
    weight: 3,
    state: enough
      ? ready(
          seconds > ENARM_SECONDS_PER_ITEM * 1.25
            ? 'focus'
            : seconds > ENARM_SECONDS_PER_ITEM
              ? 'watch'
              : 'strength',
          { seconds: Math.round(seconds), target: ENARM_SECONDS_PER_ITEM },
        )
      : calibrating(answers.length, min.answers, 'answers'),
  });

  // Adivinanza rápida. Respuestas más rápidas que el ritmo de lectura plausible, que no dependen
  // del percentil personal (ese siempre deja cerca del 10% debajo por construcción)
  const pace = personalPace(answers, thresholds.behavior);
  const signals = answers.map((answer) => responseSignals(answer, pace, thresholds.behavior));
  const rapid = answers.filter(
    (answer, index) => answer.msToAnswer < (signals[index]?.minReadingMs ?? 0),
  );
  const rapidShare = answers.length === 0 ? 0 : rapid.length / answers.length;
  out.push({
    id: 'rapid_guess',
    area: 'exam',
    weight: 4,
    state: enough
      ? ready(
          rapidShare > 0.05 && accuracy(rapid) < accuracy(answers)
            ? 'focus'
            : rapidShare > 0.02
              ? 'watch'
              : 'strength',
          { share: rapidShare, accuracy: accuracy(rapid), count: rapid.length },
        )
      : calibrating(answers.length, min.answers, 'answers'),
  });
  // Tiempo atascado. Más de 2 desviaciones sobre su ritmo personal
  const stuck = answers.filter((_, index) => (signals[index]?.timeZ ?? 0) > 2);
  const stuckShare = answers.length === 0 ? 0 : stuck.length / answers.length;
  out.push({
    id: 'stuck',
    area: 'exam',
    weight: 2,
    state: pace.ready
      ? ready(
          stuckShare > 0.08 && accuracy(stuck) < 0.5
            ? 'focus'
            : stuckShare > 0.03
              ? 'watch'
              : 'strength',
          { count: stuck.length, share: stuckShare, accuracy: accuracy(stuck) },
        )
      : calibrating(answers.length, min.answers, 'answers'),
  });

  // Negativas y mala lectura
  const negation = negationSignal(answers, thresholds.structure.minResponsesPerCategory);
  const negatives = answers.filter((answer) => answer.polarity === 'negative');
  const misreads = answers.filter((answer) => answer.misread).length;
  out.push({
    id: 'negation',
    area: 'exam',
    weight: 5,
    state:
      negation.misreads === null
        ? calibrating(
            Math.min(negation.negative, negation.affirmative),
            thresholds.structure.minResponsesPerCategory,
            'answers',
          )
        : ready(negation.misreads ? 'focus' : negation.difference >= 0 ? 'strength' : 'watch', {
            negativeAccuracy: accuracy(negatives),
            affirmativeAccuracy: accuracy(answers.filter((a) => a.polarity === 'affirmative')),
            misreads,
          }),
  });

  // Tipo de tarea. La más débil contra el resto
  const byTask = new Map<string, AnswerFact[]>();
  for (const answer of answers)
    if (answer.task) byTask.set(answer.task, [...(byTask.get(answer.task) ?? []), answer]);
  const tasks = [...byTask.entries()].filter(([, list]) => list.length >= min.perGroup);
  if (tasks.length >= 2) {
    const [weakTask, weakList] = tasks.reduce((worst, current) =>
      accuracy(current[1]) < accuracy(worst[1]) ? current : worst,
    );
    const gap = groupGap(
      weakList,
      answers.filter((answer) => answer.task !== weakTask),
    );
    out.push({
      id: 'task',
      area: 'exam',
      weight: 4,
      state: ready(
        gap.level === 'strength' ? 'watch' : gap.level,
        {
          accuracy: gap.groupAccuracy,
          rest: gap.restAccuracy,
          n: weakList.length,
        },
        { task: weakTask },
      ),
    });
  } else {
    out.push({
      id: 'task',
      area: 'exam',
      weight: 4,
      state: calibrating(answers.length, Math.max(answers.length + 1, min.perGroup * 2), 'answers'),
    });
  }

  // Casos seriados. Segunda y tercera pregunta contra la primera
  const later = answers.filter((answer) => (answer.caseOrder ?? 0) >= 2);
  const first = answers.filter((answer) => answer.caseOrder === 1);
  out.push({
    id: 'serial',
    area: 'exam',
    weight: 3,
    state:
      later.length >= min.perGroup && first.length >= min.perGroup
        ? ready(groupGap(later, first).level, {
            later: accuracy(later),
            first: accuracy(first),
          })
        : calibrating(Math.min(later.length, first.length), min.perGroup, 'answers'),
  });

  // Viñetas largas contra cortas
  const long = answers.filter((answer) => answer.words >= min.longVignetteWords);
  const short = answers.filter((answer) => answer.words < min.longVignetteWords);
  out.push({
    id: 'long_vignettes',
    area: 'exam',
    weight: 3,
    state:
      long.length >= min.perGroup && short.length >= min.perGroup
        ? ready(groupGap(long, short).level, { long: accuracy(long), short: accuracy(short) })
        : calibrating(Math.min(long.length, short.length), min.perGroup, 'answers'),
  });

  // Cambios de respuesta con su saldo
  const changes = summarizeChanges(answers);
  out.push({
    id: 'changes',
    area: 'exam',
    weight: 4,
    state:
      changes.total >= min.changes
        ? ready(
            changes.correctToIncorrect > changes.incorrectToCorrect
              ? 'focus'
              : changes.incorrectToCorrect >= 2 * Math.max(1, changes.correctToIncorrect)
                ? 'strength'
                : 'watch',
            {
              total: changes.total,
              toCorrect: changes.incorrectToCorrect,
              toIncorrect: changes.correctToIncorrect,
            },
          )
        : calibrating(changes.total, min.changes, 'changes'),
  });

  // Confianza
  const calibration = calibrationReport(answers);
  out.push({
    id: 'confidence',
    area: 'exam',
    weight: 4,
    state: calibration.ready
      ? ready(
          calibration.label === 'overconfident'
            ? 'focus'
            : calibration.label === 'calibrated'
              ? 'strength'
              : 'watch',
          {
            sure: calibration.levels.sure.estimate,
            unsure: calibration.levels.unsure.estimate,
            guessed: calibration.levels.guessed.estimate,
            sureErrors: calibration.sureErrors,
          },
          { label: calibration.label ?? 'calibrated' },
        )
      : calibrating(
          calibration.responses,
          calibration.responses + calibration.responsesNeeded,
          'answers',
        ),
  });

  // Fatiga en sesiones largas
  const fatigue = fatigueSignal(answers, thresholds.behavior);
  out.push({
    id: 'fatigue',
    area: 'exam',
    weight: 4,
    state:
      fatigue.fatigued === null
        ? calibrating(fatigue.sessions, fatigue.sessions + fatigue.sessionsNeeded, 'sessions')
        : ready(fatigue.fatigued ? 'focus' : 'strength', {
            drop: fatigue.accuracyDrop,
            sessions: fatigue.sessions,
          }),
  });

  // Mejor horario
  const bands = new Map<string, AnswerFact[]>();
  for (const answer of answers) {
    const band = hourBand(answer.localHour);
    bands.set(band, [...(bands.get(band) ?? []), answer]);
  }
  const usable = [...bands.entries()].filter(([, list]) => list.length >= min.perGroup);
  if (usable.length >= 2) {
    const best = usable.reduce((top, current) =>
      accuracy(current[1]) > accuracy(top[1]) ? current : top,
    );
    const worst = usable.reduce((low, current) =>
      accuracy(current[1]) < accuracy(low[1]) ? current : low,
    );
    out.push({
      id: 'best_hour',
      area: 'exam',
      weight: 1,
      state: ready(
        'watch',
        { best: accuracy(best[1]), worst: accuracy(worst[1]) },
        { best: best[0], worst: worst[0] },
      ),
    });
  } else {
    out.push({
      id: 'best_hour',
      area: 'exam',
      weight: 1,
      state: calibrating(usable.length, 2, 'answers'),
    });
  }
  return out;
}

function trapInsights(input: InsightInput): { insights: Insight[]; taggedErrors: number } {
  const exposures: BiasExposure[] = input.answers.map((answer) => ({
    visibleTags: answer.visibleTags,
    chosenTag: answer.correct ? null : answer.chosenTag,
  }));
  const analysis = analyzeBias({
    exposures,
    baseline: { attraction: chanceBaseline(exposures), method: 'error_share', source: 'chance' },
    thresholds: input.thresholds.bias,
  });
  const out: Insight[] = [];
  if (analysis.taggedErrors < input.thresholds.bias.minTaggedErrors) {
    out.push({
      id: 'biases',
      area: 'traps',
      weight: 5,
      state: calibrating(
        analysis.taggedErrors,
        input.thresholds.bias.minTaggedErrors,
        'tagged_errors',
      ),
    });
    return { insights: out, taggedErrors: analysis.taggedErrors };
  }
  for (const tag of analysis.patterns) {
    const entry = analysis.tags.find((item) => item.tag === tag);
    if (!entry) continue;
    out.push({
      id: `bias:${tag}`,
      area: 'traps',
      weight: 5 + (entry.lower - (entry.baseline ?? 0)) * 10,
      state: ready(
        'focus',
        { attraction: entry.attraction, baseline: entry.baseline ?? 0, choices: entry.choices },
        { tag },
      ),
    });
  }
  if (analysis.patterns.length === 0) {
    out.push({
      id: 'biases',
      area: 'traps',
      weight: 1,
      state: ready('strength', { tagged: analysis.taggedErrors }),
    });
  }
  // Las tres etiquetas que más le atraen, aunque no lleguen a patrón, para que vea su perfil
  const top = [...analysis.tags]
    .filter((item) => item.baseline !== null && item.choices > 0)
    .sort((a, b) => b.attraction - (b.baseline ?? 0) - (a.attraction - (a.baseline ?? 0)))
    .slice(0, 3);
  out.push({
    id: 'bias_profile',
    area: 'traps',
    weight: 0,
    state: ready(
      'watch',
      Object.fromEntries(top.map((item, index) => [`share${index}`, item.attraction])),
      Object.fromEntries(top.map((item, index) => [`tag${index}`, item.tag])),
    ),
  });
  return { insights: out, taggedErrors: analysis.taggedErrors };
}

function studyInsights(input: InsightInput): Insight[] {
  const min = INSIGHT_MINIMUMS;
  const out: Insight[] = [];

  // Constancia en las últimas 4 semanas
  const windowStart = shiftDay(input.today, -(min.studyWindowDays - 1));
  const days = new Set(input.studyDays.filter((day) => day >= windowStart && day <= input.today));
  const window = Math.min(min.studyWindowDays, Math.max(1, input.daysSinceStart + 1));
  out.push({
    id: 'consistency',
    area: 'study',
    weight: 3,
    state:
      input.daysSinceStart >= min.daysSinceStart
        ? ready(
            days.size / window >= 0.7 ? 'strength' : days.size / window >= 0.4 ? 'watch' : 'focus',
            {
              days: days.size,
              window,
            },
          )
        : calibrating(input.daysSinceStart, min.daysSinceStart, 'days'),
  });

  // Retención real de tarjetas maduras contra la deseada
  const mature = input.reviews.filter((review) => review.stateBefore === 'review');
  const retained = mature.filter((review) => review.rating !== 'again').length;
  const retention = mature.length === 0 ? 0 : retained / mature.length;
  out.push({
    id: 'retention',
    area: 'study',
    weight: 4,
    state:
      mature.length >= min.reviews
        ? ready(
            retention < input.desiredRetention - 0.07
              ? 'focus'
              : retention < input.desiredRetention - 0.02
                ? 'watch'
                : 'strength',
            { retention, desired: input.desiredRetention, reviews: mature.length },
          )
        : calibrating(mature.length, min.reviews, 'reviews'),
  });

  // Sanguijuelas. Tarjetas que se olvidan una y otra vez
  const lapses = new Map<string, number>();
  for (const review of input.reviews) lapses.set(review.cardId, review.lapsesAfter);
  const leeches = [...lapses.values()].filter((value) => value >= 8).length;
  const hardCards = [...lapses.values()].filter((value) => value >= 4).length;
  out.push({
    id: 'leeches',
    area: 'study',
    weight: 3,
    state:
      input.reviews.length >= min.reviews
        ? ready(leeches > 0 ? 'focus' : hardCards > 0 ? 'watch' : 'strength', {
            leeches,
            hardCards,
          })
        : calibrating(input.reviews.length, min.reviews, 'reviews'),
  });

  // Duración de las sesiones
  const sessions = input.sessionMinutes.filter((minutes) => minutes > 0);
  const typical = median(sessions);
  out.push({
    id: 'session_length',
    area: 'study',
    weight: 2,
    state:
      sessions.length >= 5
        ? ready(typical > 90 ? 'watch' : typical < 10 ? 'watch' : 'strength', {
            minutes: Math.round(typical),
            sessions: sessions.length,
          })
        : calibrating(sessions.length, 5, 'sessions'),
  });

  // Causas que reporta al fallar
  const causeCounts = new Map<string, number>();
  for (const cause of input.causes) causeCounts.set(cause, (causeCounts.get(cause) ?? 0) + 1);
  const topCause = [...causeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  out.push({
    id: 'causes',
    area: 'study',
    weight: 2,
    state:
      input.causes.length >= min.causes && topCause
        ? ready(
            topCause[0] === 'not_studied' || topCause[0] === 'forgot' ? 'focus' : 'watch',
            { share: topCause[1] / input.causes.length, total: input.causes.length },
            { cause: topCause[0] },
          )
        : calibrating(input.causes.length, min.causes, 'causes'),
  });
  return out;
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function buildInsights(input: InsightInput): InsightReport {
  const traps = trapInsights(input);
  const insights = [...examInsights(input), ...traps.insights, ...studyInsights(input)];
  const readyOnes = insights.filter((insight) => insight.state.kind === 'ready');
  const levelOf = (insight: Insight) =>
    insight.state.kind === 'ready' ? insight.state.level : null;
  return {
    insights,
    strengths: readyOnes
      .filter((insight) => levelOf(insight) === 'strength')
      .sort((a, b) => b.weight - a.weight),
    focus: readyOnes
      .filter((insight) => levelOf(insight) === 'focus')
      .sort((a, b) => b.weight - a.weight),
    totals: {
      answers: input.answers.length,
      reviews: input.reviews.length,
      taggedErrors: traps.taggedErrors,
      sessions: input.sessionMinutes.length,
    },
  };
}

export type { Confidence };
