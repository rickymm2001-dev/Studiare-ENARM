// Misiones del día y de la semana (Fase P bloque 6). Las insignias y las ligas se quitaron con Logros
// en B3 del plan del cambio (comentario 14). Todos los números son provisionales y se ajustan aquí,
// sin tocar el motor. Ricardo todavía no los confirma. Las misiones no dan XP extra, para no inflar el
// XP que ya sale de la bitácora. Marcan el avance del día y de la semana.

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
