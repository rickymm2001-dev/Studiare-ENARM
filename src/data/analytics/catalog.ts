// Lista cerrada de lo que la analítica de producto puede medir (B15, 1.1, 1.4, 1.5 y 7.5 del plan de B15).
// Es la única puerta. Cada evento trae sus propiedades, y cada propiedad es de una lista cerrada, un
// rango, un número de una lista corta o un sí y no. Un texto libre no cabe en el tipo, y si llega por
// otro camino el evento completo se descarta, porque una propiedad de más puede ser lo que no debe salir.
//
// Qué trae este archivo desde el paso 0
//   - ANALYTICS_EVENTS, los eventos que mide la app, con los valores que admite cada propiedad. De aquí
//     salen AnalyticsEvent y PropsOf, que son el contrato con el puente de la bitácora, las pantallas y el
//     recorrido
//   - SERVER_ANALYTICS_EVENTS, los eventos de dinero que encola la base (1.7). No pasan por track. La base
//     los encola con analytics_enqueue, analytics-flush los manda, y una prueba compara esta lista con la
//     migración 20261029000002
//   - track, que valida y entrega a quien esté enchufado con setAnalyticsSink. Mientras nadie esté
//     enchufado no manda nada. El paquete B de B15 enchufa ahí la cola y el transporte
//   - setAnalyticsConsent. Sin saber el permiso, o sin él, track no junta nada, ni siquiera en memoria (1.1)
//
// No hay aquí ningún id de cuenta, correo, alias, nombre ni texto del alumno, y no puede haberlo, porque
// ninguna propiedad acepta un texto libre. La especialidad que busca el alumno, sus puntajes, sus aciertos
// por pregunta y sus sesgos tampoco viajan (1.9). Cómo nos conociste, con su código de influencer, no
// va a ninguna herramienta de analítica según el aviso de privacidad (D-132), así que signup_completed no
// lleva heard_from ni has_code (corrige la fila de 1.5).
//
// Este archivo va en el JavaScript inicial, porque lo importa el puente de la bitácora, así que no usa zod
// ni importa nada que no sea tipos o listas cortas. Las listas de otro lado (frecuencia de los recordatorios)
// se repiten aquí con satisfies, que revisa cada valor al compilar, y una prueba revisa que estén completas
import type { PaidPlanKey } from '@/config/billing';
import type { ReminderFrequency } from '@/data/cloud/engagementContracts';
import { TOUR_STEPS } from '@/features/tour/steps';

// ===================================================================== Valores cerrados

/** Cuántas tarjetas o preguntas tuvo una sesión, en rangos. Nunca el número exacto */
export const ITEM_BANDS = ['1-9', '10-49', '50-199', '200+'] as const;
export type ItemBand = (typeof ITEM_BANDS)[number];

/** Cuánto duró una sesión de repaso, en minutos y en rangos */
export const MINUTE_BANDS = ['1-4', '5-14', '15-29', '30-59', '60+'] as const;
export type MinuteBand = (typeof MINUTE_BANDS)[number];

/** Cuántos resultados dio una búsqueda de Apuntes, en rangos */
export const RESULT_BANDS = ['0', '1-4', '5-19', '20+'] as const;
export type ResultBand = (typeof RESULT_BANDS)[number];

/** La parte del día de la hora del recordatorio. Nunca la hora exacta */
export const HOUR_BANDS = ['morning', 'afternoon', 'night'] as const;
export type HourBand = (typeof HOUR_BANDS)[number];

/** Tamaños del examen que ofrece Simular (PC 4.6) */
export const EXAM_SIZES = [20, 50, 100, 280] as const;
export type ExamSize = (typeof EXAM_SIZES)[number];

/** Los planes de pago, los cuatro que existen en el servidor */
export const PAID_PLANS = [
  'founder',
  'founder_annual',
  'monthly',
  'annual',
] as const satisfies readonly PaidPlanKey[];

/** Formas de pago, las mismas que guarda la tabla payments */
export const PAYMENT_METHODS = ['card', 'oxxo', 'spei', 'mercadopago'] as const;

/** Para qué es un pago, como en payments.purpose */
export const PAYMENT_PURPOSES = ['subscription', 'pass'] as const;

/** Candados de Gratis que se miden cuando se ven (LockedPreview.tsx) */
export const PAYWALL_FEATURES = [
  'outlines',
  'party',
  'import_decks',
  'catalog',
  'full_exam',
  'ai',
] as const;

/** Con qué frecuencia llega el recordatorio. Debe ser REMINDER_FREQUENCIES (engagementContracts.ts) */
const REMINDER_FREQUENCY_VALUES = [
  'daily',
  'weekdays',
  'custom',
] as const satisfies readonly ReminderFrequency[];

/** Un sí y no. Una propiedad booleana admite los dos valores y ningún otro */
const FLAG = [true, false] as const;

/** Un valor de propiedad tal como viaja. Nada de objetos, listas ni nulos */
export type AnalyticsValue = string | number | boolean;

/** Los valores que admite cada propiedad de un evento. Una propiedad que no esté aquí no sale */
type EventShape = Readonly<Record<string, readonly AnalyticsValue[]>>;

// ===================================================================== Eventos de la app

/** Los eventos que mide la app (1.5), con los valores que admite cada propiedad */
export const ANALYTICS_EVENTS = {
  // Cuenta nueva con el permiso prendido. Sin heard_from ni has_code (D-132)
  signup_completed: { method: ['email', 'google'], target_specialty_set: FLAG },
  review_session_completed: { items: ITEM_BANDS, minutes: MINUTE_BANDS },
  practice_session_completed: {
    section: ['es', 'en'],
    items: ITEM_BANDS,
    feedback: ['each', 'end'],
    targeted: FLAG,
  },
  exam_started: { size: EXAM_SIZES, english_included: FLAG },
  exam_completed: {
    size: EXAM_SIZES,
    english_included: FLAG,
    reason: ['completed', 'time_up', 'abandoned'],
  },
  question_card_created: { origin: ['exam_review', 'practice_feedback'], ai_suggested: FLAG },
  outline_created: {
    template: ['blank', 'class', 'clinicalCase', 'topicSummary'],
    class_mode: FLAG,
  },
  outline_line_to_card: { card_kind: ['forward', 'both', 'cloze', 'multiline'] },
  outline_search_used: { results: RESULT_BANDS },
  pomodoro_completed: { focus_minutes: [15, 25, 50, 'other'] },
  duel_started: {},
  duel_completed: { result: ['won', 'lost', 'tie'] },
  party_group_joined: {},
  // Nunca el puntaje
  official_score_captured: {},
  deck_imported: { format: ['apkg', 'csv'] },
  paywall_viewed: { feature: PAYWALL_FEATURES },
  checkout_started: { plan: PAID_PLANS, method: PAYMENT_METHODS, with_trial: FLAG },
  reminder_prefs_saved: {
    enabled: FLAG,
    frequency: REMINDER_FREQUENCY_VALUES,
    hour_band: HOUR_BANDS,
  },
  tour_started: { trigger: ['auto', 'settings'] },
  tour_step_viewed: { step: TOUR_STEPS },
  tour_completed: { step: TOUR_STEPS },
  tour_skipped: { step: TOUR_STEPS },
  // La encuesta de los primeros días (B18, 3 del diseño). Nunca una respuesta ni el comentario. Contestarla no depende de
  // este permiso, pero medir que se ofreció, se escondió o se terminó sí
  survey_shown: {},
  survey_dismissed: { how: ['later', 'never'] },
  survey_completed: { answered: [7, 8] },
} as const satisfies Record<string, EventShape>;

export type AnalyticsEvent = keyof typeof ANALYTICS_EVENTS;
/** Las propiedades de un evento, cada una con solo los valores de su lista */
export type PropsOf<E extends AnalyticsEvent> = {
  -readonly [
    K in keyof (typeof ANALYTICS_EVENTS)[E]
  ]: (typeof ANALYTICS_EVENTS)[E][K] extends readonly (infer V)[] ? V : never;
};

// ===================================================================== Eventos del servidor

/**
 * Los eventos de dinero que encola la base cuando cambia una suscripción o un pago (1.7). Con el permiso
 * del alumno y con analytics.enabled prendido. La factura de 0 pesos de la prueba nunca cuenta como pago
 * (D-126). Las propiedades son las únicas que analytics_enqueue deja pasar. El orden es el de la
 * restricción de analytics_outbox.event. La app no los usa: solo las pruebas, que los comparan con la
 * migración, y los documentos
 */
export const SERVER_ANALYTICS_EVENTS = {
  trial_started: { plan: PAID_PLANS },
  trial_converted: { plan: PAID_PLANS },
  trial_canceled: { plan: PAID_PLANS },
  payment_succeeded: {
    plan: PAID_PLANS,
    purpose: PAYMENT_PURPOSES,
    method: PAYMENT_METHODS,
    first: FLAG,
  },
  subscription_cancel_scheduled: { plan: PAID_PLANS },
  subscription_canceled: { plan: PAID_PLANS },
  plan_changed: { from_plan: PAID_PLANS, to_plan: PAID_PLANS },
  refund_issued: { purpose: PAYMENT_PURPOSES },
} as const satisfies Record<string, EventShape>;

export type ServerAnalyticsEvent = keyof typeof SERVER_ANALYTICS_EVENTS;

// ===================================================================== Rangos

const bandOf = <T extends string>(
  value: number,
  cuts: readonly number[],
  bands: readonly T[],
): T => {
  // El primer rango cubre todo lo que no llega al primer corte, incluidos 0 y los negativos
  let index = 0;
  for (const cut of cuts) if (value >= cut) index += 1;
  return bands[index] as T;
};

/** El rango de un conteo de tarjetas o preguntas. Una sesión sin elementos cae en el primero */
export const itemBandOf = (count: number): ItemBand => bandOf(count, [10, 50, 200], ITEM_BANDS);

/** El rango de los minutos de una sesión de repaso */
export const minuteBandOf = (minutes: number): MinuteBand =>
  bandOf(minutes, [5, 15, 30, 60], MINUTE_BANDS);

/** El rango de los resultados de una búsqueda. Cero es su propio rango */
export const resultBandOf = (count: number): ResultBand => bandOf(count, [1, 5, 20], RESULT_BANDS);

/** La parte del día de una hora de 0 a 23. De 5 a 11 mañana, de 12 a 18 tarde y el resto noche */
export const hourBandOf = (hour: number): HourBand =>
  hour >= 5 && hour <= 11 ? 'morning' : hour >= 12 && hour <= 18 ? 'afternoon' : 'night';

// ===================================================================== Entrada: track y permiso

/** Lo que sale de track ya validado. Quien lo recibe lo pone en la cola, nunca lo manda directo */
export interface AnalyticsRecord {
  event: AnalyticsEvent;
  properties: Record<string, AnalyticsValue>;
  /** Milisegundos desde 1970, el momento en que pasó */
  at: number;
}

export type AnalyticsSink = (record: AnalyticsRecord) => void;

interface CatalogState {
  /** null es que todavía no se sabe la decisión del alumno */
  consent: boolean | null;
  sink: AnalyticsSink | null;
}

const fresh = (): CatalogState => ({ consent: null, sink: null });
let state = fresh();

/** Deja la analítica como al abrir la pestaña. Lo usan las pruebas */
export function resetAnalytics(): void {
  state = fresh();
}

/** El permiso Medición de uso. true y false son decisiones, null es que todavía no se sabe */
export function setAnalyticsConsent(granted: boolean | null): void {
  state.consent = granted;
}

/** El permiso que se conoce ahora. null es que todavía no se sabe */
export const analyticsConsent = (): boolean | null => state.consent;

/** A quién entrega track lo que valida. null lo deja sin entregar. Lo enchufa el cliente de analítica */
export function setAnalyticsSink(sink: AnalyticsSink | null): void {
  state.sink = sink;
}

/**
 * Las propiedades de un evento si cumplen la lista, o null si el evento no existe o alguna propiedad
 * falta, sobra o no es de su lista. Devuelve una copia con solo lo permitido. No lanza nunca por una
 * entrada mal formada
 */
export function sanitizeEvent(
  event: string,
  props: unknown,
): Record<string, AnalyticsValue> | null {
  if (!Object.hasOwn(ANALYTICS_EVENTS, event)) return null;
  if (typeof props !== 'object' || props === null || Array.isArray(props)) return null;
  const allowed: EventShape = ANALYTICS_EVENTS[event as AnalyticsEvent];
  const given = props as Record<string, unknown>;
  const names = Object.keys(given);
  if (names.length !== Object.keys(allowed).length) return null;
  const clean: Record<string, AnalyticsValue> = {};
  for (const name of names) {
    const values = Object.hasOwn(allowed, name) ? allowed[name] : undefined;
    const value = given[name];
    if (values === undefined || !(values as readonly unknown[]).includes(value)) return null;
    clean[name] = value as AnalyticsValue;
  }
  return clean;
}

/**
 * Mide un evento. Sin permiso, o sin saber todavía si lo hay, no hace nada y no junta nada, ni siquiera
 * en memoria. Con permiso valida contra la lista y entrega. Medir no rompe nada, así que ningún error
 * sale de aquí
 */
export function track<E extends AnalyticsEvent>(event: E, props: PropsOf<E>): void {
  try {
    if (state.consent !== true || state.sink === null) return;
    const properties = sanitizeEvent(event, props);
    if (properties === null) return;
    state.sink({ event, properties, at: Date.now() });
  } catch {
    // Medir nunca debe causar un error
  }
}
