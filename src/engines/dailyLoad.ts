/**
 * Carga diaria y tarjetas nuevas por día (Fase C2, D-085 fila 6).
 *
 * Qué hace. Estima cuánto tarda el alumno en cada tarjeta y, con eso, calcula cuántas tarjetas
 * nuevas por día aguanta según su carga de repasos proyectada y los minutos que dice estudiar. La
 * guía de Anki pide 9999 nuevas al día, que para muchos alumnos sería una avalancha, así que aquí
 * el número sale de la carga real de cada quien.
 * Entradas. Muestras de tiempo de repaso (segundos hasta ver la respuesta y hasta calificar), las
 * tarjetas con su estado FSRS, la configuración del alumno y sus minutos diarios de estudio.
 * Salidas. El tiempo estimado por repaso y por tarjeta nueva, y una sugerencia de nuevas por día
 * con el presupuesto, el día más pesado y si el atraso ya rebasa el presupuesto.
 * Método
 *   - Tiempo por tarjeta. Cada muestra vale el tiempo hasta ver la respuesta más el tiempo hasta
 *     calificar, recortado a un tope. Se usa la mediana, que no se distorsiona por una pausa larga
 *     (alguien que dejó la tarjeta abierta y se fue por un café)
 *   - Con pocos repasos medidos se usa un tiempo de referencia y la sugerencia sale marcada como
 *     no medida. La interfaz debe decir que es una estimación de referencia. Aquí solo se devuelve
 *     measured
 *   - Presupuesto. Los minutos diarios por la fracción que el alumno dedica a tarjetas (el resto es
 *     para preguntas y simuladores)
 *   - Carga de un candidato N. Es la proyección de projectLoad con N nuevas por día y, en cada día
 *     de la proyección, el tiempo es (repasos × segundos por repaso + nuevas × segundos por nueva)
 *     / 60. La carga de N es el día más pesado del horizonte, no el promedio, porque lo que satura
 *     al alumno es el pico
 *   - Cómo se calcula esa proyección sin simular miles de veces lo mismo. projectLoad con 4,000
 *     nuevas simula una por una tarjetas que son idénticas y que solo difieren en el día en que
 *     entran. Con cada candidato eso cuesta más de 200 ms y la búsqueda necesita unos 9. Así que
 *     se llama a projectLoad una vez con las tarjetas que ya tienen historial (no dependen de N) y
 *     una vez por cada día de entrada con una sola tarjeta nueva que entra ese día (no dependen de
 *     N tampoco). La carga de N es la primera más, para cada día de entrada, las tarjetas que
 *     entran ese día (las N que siguen en la fila, igual que las reparte projectLoad) por la
 *     segunda. Da exactamente lo mismo que projectLoad con todas las tarjetas, y las pruebas lo
 *     comparan contra esa llamada directa
 *   - Búsqueda. Búsqueda binaria del mayor N entre 0 y maxNew cuya carga cabe en el presupuesto,
 *     suponiendo que la carga no baja al subir N. Son unas 9 cargas y no 200
 *   - Si ni siquiera con 0 nuevas cabe, el atraso por sí solo ya rebasa el presupuesto. Se
 *     sugiere 0 y se avisa con backlogOverBudget
 *   - Supuesto. La proyección supone que cada repaso sale Bien (es la de projectLoad, la misma de
 *     Progreso). Quien falla más tendrá más repasos de los que se cuentan aquí. Tampoco descuenta
 *     lo que el alumno ya repasó hoy ni aplica el límite diario de repasos
 *   - Con más candidatas que tarjetas sin ver, todas entran hoy. Por eso con pocas nuevas y mucho
 *     presupuesto la sugerencia llega a maxNew aunque no haya tantas tarjetas. La interfaz decide
 *     si la recorta a las que existen
 * Umbrales. Se reciben como parámetro (TimeRules y NewPerDayRules). maxNew por defecto es 200 y el
 * mínimo de tarjetas nuevas medidas para usar su mediana es 20 (J).
 */
import { projectLoad, type DayLoad, type QueueCard, type SchedulerConfig } from './fsrs';
import { addDays, studyDayOf, studyDayStart } from './studyDay';

export interface ReviewTimeSample {
  /** Milisegundos desde que se mostró la tarjeta hasta que se reveló la respuesta */
  msToReveal: number;
  /** Milisegundos desde que se reveló la respuesta hasta que se calificó */
  msToRate: number;
  /** La tarjeta se veía por primera vez */
  isNew: boolean;
}

export interface TimeRules {
  /** Repasos medidos (no nuevos) desde los que se confía en la mediana propia */
  minReviewsToMeasure: number;
  referenceSecondsPerReview: number;
  referenceSecondsPerNew: number;
  /** Tope por muestra, para que una tarjeta olvidada abierta no cuente como minutos */
  capSeconds: number;
}

export interface TimeEstimate {
  secondsPerReview: number;
  secondsPerNew: number;
  /** true si salen del propio alumno. false si son los tiempos de referencia */
  measured: boolean;
  /** Muestras válidas que no eran nuevas */
  reviews: number;
}

export interface NewPerDayRules {
  /** Fracción de los minutos diarios que se dedica a tarjetas, de 0 a 1 */
  cardsTimeShare: number;
  /** Días que se proyectan para medir el pico de carga */
  suggestionHorizonDays: number;
}

export type NewPerDaySuggestion =
  | { status: 'needs_minutes' }
  | { status: 'no_new_cards'; unseen: 0 }
  | {
      status: 'ready';
      suggested: number;
      budgetMinutes: number;
      /** Minutos del día más pesado con la cantidad sugerida */
      peakMinutes: number;
      /** AAAA-MM-DD del día más pesado. null si no hay carga */
      peakDay: string | null;
      measured: boolean;
      /** Ni con cero nuevas cabe, el atraso ya rebasa el presupuesto */
      backlogOverBudget: boolean;
    };

/** Tarjetas nuevas medidas desde las que se usa su mediana y no la referencia (J) */
export const MIN_NEW_SAMPLES_TO_MEASURE = 20;
/** Tope de nuevas por día de la búsqueda cuando no se indica otro */
export const DEFAULT_MAX_NEW = 200;

/** Para no perder una cantidad que cabe justo por ruido de punto flotante */
const EPSILON = 1e-9;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

const isValidMs = (value: number) => Number.isFinite(value) && value >= 0;

/**
 * Tiempo típico por repaso y por tarjeta nueva. Ignora muestras con tiempos negativos o no finitos.
 * Un tope inválido (negativo o NaN) se ignora. Si minReviewsToMeasure es 0 o menos, igual se piden
 * al menos un repaso medido, porque sin ninguno no hay mediana
 */
export function estimateCardTimes(
  samples: readonly ReviewTimeSample[],
  rules: TimeRules,
): TimeEstimate {
  const limit = rules.capSeconds >= 0 ? rules.capSeconds : Infinity;
  const reviewSeconds: number[] = [];
  const newSeconds: number[] = [];
  for (const sample of samples) {
    if (!isValidMs(sample.msToReveal) || !isValidMs(sample.msToRate)) continue;
    const seconds = Math.min((sample.msToReveal + sample.msToRate) / 1000, limit);
    (sample.isNew ? newSeconds : reviewSeconds).push(seconds);
  }
  const reviews = reviewSeconds.length;
  const measured = reviews > 0 && reviews >= rules.minReviewsToMeasure;
  if (!measured) {
    return {
      secondsPerReview: rules.referenceSecondsPerReview,
      secondsPerNew: rules.referenceSecondsPerNew,
      measured: false,
      reviews,
    };
  }
  return {
    secondsPerReview: median(reviewSeconds),
    secondsPerNew:
      newSeconds.length >= MIN_NEW_SAMPLES_TO_MEASURE
        ? median(newSeconds)
        : rules.referenceSecondsPerNew,
    measured: true,
    reviews,
  };
}

interface Peak {
  minutes: number;
  day: string | null;
}

/** El día más pesado de una proyección, en minutos. Gana el primero si hay empate */
function peakOf(load: readonly DayLoad[], times: TimeEstimate): Peak {
  let peak: Peak = { minutes: 0, day: null };
  for (const day of load) {
    const minutes =
      (day.reviews * times.secondsPerReview + day.newCards * times.secondsPerNew) / 60;
    if (minutes > peak.minutes) peak = { minutes, day: day.day };
  }
  return peak;
}

const isUnseen = (card: QueueCard) => card.state === null || card.state.state === 'new';

/**
 * Devuelve una función que da la misma proyección que projectLoad con newCardsPerDay igual al
 * candidato, pero sin volver a simular las tarjetas que no dependen de él (ver el encabezado)
 */
function makeLoadProjector(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  horizon: number;
}): (newPerDay: number) => DayLoad[] {
  const { now, config, horizon } = input;
  const today = studyDayOf(now, config.timeZone);
  const seenCards = input.cards.filter((card) => !isUnseen(card));
  const unseen = input.cards.length - seenCards.length;
  // Con historial no depende de las nuevas por día, projectLoad solo las usa para las nuevas
  const base = projectLoad({ cards: seenCards, now, config, days: horizon });

  // Lo que deja una tarjeta nueva que entra el día d. Se proyecta desde el inicio de ese día, que
  // es el mismo instante de entrada que usa projectLoad (una hora después de empezar el día, o
  // ahora si es hoy), hasta el mismo final del horizonte. El resultado empieza en el día d
  const single: QueueCard[] = [{ cardId: 'unseen', noteId: 'unseen', state: null }];
  const singleConfig = { ...config, thresholds: { ...config.thresholds, newCardsPerDay: 1 } };
  const profiles = new Map<number, DayLoad[]>();
  const profileOf = (entryDay: number): DayLoad[] => {
    let profile = profiles.get(entryDay);
    if (!profile) {
      profile = projectLoad({
        cards: single,
        now: entryDay === 0 ? now : studyDayStart(addDays(today, entryDay), config.timeZone),
        config: singleConfig,
        days: horizon - entryDay,
      });
      profiles.set(entryDay, profile);
    }
    return profile;
  };

  return (newPerDay) => {
    const load = base.map((day) => ({ ...day }));
    if (newPerDay <= 0) return load;
    for (let entryDay = 0; entryDay < horizon; entryDay += 1) {
      // projectLoad mete las nuevas en fila, newPerDay por día, hasta que se acaban
      const entering = Math.min(newPerDay, unseen - entryDay * newPerDay);
      if (entering <= 0) break;
      profileOf(entryDay).forEach((entry, offset) => {
        const target = load[entryDay + offset];
        if (!target) return;
        target.reviews += entry.reviews * entering;
        target.newCards += entry.newCards * entering;
      });
    }
    return load;
  };
}

export function suggestNewPerDay(input: {
  cards: readonly QueueCard[];
  now: Date;
  config: SchedulerConfig;
  dailyMinutes: number | null;
  times: TimeEstimate;
  rules: NewPerDayRules;
  maxNew?: number;
}): NewPerDaySuggestion {
  const { cards, now, config, dailyMinutes, times, rules } = input;
  // Unos minutos que no son un número positivo no son un dato, se piden otra vez
  if (dailyMinutes === null || !Number.isFinite(dailyMinutes) || dailyMinutes <= 0) {
    return { status: 'needs_minutes' };
  }
  const unseen = cards.filter(isUnseen).length;
  if (unseen === 0) return { status: 'no_new_cards', unseen: 0 };

  const budgetMinutes = dailyMinutes * rules.cardsTimeShare;
  const horizon = Math.max(1, Math.floor(rules.suggestionHorizonDays));
  const maxNew = Math.max(0, Math.floor(input.maxNew ?? DEFAULT_MAX_NEW));

  const loadOf = makeLoadProjector({ cards, now, config, horizon });
  const peaks = new Map<number, Peak>();
  const peakFor = (candidate: number): Peak => {
    let peak = peaks.get(candidate);
    if (!peak) {
      peak = peakOf(loadOf(candidate), times);
      peaks.set(candidate, peak);
    }
    return peak;
  };
  const fits = (candidate: number) => peakFor(candidate).minutes <= budgetMinutes + EPSILON;

  if (!fits(0)) {
    const { minutes, day } = peakFor(0);
    return {
      status: 'ready',
      suggested: 0,
      budgetMinutes,
      peakMinutes: minutes,
      peakDay: day,
      measured: times.measured,
      backlogOverBudget: true,
    };
  }

  // Invariante. low cabe siempre y todo lo que pase de high no cabe
  let low = 0;
  let high = maxNew;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle - 1;
  }
  const { minutes, day } = peakFor(low);
  return {
    status: 'ready',
    suggested: low,
    budgetMinutes,
    peakMinutes: minutes,
    peakDay: day,
    measured: times.measured,
    backlogOverBudget: false,
  };
}
