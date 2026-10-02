/**
 * XP y niveles (9.5).
 *
 * Qué hace. Calcula el XP de cada actividad con su motivo, aplica el multiplicador por racha y el
 * tope diario por volumen, y convierte el XP total en nivel y título.
 * Entradas. La actividad (respuesta de opción múltiple con su dificultad, repaso de tarjeta con su
 * tiempo, meta diaria cumplida o reto), la racha y el XP por volumen que ya lleva hoy.
 * Salidas. Premios de XP con cantidad y motivo, listos para los eventos xp_awarded. Nivel, título,
 * XP dentro del nivel y XP para el siguiente.
 * Método
 *   - Opción múltiple. Acierto 10 + 5 × (dificultad del médico − 1), de 10 a 30. Error 2 por intentar
 *   - Tarjetas. 3 por repaso, sin importar la calificación, para que nadie infle su calificación y
 *     contamine FSRS. Un repaso de menos de 1 segundo no da XP
 *   - Constancia. 50 por meta diaria cumplida. Multiplicador por racha de 1 + 0.025 por día, con tope
 *     de 1.5
 *   - Tope diario de 1,500 XP por volumen (opción múltiple y tarjetas). Los bonos no cuentan al tope
 *   - Niveles. XP acumulado para llegar al nivel n = a · (n − 1)^p. Títulos por tramo
 * Umbrales. Todas las cantidades son (J) y la curva se ajusta con los alumnos simulados para que
 * un alumno constante suba unos 2 niveles por semana al inicio y 1 cada 2 semanas a los 3 meses.
 */

export type XpReason =
  'mcq_correct' | 'mcq_attempt' | 'card_review' | 'daily_goal' | 'streak_multiplier' | 'challenge';

export interface XpAward {
  amount: number;
  reason: XpReason;
  sourceEventId: string | null;
}

export const XP_RULES = {
  mcqCorrectBase: 10,
  mcqCorrectPerLevel: 5,
  mcqAttempt: 2,
  cardReview: 3,
  minCardMs: 1000,
  dailyGoalBonus: 50,
  challengeBonus: 100,
  streakStep: 0.025,
  streakCap: 1.5,
  dailyVolumeCap: 1500,
} as const;

export function streakMultiplier(streakDays: number): number {
  return Math.min(XP_RULES.streakCap, 1 + XP_RULES.streakStep * Math.max(0, streakDays));
}

export type XpActivity =
  | { kind: 'mcq'; correct: boolean; physicianDifficulty: number; eventId: string }
  | { kind: 'card'; msToRate: number; eventId: string }
  | { kind: 'daily_goal'; eventId: string | null }
  | { kind: 'challenge'; eventId: string | null };

/**
 * Premios de una actividad. El volumen se recorta al tope diario y el multiplicador por racha se
 * registra como premio aparte, para que cada XP quede con su motivo (9.5)
 */
export function awardXp(input: {
  activity: XpActivity;
  streakDays: number;
  volumeXpToday: number;
}): XpAward[] {
  const { activity } = input;
  let base: XpAward;
  switch (activity.kind) {
    case 'mcq': {
      const level = Math.min(5, Math.max(1, Math.round(activity.physicianDifficulty)));
      base = activity.correct
        ? {
            amount: XP_RULES.mcqCorrectBase + XP_RULES.mcqCorrectPerLevel * (level - 1),
            reason: 'mcq_correct',
            sourceEventId: activity.eventId,
          }
        : { amount: XP_RULES.mcqAttempt, reason: 'mcq_attempt', sourceEventId: activity.eventId };
      break;
    }
    case 'card':
      if (activity.msToRate < XP_RULES.minCardMs) return [];
      base = {
        amount: XP_RULES.cardReview,
        reason: 'card_review',
        sourceEventId: activity.eventId,
      };
      break;
    case 'daily_goal':
      return [
        { amount: XP_RULES.dailyGoalBonus, reason: 'daily_goal', sourceEventId: activity.eventId },
      ];
    case 'challenge':
      return [
        { amount: XP_RULES.challengeBonus, reason: 'challenge', sourceEventId: activity.eventId },
      ];
  }
  const room = Math.max(0, XP_RULES.dailyVolumeCap - input.volumeXpToday);
  const capped = Math.min(base.amount, room);
  if (capped === 0) return [];
  const bonus = Math.round(capped * (streakMultiplier(input.streakDays) - 1));
  const awards: XpAward[] = [{ ...base, amount: capped }];
  if (bonus > 0)
    awards.push({ amount: bonus, reason: 'streak_multiplier', sourceEventId: base.sourceEventId });
  return awards;
}

/** Premios que cuentan al tope diario por volumen */
export function isVolumeAward(award: Pick<XpAward, 'reason'>): boolean {
  return (
    award.reason === 'mcq_correct' ||
    award.reason === 'mcq_attempt' ||
    award.reason === 'card_review'
  );
}

export interface LevelCurve {
  a: number;
  p: number;
}

/** Curva por defecto (J). Se revisa con la simulación de un alumno constante */
export const DEFAULT_LEVEL_CURVE: LevelCurve = { a: 1700, p: 1.7 };

export const TITLES: readonly { fromLevel: number; title: string }[] = [
  { fromLevel: 1, title: 'Pasante' },
  { fromLevel: 4, title: 'R1' },
  { fromLevel: 7, title: 'R2' },
  { fromLevel: 10, title: 'R3' },
  { fromLevel: 13, title: 'R4' },
  { fromLevel: 16, title: 'Jefe de residentes' },
  { fromLevel: 20, title: 'Adscrito' },
  { fromLevel: 25, title: 'Profesor titular' },
];

/** XP acumulado que hace falta para llegar al nivel n */
export function xpForLevel(level: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): number {
  return Math.round(curve.a * Math.max(0, level - 1) ** curve.p);
}

export interface LevelInfo {
  level: number;
  title: string;
  xpIntoLevel: number;
  xpForNext: number;
}

export function levelFor(totalXp: number, curve: LevelCurve = DEFAULT_LEVEL_CURVE): LevelInfo {
  const xp = Math.max(0, totalXp);
  // Solución cerrada y luego ajuste por redondeo
  let level = Math.max(1, Math.floor((xp / curve.a) ** (1 / curve.p)) + 1);
  while (xpForLevel(level + 1, curve) <= xp) level += 1;
  while (level > 1 && xpForLevel(level, curve) > xp) level -= 1;
  const title = [...TITLES].reverse().find((entry) => level >= entry.fromLevel)?.title ?? 'Pasante';
  return {
    level,
    title,
    xpIntoLevel: xp - xpForLevel(level, curve),
    xpForNext: xpForLevel(level + 1, curve) - xpForLevel(level, curve),
  };
}

export interface TitleStep {
  title: string;
  fromLevel: number;
  /** Último nivel con este título. null en el último título */
  toLevel: number | null;
  /** XP acumulado para llegar a fromLevel */
  xpFrom: number;
}

/** Escalera de títulos con su rango de niveles y el XP para llegar a cada uno */
export function titleLadder(curve: LevelCurve = DEFAULT_LEVEL_CURVE): TitleStep[] {
  return TITLES.map((entry, index) => {
    const next = TITLES[index + 1];
    return {
      title: entry.title,
      fromLevel: entry.fromLevel,
      toLevel: next ? next.fromLevel - 1 : null,
      xpFrom: xpForLevel(entry.fromLevel, curve),
    };
  });
}

/** Siguiente título por alcanzar y cuánto XP falta. null si ya tiene el último */
export function nextTitle(
  totalXp: number,
  curve: LevelCurve = DEFAULT_LEVEL_CURVE,
): { step: TitleStep; xpLeft: number } | null {
  const step = titleLadder(curve).find((entry) => entry.xpFrom > totalXp);
  return step ? { step, xpLeft: step.xpFrom - Math.max(0, totalXp) } : null;
}
