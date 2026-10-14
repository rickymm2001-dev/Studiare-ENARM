// Alumno, consentimientos, suscripción simulada y puntaje oficial (6.2).
import { z } from 'zod';
import { HEARD_FROM_CHANNELS, INFLUENCER_CODE } from '../../config/signup';
import { EASY_DAY_LEVELS, NO_EASY_DAYS } from '../../engines/easyDays';
import {
  CalendarDateSchema,
  ConsentPurposeSchema,
  DEFAULT_TIME_ZONE,
  IdSchema,
  RoleSchema,
  TimeZoneSchema,
  UtcDateTimeSchema,
} from './common';

/** Máximo de tarjetas nuevas por día que acepta el ajuste. Sin límite se guarda aparte */
export const MAX_NEW_CARDS_PER_DAY = 500;

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
  newCardsPerDay: z.int().min(0).max(MAX_NEW_CARDS_PER_DAY).default(20),
  reviewsPerDay: z.int().min(0).max(5000).default(200),
  /**
   * Sin límite de tarjetas nuevas por día. Apagado por defecto y se enciende con un aviso, porque
   * muchas nuevas juntas se vuelven una avalancha de repasos (D-085, fila 6)
   */
  unlimitedNewCards: z.boolean().default(false),
  /**
   * Temporizador de tarjeta, apagado por defecto para no subir la ansiedad (D-085, fila 8). Con él
   * encendido muestra cuánto tiempo sugerido queda y, si autoReveal está encendido, muestra la
   * respuesta al acabarse
   */
  cardTimer: z
    .strictObject({
      enabled: z.boolean(),
      seconds: z.int().min(5).max(300),
      autoReveal: z.boolean(),
    })
    .default({ enabled: false, seconds: 30, autoReveal: false }),
  /** Días fáciles. Todos normales por defecto (D-085, fila 7) */
  easyDays: z
    .strictObject({
      mon: z.enum(EASY_DAY_LEVELS),
      tue: z.enum(EASY_DAY_LEVELS),
      wed: z.enum(EASY_DAY_LEVELS),
      thu: z.enum(EASY_DAY_LEVELS),
      fri: z.enum(EASY_DAY_LEVELS),
      sat: z.enum(EASY_DAY_LEVELS),
      sun: z.enum(EASY_DAY_LEVELS),
    })
    .default({ ...NO_EASY_DAYS }),
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

/** Cómo empieza la foto de perfil guardada, un JPEG en base64 */
export const AVATAR_DATA_URL_PREFIX = 'data:image/jpeg;base64,';
/** Lo más que mide la foto como dataUrl. Unos 300 KB de JPEG, que caben en la fila y en el bucket */
export const AVATAR_DATA_URL_MAX = 400_000;

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
  /**
   * Foto de perfil. initials o una foto propia recortada en círculo y comprimida. generated son los
   * avatares médicos de D-068, que B2 quitó. Se sigue aceptando para leer cuentas viejas y se ve
   * como iniciales
   */
  avatar: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('initials') }),
    z.strictObject({ kind: z.literal('generated'), seed: z.string().min(1).max(40) }),
    z.strictObject({
      kind: z.literal('photo'),
      dataUrl: z.string().startsWith(AVATAR_DATA_URL_PREFIX).max(AVATAR_DATA_URL_MAX),
    }),
  ]),
  /**
   * Cuándo eligió el alumno su foto o sus iniciales. Cambia solo cuando guarda una elección distinta
   * en Tus datos, y al tomar la elección de la nube se copia la fecha de allá. Entre dispositivos
   * gana la más reciente (B2). Falta en cuentas que nunca eligieron, que no la conocen
   */
  avatarChangedAt: UtcDateTimeSchema.optional(),
  /**
   * Cuándo guardó el alumno sus datos opcionales (año de nacimiento, sexo, estado, situación, intento
   * y especialidad). Entre dispositivos gana la versión más reciente, y una cuenta sin fecha nunca
   * borra en la nube lo que otro dispositivo ya guardó (H29, B9). Falta si nunca los guardó aquí
   */
  detailsChangedAt: UtcDateTimeSchema.optional(),
  /**
   * Los datos opcionales vienen del registro (Crear cuenta, Completa tu registro o agregar el correo a
   * un perfil viejo), sin fecha, y todavía no se juntan con la nube. En la siguiente sincronización
   * entran campo por campo, sin mandar vacíos ni pisar lo que la nube ya tiene, y la marca se quita.
   * Guardar en Tus datos también la quita, porque desde ahí los datos llevan su fecha (H29, B9)
   */
  detailsFromSignup: z.literal(true).optional(),
  /** Cuándo confirmó que tiene la edad mínima para crear la cuenta (pregunta 45, B9) */
  adultConfirmedAt: UtcDateTimeSchema.optional(),
  /**
   * Cómo nos conoció, opcional (respuesta 22, B9). Se manda una sola vez a la tabla privada de la
   * nube, y recordedAt dice cuándo, para no volver a mandarla. Nunca va a la analítica
   */
  heardFrom: z
    .strictObject({
      channel: z.enum(HEARD_FROM_CHANNELS),
      influencerCode: z.string().regex(INFLUENCER_CODE).nullable(),
      answeredAt: UtcDateTimeSchema,
      recordedAt: UtcDateTimeSchema.optional(),
    })
    .optional(),
  updatedAt: UtcDateTimeSchema,
});
export type Account = z.infer<typeof AccountSchema>;

/** Los datos opcionales que viajan juntos con detailsChangedAt. La foto va aparte, con su propia fecha */
export const ACCOUNT_DETAIL_KEYS = [
  'birthYear',
  'sex',
  'state',
  'situation',
  'attempt',
  'targetSpecialty',
] as const satisfies readonly (keyof Account)[];
export type AccountDetailKey = (typeof ACCOUNT_DETAIL_KEYS)[number];

export const ConsentSchema = z.strictObject({
  id: IdSchema,
  userId: IdSchema,
  purpose: ConsentPurposeSchema,
  noticeVersion: z.string().min(1).max(20),
  status: z.enum(['granted', 'revoked']),
  decidedAt: UtcDateTimeSchema,
});
export type Consent = z.infer<typeof ConsentSchema>;

/** Un cobro que espera su pago, como una ficha OXXO o una transferencia SPEI (B10, my_plan v2) */
export const PendingPaymentSchema = z.strictObject({
  method: z.enum(['oxxo', 'spei', 'mercadopago']),
  plan: z.enum(['monthly', 'annual']).nullable(),
  amountMxn: z.number().nonnegative(),
  /** Vencimiento de la ficha OXXO. null en SPEI y Mercado Pago */
  expiresAt: UtcDateTimeSchema.nullable(),
  createdAt: UtcDateTimeSchema,
});
export type PendingPayment = z.infer<typeof PendingPaymentSchema>;

export const SubscriptionSchema = z.strictObject({
  userId: IdSchema,
  plan: z.enum(['free', 'founder', 'founder_annual', 'monthly', 'annual']),
  /**
   * active en todo plan vigente, también en la prueba gratis, un pase o una suscripción cancelada que
   * vale hasta el fin del periodo. Así planOf y los candados lo leen igual (B8). El estado de la
   * pasarela va en cloudStatus
   */
  status: z.enum(['none', 'active', 'canceled']),
  /**
   * true en el pago simulado local (3.2). false cuando el plan viene de la nube, ya verificado por el
   * servidor con el aviso de la pasarela (Fase P bloque 5, D-096)
   */
  isSimulated: z.boolean(),
  /** Hasta cuándo vale el plan que dio el servidor. Ausente en el simulado local */
  periodEnd: UtcDateTimeSchema.nullable().optional(),
  /**
   * De dónde viene el plan que dio el servidor, un pago, un pase de un solo pago o un mes regalado por
   * referido. Con un pago vigente no se ofrece otro (D-118). Ausente en el simulado local y en Gratis
   */
  source: z.enum(['payment', 'pass', 'referral']).optional(),
  // Lo demás de my_plan v2 (B10). Solo con la nube y solo cuando el servidor lo manda
  /** Estado de la suscripción en la pasarela, aunque ya no esté vigente */
  cloudStatus: z.enum(['trialing', 'active', 'past_due', 'canceled']).optional(),
  provider: z.enum(['stripe', 'mercadopago']).optional(),
  /** Fin de la prueba gratis mientras dura */
  trialEnd: UtcDateTimeSchema.optional(),
  /** Canceló y vale hasta el fin del periodo o de la prueba */
  cancelAtPeriodEnd: z.boolean().optional(),
  /** Bajada de plan programada en el portal para el fin del periodo */
  scheduledChange: z.boolean().optional(),
  /** Fin acumulado de los pases activos */
  passEnd: UtcDateTimeSchema.optional(),
  /** Si el servidor le daría la prueba gratis al pagar con tarjeta */
  trialAvailable: z.boolean().optional(),
  /** Hasta cuándo puede pedir el reembolso completo */
  guaranteeUntil: UtcDateTimeSchema.optional(),
  pendingPayment: PendingPaymentSchema.optional(),
  /** Aviso de 72 horas sobre un pago que se canceló o una ficha que venció */
  issue: z
    .enum(['founder_full', 'trial_duplicate', 'second_subscription', 'voucher_expired'])
    .optional(),
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
