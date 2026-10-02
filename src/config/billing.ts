// Planes de la suscripción simulada (pantalla 16). Precios de ejemplo en pesos mexicanos, sin cobro
// real (3.2). Se editarán desde admin (pantalla 25) y en producción vendrán de la pasarela de pago.

export type PlanKey = 'free' | 'monthly' | 'annual';

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

export const PLANS: Record<PlanKey, PlanDef> = {
  free: {
    key: 'free',
    priceMxn: 0,
    access: { dailyQuestions: 20, fullExam: false, aiTutor: false, importDecks: true, party: true },
  },
  monthly: {
    key: 'monthly',
    priceMxn: 249,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
  },
  annual: {
    key: 'annual',
    priceMxn: 1990,
    access: { dailyQuestions: null, fullExam: true, aiTutor: true, importDecks: true, party: true },
  },
};
