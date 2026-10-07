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

export interface PlanDef {
  key: PlanKey;
  /** Precio de ejemplo en MXN por periodo */
  priceMxn: number;
  access: PlanAccess;
}

/**
 * Precios en pesos mexicanos. El mensual es el estándar de la reunión del 2026-10-07 y el anual
 * conserva el descuento que ya tenía sobre 12 meses. El Fundador es un precio fijo de por vida para
 * los primeros usuarios, con 79 como valor provisional dentro del rango de 59 a 79 que Ricardo
 * confirma (D-087)
 */
export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    priceMxn: 0,
    access: { dailyQuestions: 20, fullExam: false, aiTutor: false, importDecks: true, party: true },
  },
  founder: {
    key: 'founder',
    priceMxn: 79,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
  },
  monthly: {
    key: 'monthly',
    priceMxn: 150,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
  },
  annual: {
    key: 'annual',
    priceMxn: 1200,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
  },
};
