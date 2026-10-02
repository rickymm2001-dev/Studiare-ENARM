// Alumno, consentimientos, suscripción simulada y puntaje oficial (6.2).
import { z } from 'zod';
import {
  CalendarDateSchema,
  ConsentPurposeSchema,
  DEFAULT_TIME_ZONE,
  IdSchema,
  RoleSchema,
  TimeZoneSchema,
  UtcDateTimeSchema,
} from './common';

/** Ajustes del alumno con los valores por defecto de la especificación */
export const UserSettingsSchema = z.strictObject({
  /** Retención deseada de FSRS, 0.90 por defecto, entre 0.80 y 0.97 (7.1) */
  desiredRetention: z.number().min(0.8).max(0.97).default(0.9),
  newCardsPerDay: z.int().min(0).max(500).default(20),
  reviewsPerDay: z.int().min(0).max(5000).default(200),
  /** Paso de confianza antes de revelar en tarjetas. Se puede apagar para modo rápido (7.1) */
  cardConfidenceStep: z.boolean().default(true),
  /** Resaltado de negaciones. Encendido en práctica y apagado en examen completo (7.5) */
  negationHighlightPractice: z.boolean().default(true),
  negationHighlightExam: z.boolean().default(false),
  /** Errores de práctica y examen entran a la cola de repaso (7.1) */
  errorsToReview: z.boolean().default(true),
  /** Opciones mostradas por pregunta, 4 por defecto (7.8, D-011) */
  optionsShown: z.int().min(2).max(10).default(4),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserSchema = z.strictObject({
  /** ID seudónimo. Es lo único que viaja al LLM (4.5) */
  id: IdSchema,
  alias: z.string().trim().min(1).max(40),
  role: RoleSchema,
  examDate: CalendarDateSchema.nullable(),
  dailyMinutes: z.int().min(5).max(720).nullable(),
  timeZone: TimeZoneSchema.default(DEFAULT_TIME_ZONE),
  settings: UserSettingsSchema,
  createdAt: UtcDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

export const ConsentSchema = z.strictObject({
  id: IdSchema,
  userId: IdSchema,
  purpose: ConsentPurposeSchema,
  noticeVersion: z.string().min(1).max(20),
  status: z.enum(['granted', 'revoked']),
  decidedAt: UtcDateTimeSchema,
});
export type Consent = z.infer<typeof ConsentSchema>;

export const SubscriptionSchema = z.strictObject({
  userId: IdSchema,
  plan: z.enum(['free', 'monthly', 'annual']),
  status: z.enum(['none', 'active', 'canceled']),
  /** Todo pago del prototipo es simulado (3.2) */
  isSimulated: z.literal(true),
  updatedAt: UtcDateTimeSchema,
});
export type Subscription = z.infer<typeof SubscriptionSchema>;

export const OfficialScoreSchema = z.strictObject({
  userId: IdSchema,
  year: z.int().min(2000).max(2100),
  score: z.number().min(0).max(100),
  consentId: IdSchema,
  submittedAt: UtcDateTimeSchema,
});
export type OfficialScore = z.infer<typeof OfficialScoreSchema>;
