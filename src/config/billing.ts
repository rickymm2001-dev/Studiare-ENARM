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
  importDecks: boolean;
  party: boolean;
}

/**
 * Funciones de la carga diaria que cada plan puede abrir o cerrar (D-085, fila 14). Hoy todas están
 * abiertas en todos los planes, porque Ricardo todavía no decide cuáles serán de pago. Cuando lo
 * decida solo cambia esta tabla y la interfaz ya consulta la bandera en cada punto de entrada
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

export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    priceMxn: 0,
    access: { dailyQuestions: 20, fullExam: false, aiTutor: false, importDecks: true, party: true },
    // La IA con textos y PDF es de pago (D-085, fila 14)
    features: { ...ALL_FEATURES_OPEN, aiCards: false },
    aiCardsPerDay: 0,
  },
  founder: {
    key: 'founder',
    priceMxn: 79,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
  monthly: {
    key: 'monthly',
    priceMxn: 149,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
  annual: {
    key: 'annual',
    priceMxn: 1499,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
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
export function checkoutPlanFor(key: PlanKey, founderPromo: boolean = FOUNDER_PROMO_ACTIVE): PlanKey {
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
export function annualSavingsPercent(plans: Record<PlanKey, Pick<PlanDef, 'priceMxn'>> = PLANS): number {
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

/** Si el plan abre la función. Recibe la tabla de planes para poder probar con otra */
export function canUseFeature(
  plan: PlanKey,
  feature: GatedFeature,
  plans: Record<PlanKey, Pick<PlanDef, 'features'>> = PLANS,
): boolean {
  return plans[plan].features[feature];
}
