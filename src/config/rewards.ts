// Misiones, insignias y ligas (Fase P bloque 6). Todos los números son provisionales y se ajustan
// aquí, sin tocar el motor. Ricardo todavía no los confirma. Las misiones no dan XP extra, para no
// inflar el XP que ya sale de la bitácora. Marcan el avance del día y de la semana y cuentan para las
// insignias.

export const MISSION_TARGETS = {
  dailyCards: 20,
  dailyQuestions: 10,
  dailyMinutes: 25,
  weeklyDays: 5,
  weeklyXp: 600,
  /** Aciertos de la semana, con el mínimo de preguntas que pide para dar un porcentaje fiable */
  weeklyAccuracyPercent: 70,
  weeklyAccuracyMinQuestions: 30,
} as const;

/** Un día cuenta como de estudio si hubo al menos esto de actividad */
export const STUDY_DAY_MIN = { cards: 1, questions: 1, minutes: 5 } as const;

/** Familias de insignias con los umbrales de cada nivel, de menor a mayor. La racha usa su mejor valor */
export const BADGE_FAMILIES = {
  reviews: { tiers: [100, 1000, 5000, 20000] },
  answers: { tiers: [100, 500, 2000, 5000] },
  focus: { tiers: [600, 3000, 12000] },
  streak: { tiers: [3, 7, 30, 100] },
  level: { tiers: [3, 5, 10, 20, 30] },
  exams: { tiers: [1, 5, 15] },
  duels: { tiers: [1, 5, 20] },
  imports: { tiers: [1] },
  verifications: { tiers: [1, 10] },
  aiCards: { tiers: [1, 20] },
} as const;

export type BadgeFamily = keyof typeof BADGE_FAMILIES;
export const BADGE_FAMILY_KEYS = Object.keys(BADGE_FAMILIES) as BadgeFamily[];

/** Ligas por XP de la semana, de la más baja a la más alta. La semana va del lunes a las 4 a. m. */
export const LEAGUES = [
  { key: 'bronze', fromXp: 0 },
  { key: 'silver', fromXp: 150 },
  { key: 'gold', fromXp: 400 },
  { key: 'sapphire', fromXp: 700 },
  { key: 'ruby', fromXp: 1100 },
  { key: 'diamond', fromXp: 1600 },
] as const;

export type LeagueKey = (typeof LEAGUES)[number]['key'];
