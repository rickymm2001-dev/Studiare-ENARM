/**
 * Repetición espaciada con FSRS (7.1).
 *
 * Qué hace. Programa cada tarjeta con ts-fsrs, arma la cola del día con límites y sin hermanas,
 * marca sanguijuelas, aplica el modo examen y proyecta la carga futura.
 * Entradas. Estado FSRS de la tarjeta (o null si es nueva), calificación, el momento actual y la
 * configuración del alumno (retención deseada, fecha del ENARM, zona horaria y umbrales).
 * Salidas. Estado nuevo, si quedó recortado por el ENARM, la cola del día y la carga por día.
 * Método
 *   - ts-fsrs 5 con parámetros por defecto y sin fuzz, para que todo sea reproducible
 *   - Modo examen. Ningún vencimiento cae después del inicio del día del ENARM (4 a. m. locales).
 *     En los últimos 30 días la retención deseada sube a 0.93 si el alumno tenía menos
 *   - Hermanas. Las tarjetas de una misma nota no salen el mismo día. Se entierran
 *   - Sanguijuela con 8 lapsos, como Anki
 *   - La cola ordena los repasos vencidos por retrievability de menor a mayor y respeta los
 *     límites diarios de nuevas y de repasos
 *   - Carga futura. Simula cada tarjeta suponiendo que el alumno califica Bien en cada vencimiento
 *     y que introduce las nuevas al ritmo de su límite diario
 *   - Intervalo máximo del alumno sobre Bien con compresión suave, 21 días por defecto. Difícil y
 *     Fácil guardan su proporción con Bien y cada botón tiene su multiplicador (D-064, D-067)
 *   - Días fáciles (D-085). Después del tope y del multiplicador y antes del recorte al ENARM, el
 *     vencimiento de intervalos de 3 días o más se mueve unos días para esquivar los días que el
 *     alumno marcó como reduced o minimum. Las reglas viven en easyDays.ts. Solo cambia la fecha,
 *     la estabilidad y la dificultad de FSRS no se tocan. Ausente o todo normal no cambia nada
 * Umbrales. Retención 0.90 (0.80 a 0.97), 0.93 en los últimos 30 días, sanguijuela con 8 lapsos,
 * 20 nuevas y 200 repasos por día. Optimizar parámetros por alumno desde 1,000 repasos queda fuera
 * del prototipo. El punto de extensión es config.weights.
 */
import { createEmptyCard, fsrs, Rating, State, type Card, type FSRS, type Grade } from 'ts-fsrs';
import type { Thresholds } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import { applyEasyDays, hasEasyDays, type EasyDays } from './easyDays';
import type { FsrsRating } from './mcqGrade';
import { addDays, DAY_MS, daysBetween, studyDayEnd, studyDayOf, studyDayStart } from './studyDay';

export type { FsrsRating } from './mcqGrade';

export const FSRS_RATINGS: readonly FsrsRating[] = ['again', 'hard', 'good', 'easy'];

export interface SchedulerConfig {
  /** Retención deseada del alumno, 0.80 a 0.97 */
  desiredRetention: number;
  /** Fecha del ENARM AAAA-MM-DD o null si no la ha puesto */
  examDate: string | null;
  timeZone: string;
  thresholds: Thresholds['fsrs'];
  /** Pesos optimizados por alumno. Punto de extensión desde 1,000 repasos, fuera del prototipo */
  weights?: readonly number[];
  /**
   * Intervalo máximo en días que elige el alumno, con compresión suave (D-064). null o ausente es
   * sin tope, como FSRS puro
   */
  maxIntervalDays?: number | null;
  /**
   * Qué tan lejos sale la tarjeta con cada botón, como fracción de lo que calcula FSRS (D-067).
   * 1 es lo recomendado. Ausente es 1 en los tres
   */
  spacing?: Readonly<Record<'hard' | 'good' | 'easy', number>>;
  /**
   * Nivel de cada día de la semana, normal, reduced o minimum (D-085, fila 7). El vencimiento de
   * los intervalos de 3 días o más se mueve unos días para esquivar los días fáciles. Ausente o
   * todo normal no cambia nada
   */
  easyDays?: EasyDays;
}

/**
 * Comprime un intervalo en días hacia el tope sin pasarlo y sin que los botones se empalmen.
 * d' = tope × (1 − e^(−d / tope)). Casi igual para intervalos cortos, nunca llega al tope y
 * conserva el orden entre Difícil, Bien y Fácil
 */
export function softCapDays(days: number, cap: number): number {
  if (!(cap > 0) || days <= 0) return days;
  return cap * (1 - Math.exp(-days / cap));
}

const GRADE: Record<FsrsRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_TO_FSRS: Record<FsrsCardState['state'], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_FROM_FSRS: Record<State, FsrsCardState['state']> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

export function toFsrsCard(state: FsrsCardState): Card {
  const lastReview = state.lastReview === null ? undefined : new Date(state.lastReview);
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    // Campo obsoleto en ts-fsrs 5. El algoritmo calcula los días transcurridos con last_review
    elapsed_days: 0,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: STATE_TO_FSRS[state.state],
    ...(lastReview ? { last_review: lastReview } : {}),
  };
}

export function fromFsrsCard(card: Card): FsrsCardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_FROM_FSRS[card.state],
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  };
}

/** Estado de una tarjeta que nunca se ha repasado */
export function newCardState(now: Date): FsrsCardState {
  return fromFsrsCard(createEmptyCard(now));
}

const schedulers = new Map<string, FSRS>();

function schedulerFor(retention: number, weights?: readonly number[]): FSRS {
  const key = `${retention}|${weights?.join(',') ?? ''}`;
  let scheduler = schedulers.get(key);
  if (!scheduler) {
    scheduler = fsrs({
      request_retention: retention,
      enable_fuzz: false,
      enable_short_term: true,
      ...(weights ? { w: [...weights] } : {}),
    });
    schedulers.set(key, scheduler);
  }
  return scheduler;
}

/** Inicio del día del ENARM. Ningún vencimiento puede pasar de aquí */
export function examDeadline(config: Pick<SchedulerConfig, 'examDate' | 'timeZone'>): Date | null {
  return config.examDate === null ? null : studyDayStart(config.examDate, config.timeZone);
}

export interface RetentionInfo {
  retention: number;
  /** El alumno está en los últimos 30 días antes del ENARM */
  examWindow: boolean;
  /** Días de estudio que faltan para el ENARM. null sin fecha */
  daysToExam: number | null;
}

export function retentionFor(config: SchedulerConfig, now: Date): RetentionInfo {
  if (config.examDate === null) {
    return { retention: config.desiredRetention, examWindow: false, daysToExam: null };
  }
  const daysToExam = daysBetween(studyDayOf(now, config.timeZone), config.examDate);
  const examWindow = daysToExam >= 0 && daysToExam <= config.thresholds.examWindowDays;
  return {
    retention: examWindow
      ? Math.max(config.desiredRetention, config.thresholds.examRetention)
      : config.desiredRetention,
    examWindow,
    daysToExam,
  };
}

export interface ReviewOutcome {
  state: FsrsCardState;
  retention: number;
  examWindow: boolean;
  /** El vencimiento se adelantó para no pasar del ENARM */
  examCapped: boolean;
}

/**
 * Si el reloj del dispositivo quedó antes del último repaso (por ejemplo porque el alumno cambió
 * la hora), se programa desde el último repaso. ts-fsrs no acepta tiempo negativo
 */
function notBeforeLastReview(state: FsrsCardState | null, now: Date): Date {
  if (state?.lastReview && new Date(state.lastReview).getTime() > now.getTime()) {
    return new Date(state.lastReview);
  }
  return now;
}

/**
 * Semilla de los días fáciles. Sale del estado nuevo de FSRS y de la calificación, nunca de la hora
 * exacta de now. Así la vista previa de los botones, que se calcula al abrir la tarjeta, y el
 * repaso real, que se calcula segundos o minutos después, dan el mismo resultado. Los decimales se
 * fijan en 6 para que el ruido de coma flotante no cambie la semilla
 */
function easyDaysSeed(state: FsrsCardState, rating: FsrsRating): string {
  return [
    state.stability.toFixed(6),
    state.difficulty.toFixed(6),
    state.reps,
    state.lapses,
    rating,
  ].join('|');
}

export function scheduleReview(
  state: FsrsCardState | null,
  rating: FsrsRating,
  requestedNow: Date,
  config: SchedulerConfig,
): ReviewOutcome {
  const now = notBeforeLastReview(state, requestedNow);
  const { retention, examWindow } = retentionFor(config, now);
  const card = state ? toFsrsCard(state) : createEmptyCard(now);
  const result = schedulerFor(retention, config.weights).next(card, now, GRADE[rating]);
  let next = fromFsrsCard(result.card);
  // Tope y separación del alumno (D-064, D-067). Solo a intervalos de días, los pasos cortos de
  // aprendizaje no cambian. El tope se aplica a Bien con compresión suave y Difícil y Fácil se
  // escalan en la misma proporción, así los botones no se empalman. Luego cada botón aplica su
  // multiplicador
  const cap = config.maxIntervalDays ?? null;
  const multiplier = rating === 'again' ? 1 : (config.spacing?.[rating] ?? 1);
  const rawDays = (new Date(next.due).getTime() - now.getTime()) / DAY_MS;
  if (rating !== 'again' && rawDays >= 1 && (cap !== null || multiplier !== 1)) {
    const goodDays =
      rating === 'good'
        ? rawDays
        : (schedulerFor(retention, config.weights).next(card, now, Rating.Good).card.due.getTime() -
            now.getTime()) /
          DAY_MS;
    const scale = cap !== null && goodDays >= 1 ? softCapDays(goodDays, cap) / goodDays : 1;
    const days = Math.max(1, Math.round(rawDays * scale * multiplier));
    if (days !== Math.round(rawDays)) {
      next = {
        ...next,
        due: new Date(now.getTime() + days * DAY_MS).toISOString(),
        scheduledDays: days,
      };
    }
  }
  const deadline = examDeadline(config);
  const upcomingDeadline = deadline && deadline.getTime() > now.getTime() ? deadline : null;
  // Días fáciles (D-085). Solo mueve la fecha de vencimiento, nunca la estabilidad ni la dificultad.
  // Va después del tope y del multiplicador y antes del recorte al ENARM, que sigue mandando
  if (rating !== 'again' && next.state === 'review' && hasEasyDays(config.easyDays)) {
    const due = new Date(next.due);
    const moved = applyEasyDays({
      due,
      now,
      timeZone: config.timeZone,
      easyDays: config.easyDays,
      seed: easyDaysSeed(next, rating),
      deadline: upcomingDeadline,
    });
    if (moved.getTime() !== due.getTime()) {
      next = {
        ...next,
        due: moved.toISOString(),
        scheduledDays: Math.max(1, Math.round((moved.getTime() - now.getTime()) / DAY_MS)),
      };
    }
  }
  let examCapped = false;
  if (deadline && deadline.getTime() > now.getTime() && new Date(next.due) > deadline) {
    next = {
      ...next,
      due: deadline.toISOString(),
      scheduledDays: Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / DAY_MS)),
    };
    examCapped = true;
  }
  return { state: next, retention, examWindow, examCapped };
}

/** Lo que pasaría con cada botón, para mostrar el intervalo en cada uno */
export function previewReview(
  state: FsrsCardState | null,
  now: Date,
  config: SchedulerConfig,
): Record<FsrsRating, ReviewOutcome> {
  return {
    again: scheduleReview(state, 'again', now, config),
    hard: scheduleReview(state, 'hard', now, config),
    good: scheduleReview(state, 'good', now, config),
    easy: scheduleReview(state, 'easy', now, config),
  };
}

/** Probabilidad de recordar la tarjeta ahora. 0 en tarjetas nuevas */
export function retrievabilityOf(state: FsrsCardState | null, now: Date): number {
  if (!state || state.state === 'new') return 0;
  return schedulerFor(0.9).get_retrievability(
    toFsrsCard(state),
    notBeforeLastReview(state, now),
    false,
  );
}

export function isLeech(state: FsrsCardState | null, thresholds: Thresholds['fsrs']): boolean {
  return state !== null && state.lapses >= thresholds.leechLapses;
}

export interface QueueCard {
  cardId: string;
  noteId: string;
  /** null si la tarjeta nunca se ha visto */
  state: FsrsCardState | null;
}

export interface ReviewedToday {
  newCount: number;
  reviewCount: number;
  /** Notas que ya tuvieron una tarjeta repasada hoy */
  noteIds: readonly string[];
}

export interface DailyQueue {
  reviews: QueueCard[];
  newCards: QueueCard[];
  /** Tarjetas que se quedan para otro día porque una hermana ya salió hoy */
  buriedSiblings: string[];
  /** Vencidas que no entraron por el límite diario */
  reviewsOverLimit: number;
  newOverLimit: number;
}

export function buildDailyQueue(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  reviewedToday: ReviewedToday;
}): DailyQueue {
  const { now, config } = input;
  const today = studyDayOf(now, config.timeZone);
  const dueBy = studyDayEnd(today, config.timeZone).getTime();
  const usedNotes = new Set(input.reviewedToday.noteIds);
  const buriedSiblings: string[] = [];

  const isNew = (card: QueueCard) => card.state === null || card.state.state === 'new';
  const due = input.cards
    .filter((card) => !isNew(card) && new Date((card.state as FsrsCardState).due).getTime() < dueBy)
    .map((card) => ({ card, r: retrievabilityOf(card.state, now) }))
    .sort((a, b) => a.r - b.r || a.card.cardId.localeCompare(b.card.cardId))
    .map(({ card }) => card);

  const takeWithoutSiblings = (candidates: readonly QueueCard[], limit: number) => {
    const taken: QueueCard[] = [];
    let overLimit = 0;
    for (const card of candidates) {
      if (usedNotes.has(card.noteId)) {
        buriedSiblings.push(card.cardId);
      } else if (taken.length >= limit) {
        overLimit += 1;
      } else {
        taken.push(card);
        usedNotes.add(card.noteId);
      }
    }
    return { taken, overLimit };
  };

  const reviewLimit = Math.max(
    0,
    config.thresholds.reviewsPerDay - input.reviewedToday.reviewCount,
  );
  const newLimit = Math.max(0, config.thresholds.newCardsPerDay - input.reviewedToday.newCount);
  const reviews = takeWithoutSiblings(due, reviewLimit);
  const newCards = takeWithoutSiblings(input.cards.filter(isNew), newLimit);
  return {
    reviews: reviews.taken,
    newCards: newCards.taken,
    buriedSiblings,
    reviewsOverLimit: reviews.overLimit,
    newOverLimit: newCards.overLimit,
  };
}

export interface DayLoad {
  day: string;
  reviews: number;
  newCards: number;
}

/**
 * Carga futura de los próximos días (7.1). Supone que el alumno repasa cada tarjeta en su
 * vencimiento con Bien y que introduce nuevas al ritmo de su límite diario
 */
export function projectLoad(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  days: number;
}): DayLoad[] {
  const { now, config, days } = input;
  const today = studyDayOf(now, config.timeZone);
  const horizon = studyDayEnd(addDays(today, days - 1), config.timeZone).getTime();
  const load = new Map<string, DayLoad>();
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDays(today, offset);
    load.set(day, { day, reviews: 0, newCards: 0 });
  }
  const bump = (instant: Date, field: 'reviews' | 'newCards') => {
    const entry = load.get(studyDayOf(instant, config.timeZone));
    if (entry) entry[field] += 1;
  };
  const simulate = (start: FsrsCardState, from: Date) => {
    let state = start;
    // Tope de seguridad. Una tarjeta no se repasa más de 200 veces en el horizonte
    for (let step = 0; step < 200; step += 1) {
      const dueAt = new Date(Math.max(new Date(state.due).getTime(), from.getTime()));
      if (dueAt.getTime() >= horizon) return;
      bump(dueAt, 'reviews');
      state = scheduleReview(state, 'good', dueAt, config).state;
    }
  };

  for (const card of input.cards) {
    if (card.state !== null && card.state.state !== 'new') simulate(card.state, now);
  }

  const unseen = input.cards.filter((card) => card.state === null || card.state.state === 'new');
  const perDay = config.thresholds.newCardsPerDay;
  unseen.forEach((_, index) => {
    const offset = perDay === 0 ? days : Math.floor(index / perDay);
    if (offset >= days) return;
    const day = addDays(today, offset);
    // Se introduce una hora después de empezar su día de estudio, o ahora si es hoy
    const introduced = new Date(
      Math.max(studyDayStart(day, config.timeZone).getTime() + 60 * 60 * 1000, now.getTime()),
    );
    bump(introduced, 'newCards');
    simulate(scheduleReview(null, 'good', introduced, config).state, introduced);
  });

  return [...load.values()];
}
