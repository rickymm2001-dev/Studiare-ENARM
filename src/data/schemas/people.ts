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
  /** Intervalo máximo de Bien en días con compresión suave. null es sin tope (D-064, D-067) */
  maxIntervalDays: z.int().min(1).max(3650).nullable().default(21),
  /** Qué tan lejos sale la tarjeta con cada botón respecto a FSRS. 1 es lo recomendado (D-067) */
  spacing: z
    .strictObject({
      hard: z.number().min(0.25).max(3),
      good: z.number().min(0.25).max(3),
      easy: z.number().min(0.25).max(3),
    })
    .default({ hard: 1, good: 1, easy: 1 }),
  newCardsPerDay: z.int().min(0).max(500).default(20),
  reviewsPerDay: z.int().min(0).max(5000).default(200),
  /**
   * Preguntar la seguridad antes de ver la respuesta, en tarjetas y en preguntas. Apagado por
   * defecto para estudiar más rápido (D-087). Quien lo enciende alimenta las lecturas de confianza
   */
  cardConfidenceStep: z.boolean().default(false),
  /** Cuándo ver la retroalimentación de la práctica. Al final de la sesión o tras cada pregunta (D-087) */
  practiceFeedback: z.enum(['end', 'each']).default('end'),
  /** Resaltado de negaciones. Encendido en práctica y apagado en examen completo (7.5) */
  negationHighlightPractice: z.boolean().default(true),
  negationHighlightExam: z.boolean().default(false),
  /** Errores de práctica y examen entran a la cola de repaso (7.1) */
  errorsToReview: z.boolean().default(true),
  /** Opciones mostradas por pregunta, 4 por defecto (7.8, D-011) */
  optionsShown: z.int().min(2).max(10).default(4),
  /** Ramas que estudia, elegidas en el onboarding (10.1) */
  branches: z
    .array(z.string().min(1).max(60))
    .max(10)
    .default(['internal_medicine', 'pediatrics', 'obstetrics_gynecology', 'general_surgery']),
  /** Meta mínima diaria de la racha (9.4) */
  dailyGoal: z
    .strictObject({
      metric: z.enum(['cards', 'questions', 'focusMinutes']),
      value: z.int().min(1).max(1000),
    })
    .default({ metric: 'cards', value: 20 }),
  /** Mazos precargados que sigue, por clave del mazo (3.1) */
  followedDecks: z.array(z.string().min(1).max(60)).max(50).default([]),
  /** Pomodoro configurable (9.2) */
  pomodoro: z
    .strictObject({
      focusMinutes: z.int().min(1).max(180),
      shortBreakMinutes: z.int().min(1).max(60),
      longBreakMinutes: z.int().min(1).max(90),
      cyclesBeforeLong: z.int().min(1).max(12),
      sound: z.boolean(),
      notifications: z.boolean(),
    })
    .default({
      focusMinutes: 25,
      shortBreakMinutes: 5,
      longBreakMinutes: 15,
      cyclesBeforeLong: 4,
      sound: true,
      notifications: false,
    }),
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

/**
 * Datos de cuenta del alumno (D-068). Viven aparte de User para que nunca viajen a la IA ni a
 * Party. Solo el correo es obligatorio. El resto es opcional y sirve para conocer el mercado y
 * ajustar el plan
 */
export const AccountSchema = z.strictObject({
  userId: IdSchema,
  email: z.email().max(254),
  birthYear: z.int().min(1940).max(2010).nullable(),
  sex: z.enum(['female', 'male', 'other', 'undisclosed']).nullable(),
  /** Clave de la entidad federativa, por ejemplo YUC */
  state: z
    .string()
    .regex(/^[A-Z]{2,4}$/)
    .nullable(),
  situation: z.enum(['internship', 'social_service', 'graduated', 'working', 'other']).nullable(),
  /** Intento en el ENARM. 1 es la primera vez */
  attempt: z.int().min(1).max(10).nullable(),
  /** Clave de la especialidad objetivo de src/config/specialties.ts */
  targetSpecialty: z
    .string()
    .regex(/^[a-z_]{2,48}$/)
    .nullable(),
  /** Foto de perfil. initials, un avatar generado por su semilla o una foto propia comprimida */
  avatar: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('initials') }),
    z.strictObject({ kind: z.literal('generated'), seed: z.string().min(1).max(40) }),
    z.strictObject({
      kind: z.literal('photo'),
      dataUrl: z.string().startsWith('data:image/jpeg;base64,').max(400_000),
    }),
  ]),
  updatedAt: UtcDateTimeSchema,
});
export type Account = z.infer<typeof AccountSchema>;

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
