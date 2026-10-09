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
 * Precios en pesos mexicanos. El mensual es el estándar de la reunión del 2026-10-07 y el anual
 * conserva el descuento que ya tenía sobre 12 meses. El Fundador es un precio fijo de por vida para
 * los primeros usuarios y su monto de 79 lo confirmó Ricardo el 2026-10-07 (D-087). El anual sigue
 * provisional hasta que Ricardo fije su precio
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
    priceMxn: 150,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
  annual: {
    key: 'annual',
    priceMxn: 1200,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
    features: ALL_FEATURES_OPEN,
    aiCardsPerDay: AI_CARDS_PER_DAY_PAID,
  },
};

/** Si el plan abre la función. Recibe la tabla de planes para poder probar con otra */
export function canUseFeature(
  plan: PlanKey,
  feature: GatedFeature,
  plans: Record<PlanKey, Pick<PlanDef, 'features'>> = PLANS,
): boolean {
  return plans[plan].features[feature];
}
