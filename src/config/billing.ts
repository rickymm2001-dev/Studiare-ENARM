// Planes de la suscripción (pantalla 16). Precios en pesos mexicanos con IVA incluido (D-114 y B10 del
// plan del cambio). Sin la nube el pago es simulado y no cobra nada (3.2). Con la nube cobra la pasarela
// y el plan lo decide el servidor (supabase/functions/_shared/billingTypes.ts tiene los mismos precios
// y una prueba los compara).

export type PlanKey = 'free' | 'founder' | 'founder_annual' | 'monthly' | 'annual';
export type PaidPlanKey = Exclude<PlanKey, 'free'>;
/** Planes de los pases de un solo pago y de Mercado Pago, que nunca llevan precio Fundador (8.3) */
export type RegularPlanKey = 'monthly' | 'annual';

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

/**
 * Mazos del catálogo que se pueden seguir en el plan Gratis (V4-B8, reunión con Paco). Urgencias va
 * abierto como puerta de entrada. La lista es de la interfaz. Bajarlo de la nube sigue pidiendo plan
 * de pago hasta que Ricardo autorice la regla del servidor (docs/PENDIENTES_DE_RICARDO.md)
 */
export const FREE_CATALOG_DECK_KEYS: readonly string[] = ['paco-urgencias'];

export const isFreeCatalogDeck = (deckKey: string): boolean =>
  FREE_CATALOG_DECK_KEYS.includes(deckKey);

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
  // Promoción del anual, como el Fundador lo es del mensual. Comparte los mismos lugares (B10, 4.5)
  founder_annual: {
    key: 'founder_annual',
    priceMxn: 749,
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

/**
 * Planes que ve el alumno. Los Fundador no tienen tarjeta propia, van dentro del mensual y del anual
 * (D-114 y B10)
 */
export const VISIBLE_PLANS: readonly PlanKey[] = ['free', 'monthly', 'annual'];

/** Días de la prueba gratis con tarjeta y de la garantía desde el primer cobro (respuestas 10 y 18) */
export const TRIAL_DAYS = 7;
export const GUARANTEE_DAYS = 7;

/** Pases de un solo pago con OXXO, SPEI o Mercado Pago. Cuestan lo mismo que el plan regular (1.7) */
export const PASS_PRICES_MXN: Record<RegularPlanKey, number> = { monthly: 149, annual: 1499 };

export function isFounderPlan(plan: PlanKey): plan is 'founder' | 'founder_annual' {
  return plan === 'founder' || plan === 'founder_annual';
}

/** Si el plan se cobra cada año */
export function isYearlyPlan(plan: PlanKey): boolean {
  return plan === 'annual' || plan === 'founder_annual';
}

/** El plan regular de un plan de pago. Lo usan los pases y Mercado Pago, que no llevan precio Fundador */
export function regularPlanOf(plan: PaidPlanKey): RegularPlanKey {
  return isYearlyPlan(plan) ? 'annual' : 'monthly';
}

/**
 * El plan que se cobra al renovar con un cambio programado en el portal. Solo se programa bajar de
 * anual a mensual dentro del mismo precio, regular o Fundador, porque subir se cobra al momento (B10)
 */
export function scheduledPlanOf(plan: PaidPlanKey): PaidPlanKey {
  switch (plan) {
    case 'annual':
      return 'monthly';
    case 'founder_annual':
      return 'founder';
    default:
      return plan;
  }
}

/**
 * Si se ofrece la promoción Fundador en el mensual. El cupo real lo cuenta el servidor al cobrar, y si
 * ya se llenó la app ofrece el precio regular. Para terminar la promoción basta con ponerlo en false.
 * Va como boolean y no como true, para que las pantallas sigan cubriendo los dos casos
 */
export const FOUNDER_PROMO_ACTIVE = true as boolean;

/**
 * El plan que se cobra al elegir uno visible. Mientras dure la promoción, el mensual se cobra como
 * Fundador y el anual como anual Fundador (B10)
 */
export function checkoutPlanFor(
  key: PlanKey,
  founderPromo: boolean = FOUNDER_PROMO_ACTIVE,
): PlanKey {
  if (!founderPromo) return key;
  if (key === 'monthly') return 'founder';
  if (key === 'annual') return 'founder_annual';
  return key;
}

/** El plan visible que corresponde a un plan cobrado. Quien paga un Fundador tiene su mensual o anual */
export function visiblePlanOf(key: PlanKey): PlanKey {
  if (key === 'founder') return 'monthly';
  if (key === 'founder_annual') return 'annual';
  return key;
}

/**
 * Cuánto ahorra el anual contra 12 meses del mensual, en porcentaje entero. Se redondea hacia abajo
 * para no prometer de más. Al precio regular, 149 y 1,499, da 16. Con la promoción, el anual Fundador
 * de 749 contra 12 meses del Fundador de 79 da 20 (B10)
 */
export function annualSavingsPercent(
  plans: Record<PlanKey, Pick<PlanDef, 'priceMxn'>> = PLANS,
  variant: 'regular' | 'founder' = 'regular',
): number {
  const monthly = variant === 'founder' ? plans.founder : plans.monthly;
  const annual = variant === 'founder' ? plans.founder_annual : plans.annual;
  const twelveMonths = monthly.priceMxn * 12;
  if (twelveMonths <= 0) return 0;
  return Math.max(0, Math.floor((1 - annual.priceMxn / twelveMonths) * 100));
}

/**
 * El plan que vale según la suscripción guardada en este navegador, la del pago simulado o la que
 * reflejó la nube con my_plan. Sin suscripción activa es Gratis. Es el único lugar de esta regla en la
 * app. La nube refleja como active todo plan vigente, también la prueba gratis, un pase o una
 * suscripción cancelada que vale hasta el fin del periodo (B10), así los candados, el tope de
 * preguntas, Suscripción y Tu plan los heredan sin cambiar
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
