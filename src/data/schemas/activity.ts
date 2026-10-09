// Sesiones, hallazgos y patrones de olvido, IA, Party, widgets y SimTruth (6.2).
import { z } from 'zod';
import {
  AiArtifactKindSchema,
  ForgettingRuleSchema,
  IdSchema,
  JsonRecordSchema,
  SessionKindSchema,
  UtcDateTimeSchema,
} from './common';

export const SessionSchema = z.strictObject({
  id: IdSchema,
  userId: IdSchema,
  kind: SessionKindSchema,
  config: JsonRecordSchema,
  startedAt: UtcDateTimeSchema,
  endedAt: UtcDateTimeSchema.nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

/** Evidencia como IDs de eventos y de ítems reales, nunca texto libre (7.9) */
export const EvidenceSchema = z.strictObject({
  eventIds: z.array(IdSchema).max(200),
  itemIds: z.array(IdSchema).max(200),
});

export const FindingSchema = z.strictObject({
  id: IdSchema,
  userId: IdSchema,
  rule: ForgettingRuleSchema,
  /** Área del hallazgo, por ejemplo un subtema o una etiqueta de sesgo */
  area: z.string().min(1).max(80),
  evidence: EvidenceSchema,
  /** Si la causa que reportó el alumno coincide con las señales. null si no reportó (7.9) */
  causeMatchesSignals: z.boolean().nullable(),
  createdAt: UtcDateTimeSchema,
});
export type Finding = z.infer<typeof FindingSchema>;

export const PatternSchema = z.strictObject({
  id: IdSchema,
  userId: IdSchema,
  rule: ForgettingRuleSchema,
  area: z.string().min(1).max(80),
  /** confirmed desde 5 hallazgos en 14 días (7.9) */
  status: z.enum(['forming', 'confirmed', 'dismissed']),
  findingIds: z.array(IdSchema),
  confirmedAt: UtcDateTimeSchema.nullable(),
  /** Como máximo una llamada al LLM por patrón cada 7 días (8.2) */
  lastLlmCallAt: UtcDateTimeSchema.nullable(),
});
export type Pattern = z.infer<typeof PatternSchema>;

export const AiModeSchema = z.enum(['real', 'mock', 'template']);

export const AiArtifactSchema = z
  .strictObject({
    id: IdSchema,
    /** Alumno al que pertenece. null en artefactos para el médico, como preguntas reestructuradas */
    userId: IdSchema.nullable(),
    kind: AiArtifactKindSchema,
    /** Borrador primero (4.2) */
    status: z.enum(['draft', 'approved', 'edited', 'rejected']),
    mode: AiModeSchema,
    model: z.string().min(1).max(80),
    promptVersion: z.string().min(1).max(40),
    /** Contenido validado por el esquema de cada motor en la Fase D */
    content: JsonRecordSchema,
    validatorResult: z.strictObject({
      passed: z.boolean(),
      issues: z.array(z.string().max(500)).max(50),
    }),
    /** IDs del banco que anclan el texto (4.1) */
    sourceIds: z.array(IdSchema).max(50),
    createdAt: UtcDateTimeSchema,
    decidedAt: UtcDateTimeSchema.nullable(),
    decidedBy: IdSchema.nullable(),
  })
  // Salir de borrador pide quién decidió y cuándo (4.2)
  .refine(
    (artifact) =>
      artifact.status === 'draft' || (artifact.decidedAt !== null && artifact.decidedBy !== null),
    {
      message: 'Una decisión sobre un borrador guarda quién y cuándo',
      path: ['decidedBy'],
    },
  )
  // Nada que no pasó el validador de anclaje se aprueba (4.1)
  .refine(
    (artifact) =>
      !(artifact.status === 'approved' || artifact.status === 'edited') ||
      artifact.validatorResult.passed,
    {
      message: 'Solo se aprueba lo que pasó el validador',
      path: ['validatorResult'],
    },
  );
export type AiArtifact = z.infer<typeof AiArtifactSchema>;

export const AiCallLogSchema = z.strictObject({
  id: IdSchema,
  /** Alumno que hizo la llamada, para los límites por alumno. Ausente en llamadas viejas */
  userId: IdSchema.nullable().optional(),
  engine: z.enum(['forgetting', 'weekly_report', 'flashcards', 'bias_tips', 'restructure']),
  mode: AiModeSchema,
  model: z.string().min(1).max(80),
  at: UtcDateTimeSchema,
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  latencyMs: z.int().nonnegative(),
  outcome: z.enum(['ok', 'retried_ok', 'fallback', 'error']),
});
export type AiCallLog = z.infer<typeof AiCallLogSchema>;

/** Código de invitación de 6 caracteres (9.6) */
export const InviteCodeSchema = z.string().regex(/^[A-Z0-9]{6}$/);

export const GroupSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(60),
  inviteCode: InviteCodeSchema,
  ownerId: IdSchema,
  isSimulated: z.boolean(),
  createdAt: UtcDateTimeSchema,
});
export type Group = z.infer<typeof GroupSchema>;

export const MembershipSchema = z.strictObject({
  id: IdSchema,
  groupId: IdSchema,
  userId: IdSchema,
  /** Por defecto se comparte alias, XP, nivel y racha. Nada de exactitud ni sesgos (9.6) */
  alias: z.string().trim().min(1).max(40),
  isSimulated: z.boolean(),
  joinedAt: UtcDateTimeSchema,
  leftAt: UtcDateTimeSchema.nullable(),
});
export type Membership = z.infer<typeof MembershipSchema>;

export const ChallengeSchema = z
  .strictObject({
    id: IdSchema,
    groupId: IdSchema,
    kind: z.enum(['collective', 'duel']),
    title: z.string().trim().min(1).max(80),
    metric: z.enum(['cards', 'questions', 'xp', 'accuracy']),
    target: z.number().positive(),
    isSimulated: z.boolean(),
    startsAt: UtcDateTimeSchema,
    endsAt: UtcDateTimeSchema,
    /** Solo en duelos. La membresía del compañero al que se reta (9.6) */
    opponentId: IdSchema.optional(),
    /** Solo en duelos. Las preguntas que contestan los dos, fijadas al crear el duelo */
    questionIds: z.array(IdSchema).min(1).max(40).optional(),
  })
  .refine(
    (challenge) =>
      challenge.kind === 'duel'
        ? challenge.opponentId !== undefined && challenge.questionIds !== undefined
        : challenge.opponentId === undefined && challenge.questionIds === undefined,
    { message: 'Un duelo lleva rival y preguntas, y un reto colectivo no' },
  );
export type Challenge = z.infer<typeof ChallengeSchema>;

/** Los 12 widgets de 9.1 y los tres de logros (Fase P bloque 6) */
export const WidgetTypeSchema = z.enum([
  'heatmap',
  'pomodoro',
  'streak',
  'level_xp',
  'today',
  'weak_topics',
  'exam_countdown',
  'bias_pattern',
  'future_load',
  'daily_goal',
  'party_challenge',
  'latest_hypothesis',
  'missions',
  'league',
  'badges',
]);

export const WidgetLayoutSchema = z.strictObject({
  userId: IdSchema,
  preset: z.enum(['essential', 'analytic', 'competitive', 'custom']),
  widgets: z
    .array(
      z.strictObject({
        id: IdSchema,
        type: WidgetTypeSchema,
        settings: JsonRecordSchema,
      }),
    )
    .max(30),
  updatedAt: UtcDateTimeSchema,
});
export type WidgetLayout = z.infer<typeof WidgetLayoutSchema>;

/** Parámetros verdaderos de un alumno simulado. Solo en enarm_demo y solo para pruebas (11.2) */
export const SimTruthSchema = z.strictObject({
  userId: IdSchema,
  seed: z.string().min(1).max(80),
  generatorVersion: z.string().min(1).max(20),
  params: JsonRecordSchema,
});
export type SimTruth = z.infer<typeof SimTruthSchema>;
