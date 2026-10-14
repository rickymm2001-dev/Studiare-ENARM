// Planes de la suscripción simulada (pantalla 16). Precios de ejemplo en pesos mexicanos, sin cobro
// real (3.2). Se editarán desde admin (pantalla 25) y en producción vendrán de la pasarela de pago.

export type PlanKey = 'free' | 'founder' | 'monthly' | 'annual';

/** Lugares del plan Fundador. El cupo se verifica en el servidor al cobrar (D-087) */
export const FOUNDER_SEATS = 100;

/** Banderas de acceso por plan. La interfaz las consulta en lugar de preguntar por el plan */
export interface PlanAccess {
  /** Preguntas del simulador por día. null es sin límite */
  dailyQuestions: number | null;
  fullExam: boolean;
  aiTutor: boolean;
  /** Subir mazos propios de Anki, CSV, Excel o Word (respuesta 20) */
  importDecks: boolean;
  /**
   * Seguir mazos nuevos del catálogo de precargados (4.25 del plan del cambio). Los que el alumno ya
   * tiene en su dispositivo los sigue repasando en cualquier plan
   */
  deckCatalog: boolean;
  /** Grupos, tabla de la semana, retos y duelos. Los referidos siguen abiertos (respuesta 20, 4.3) */
  party: boolean;
}

/** Las banderas de PlanAccess que solo abren o cierran algo, sin cifra */
export type AccessFlag = {
  [Key in keyof PlanAccess]: PlanAccess[Key] extends boolean ? Key : never;
}[keyof PlanAccess];

/**
 * Funciones de la carga diaria que cada plan puede abrir o cerrar (D-085, fila 14). Gratis cierra las
 * tarjetas con IA y Apuntes (respuesta 20 del plan del cambio). Para cambiar cuáles son de pago solo
 * cambia esta tabla, y la interfaz ya consulta la bandera en cada punto de entrada
 */
export const GATED_FEATURES = [
  'explore',
  'outlines',
  'aiCards',
  'overdueTools',
  'guideProfile',
  'newPerDaySuggestion',
  'easyDays',
  'cardTimer',
] as const;
export type GatedFeature = (typeof GATED_FEATURES)[number];
export type FeatureAccess = Record<GatedFeature, boolean>;

const ALL_FEATURES_OPEN: FeatureAccess = {
  explore: true,
  outlines: true,
  aiCards: true,
  overdueTools: true,
  guideProfile: true,
  newPerDaySuggestion: true,
  easyDays: true,
  cardTimer: true,
};

export interface PlanDef {
  key: PlanKey;
  /** Precio de ejemplo en MXN por periodo */
  priceMxn: number;
  access: PlanAccess;
  /** Funciones de la carga diaria abiertas en este plan */
  features: FeatureAccess;
  /**
   * Generaciones de tarjetas con IA por día. Cada texto o PDF que se manda al generador cuenta una.
   * 0 en el plan Gratis, que no incluye la función (D-085, fila 14). El mismo tope se aplica en el
   * servidor, porque la bandera del navegador no basta
   */
  aiCardsPerDay: number;
}

/**
 * Precios en pesos mexicanos que fijó Ricardo el 2026-10-11 (D-114). El mensual cuesta 149 y el anual
 * 1,499. El Fundador no es otro plan a la vista del alumno sino una promoción del mensual, a 79 de por
 * vida para los primeros FOUNDER_SEATS. Por dentro sigue siendo el plan founder, con su propio precio
 * en la pasarela y su cupo que el servidor cuenta al cobrar (D-087)
 */
/** Generaciones de tarjetas con IA por día en los planes de pago. Juicio de diseño, ajustable */
export const AI_CARDS_PER_DAY_PAID = 20;

/** Lo que abre un plan de pago. Los tres planes de pago dan lo mismo y solo cambia el precio */
const PAID_ACCESS: PlanAccess = {
  dailyQuestions: null,
  fullExam: true,
  aiTutor: true,
  importDecks: true,
  deckCatalog: true,
  party: true,
};

export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    priceMxn: 0,
    // 20 preguntas al día con su explicación después de contestar (respuestas 18 y 19). Party,
    // Importar mazos y seguir mazos nuevos del catálogo son de pago (respuesta 20 y 4.25, B8 del plan
    // del cambio). El servidor también cierra Party y los apuntes de la nube según el plan
    // (supabase/migrations/20261021000001_free_plan_locks.sql). El tope de preguntas pasa al
    // servidor con el banco en la nube (B11)
    access: {
      dailyQuestions: 20,
      fullExam: false,
      aiTutor: false,
      importDecks: false,
      deckCatalog: false,
      party: false,
    },
    // La IA con textos y PDF es de pago (D-085, fila 14). Apuntes también, con su candado y su vista
    // previa (respuesta 20, B6 del plan del cambio)
    features: { ...ALL_FEATURES_OPEN, aiCards: false, outlines: false },
    aiCardsPerDay: 0,
  },
  founder: {
    key: 'founder',
    priceMxn: 79,
    access: PAID_ACCESS,
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
  monthly: {
    key: 'monthly',
    priceMxn: 149,
    access: PAID_ACCESS,
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
  annual: {
    key: 'annual',
    priceMxn: 1499,
    access: PAID_ACCESS,
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
};

/** Planes que ve el alumno. El Fundador no tiene tarjeta propia, va dentro del mensual (D-114) */
export const VISIBLE_PLANS: readonly PlanKey[] = ['free', 'monthly', 'annual'];

/**
 * Si se ofrece la promoción Fundador en el mensual. El cupo real lo cuenta el servidor al cobrar, y si
 * ya se llenó la app ofrece el precio regular. Para terminar la promoción basta con ponerlo en false.
 * Va como boolean y no como true, para que las pantallas sigan cubriendo los dos casos
 */
export const FOUNDER_PROMO_ACTIVE = true as boolean;

/** El plan que se cobra al elegir uno visible. El mensual se cobra como Fundador mientras dure la promoción */
export function checkoutPlanFor(
  key: PlanKey,
  founderPromo: boolean = FOUNDER_PROMO_ACTIVE,
): PlanKey {
  return key === 'monthly' && founderPromo ? 'founder' : key;
}

/** El plan visible que corresponde a un plan cobrado. Quien paga el Fundador tiene el mensual */
export function visiblePlanOf(key: PlanKey): PlanKey {
  return key === 'founder' ? 'monthly' : key;
}

/**
 * Cuánto ahorra el anual contra 12 meses del mensual al precio regular, en porcentaje entero. Se
 * redondea hacia abajo para no prometer de más. Con 149 y 1,499 da 16
 */
export function annualSavingsPercent(
  plans: Record<PlanKey, Pick<PlanDef, 'priceMxn'>> = PLANS,
): number {
  const twelveMonths = plans.monthly.priceMxn * 12;
  if (twelveMonths <= 0) return 0;
  return Math.max(0, Math.floor((1 - plans.annual.priceMxn / twelveMonths) * 100));
}

/**
 * Pasarelas que la app ofrece. Mercado Pago queda fuera hasta que su cuenta esté activa y su función de
 * avisos desplegada, porque hoy el servidor respondería que no está configurado (D-114). Para
 * activarla basta con agregarla aquí
 */
export const PAYMENT_PROVIDERS: readonly ('stripe' | 'mercadopago')[] = ['stripe'];

/**
 * El plan que vale según la suscripción guardada en este navegador, la del pago simulado o la que
 * reflejó la nube con my_plan. Sin suscripción activa es Gratis. Es el único lugar de esta regla en la
 * app, así la prueba gratis de B10 se suma aquí y la heredan los candados, el tope de preguntas,
 * Suscripción y Tu plan
 */
export function planOf(
  subscription: { plan: PlanKey; status: string } | null | undefined,
): PlanKey {
  return subscription?.status === 'active' ? subscription.plan : 'free';
}

/**
 * Todo lo que un plan puede cerrar con un candado. Las funciones de la carga diaria y las banderas de
 * acceso de sí o no, como Party o Importar mazos (B8 del plan del cambio)
 */
export type PlanLock = GatedFeature | AccessFlag;

export function isGatedFeature(lock: PlanLock): lock is GatedFeature {
  return (GATED_FEATURES as readonly string[]).includes(lock);
}

/**
 * Si el plan abre lo que pide el candado, una función de la carga diaria o una bandera de acceso. Es
 * la única pregunta que hace la interfaz. Recibe la tabla de planes para poder probar con otra
 */
export function canUse(
  plan: PlanKey,
  lock: PlanLock,
  plans: Record<PlanKey, Pick<PlanDef, 'features' | 'access'>> = PLANS,
): boolean {
  return isGatedFeature(lock) ? plans[plan].features[lock] : plans[plan].access[lock];
}

/**
 * Lo que compara cada plan en Suscripción y en la portada, en este orden, después de las preguntas al
 * día. Están las tres funciones que cierra Gratis por la respuesta 20 (Apuntes, Party e Importar
 * mazos) y el catálogo de mazos (4.25), para que la tabla diga lo mismo que los candados
 */
export const PLAN_HIGHLIGHTS = [
  'fullExam',
  'aiTutor',
  'outlines',
  'deckCatalog',
  'importDecks',
  'party',
] as const satisfies readonly PlanLock[];
export type PlanHighlight = (typeof PLAN_HIGHLIGHTS)[number];
