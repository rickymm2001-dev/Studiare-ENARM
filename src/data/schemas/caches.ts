// Cachés derivadas de la bitácora. Se pueden borrar y reconstruir en cualquier momento (6.1).
import { z } from 'zod';
import { FsrsCardStateSchema, IdSchema, UtcDateTimeSchema } from './common';

export const CardStateCacheSchema = z.strictObject({
  cardId: IdSchema,
  userId: IdSchema,
  fsrs: FsrsCardStateSchema,
  /** Sanguijuela desde 8 lapsos (7.1) */
  isLeech: z.boolean(),
  updatedAt: UtcDateTimeSchema,
});
export type CardStateCache = z.infer<typeof CardStateCacheSchema>;

export const ItemStatsCacheSchema = z.strictObject({
  questionVersionId: IdSchema,
  responses: z.int().nonnegative(),
  correct: z.int().nonnegative(),
  eloDifficulty: z.number(),
  raschDifficulty: z.number().nullable(),
  /** Estimada por médico, provisional desde 30 y calibrada desde 100 respuestas (7.7) */
  calibration: z.enum(['physician_estimate', 'provisional', 'calibrated']),
  /** Exposiciones y elecciones por versión de opción, para el análisis de distractores (7.8) */
  optionStats: z.record(
    z.string(),
    z.strictObject({ exposures: z.int().nonnegative(), choices: z.int().nonnegative() }),
  ),
  updatedAt: UtcDateTimeSchema,
});
export type ItemStatsCache = z.infer<typeof ItemStatsCacheSchema>;

export const UserAbilityCacheSchema = z.strictObject({
  userId: IdSchema,
  elo: z.number(),
  responses: z.int().nonnegative(),
  updatedAt: UtcDateTimeSchema,
});
export type UserAbilityCache = z.infer<typeof UserAbilityCacheSchema>;

/** Derivación de ejemplo de la Fase A. Suma de xp_awarded. El motor de XP llega en la Fase B */
export const XpCacheSchema = z.strictObject({
  userId: IdSchema,
  totalXp: z.int().nonnegative(),
  awards: z.int().nonnegative(),
  lastEventId: IdSchema.nullable(),
  lastEventAt: UtcDateTimeSchema.nullable(),
});
export type XpCache = z.infer<typeof XpCacheSchema>;

export const StreakCacheSchema = z.strictObject({
  userId: IdSchema,
  current: z.int().nonnegative(),
  best: z.int().nonnegative(),
  /** Un congelador por cada 7 días, máximo 2 guardados (9.4) */
  freezesAvailable: z.int().min(0).max(2),
  lastClosedDay: z.iso.date().nullable(),
  updatedAt: UtcDateTimeSchema,
});
export type StreakCache = z.infer<typeof StreakCacheSchema>;
