/**
 * Contratos de los motores de IA (8.1 a 8.6, D-098).
 *
 * Qué hace. Define, con zod, lo que cada motor de IA recibe y lo que puede devolver. El cliente, el
 * servidor, el simulado y las evaluaciones usan estos mismos esquemas, así ninguno inventa su propio
 * formato. Una salida que no cumple el esquema nunca llega al alumno.
 * Entradas. Ninguna. Son definiciones.
 * Salidas. Esquemas de petición y de respuesta por motor, la envoltura común y los códigos de error.
 * Método. Cada petición viaja en una envoltura con el alumno seudónimo y la versión del prompt. Todo
 * texto que viaja es del banco o del material del alumno, nunca nombres ni correos. Las respuestas
 * son estrictas. Un campo de más o una lista cerrada con un valor de más la rechaza. La confianza de
 * una hipótesis es baja o media y nunca alta. Sin importaciones de la app, para que el servidor lo
 * cargue por ruta relativa.
 * Umbrales. Tamaños máximos de entrada por motor en AI_INPUT_LIMITS y de lista en cada esquema.
 */
import { z } from 'zod';

export const AI_ENGINES = [
  'forgetting',
  'weekly_report',
  'flashcards',
  'bias_tips',
  'restructure',
] as const;
export type AiEngine = (typeof AI_ENGINES)[number];

export const AiEngineSchema = z.enum(AI_ENGINES);

/** Tipo de artefacto que guarda la app para cada motor */
export const ENGINE_ARTIFACT_KIND = {
  forgetting: 'hypothesis',
  weekly_report: 'weekly_report',
  flashcards: 'flashcard',
  bias_tips: 'bias_tip',
  restructure: 'restructured_question',
} as const satisfies Record<AiEngine, string>;

/** Acciones que la app sabe ejecutar. Lista cerrada de 8.2 */
export const TUTOR_ACTIONS = [
  'create_contrast_card',
  'split_card',
  'review_explanation',
  'subtopic_simulator',
  'enable_highlight',
  'suggest_break',
] as const;
export const TutorActionNameSchema = z.enum(TUTOR_ACTIONS);

/** Reglas de olvido que pueden formar una hipótesis. El olvido esperado nunca la forma (7.9) */
export const HYPOTHESIS_RULES = [
  'persistent_lapse',
  'list_card',
  'interference',
  'high_confidence_error',
  'misreading',
  'fatigue',
  'rushing',
  'foundation_gap',
] as const;

/** Un ID de evento, pregunta o tarjeta. Sin espacios, para que no cuele texto libre */
const RefSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const ShortText = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------------------------
// Entradas por motor

export const HypothesisInputSchema = z.strictObject({
  rule: z.enum(HYPOTHESIS_RULES),
  area: ShortText(80),
  recentFindings: z.int().min(0).max(1000),
  /** Los ítems del banco que forman el patrón, con su texto */
  evidence: z
    .array(
      z.strictObject({
        ref: RefSchema,
        kind: z.enum(['question', 'card']),
        text: ShortText(800),
      }),
    )
    .min(1)
    .max(12),
  causesReported: z.int().min(0).max(1000),
  causeMismatches: z.int().min(0).max(1000),
  /** Las acciones que la app puede ejecutar para esta regla */
  allowedActions: z.array(TutorActionNameSchema).max(6),
});
export type HypothesisInput = z.infer<typeof HypothesisInputSchema>;

const ReportLineInputSchema = z.strictObject({
  ref: RefSchema,
  title: ShortText(120),
  detail: ShortText(300),
});

export const WeeklyReportInputSchema = z.strictObject({
  /** Respuestas de la semana, para dar la cifra sin inventarla */
  answers: z.int().min(0).max(100_000),
  priorities: z.array(ReportLineInputSchema).min(1).max(3),
  habit: ReportLineInputSchema.nullable(),
  challenge: ReportLineInputSchema.nullable(),
});
export type WeeklyReportInput = z.infer<typeof WeeklyReportInputSchema>;

export const FlashcardsInputSchema = z.strictObject({
  title: z.string().trim().max(200).nullable(),
  text: ShortText(2_000),
});
export type FlashcardsInput = z.infer<typeof FlashcardsInputSchema>;

export const BiasTipInputSchema = z.strictObject({
  biasKey: ShortText(60),
  biasLabel: ShortText(80),
  /** El texto base, borrador pendiente de revisión médica (8.5) */
  baseTip: ShortText(500),
  /** De 2 a 3 preguntas reales donde el alumno cayó */
  examples: z
    .array(z.strictObject({ ref: RefSchema, text: ShortText(600) }))
    .min(2)
    .max(3),
});
export type BiasTipInput = z.infer<typeof BiasTipInputSchema>;

export const RESTRUCTURE_TRANSFORMS = ['to_except', 'change_anchor', 'next_step'] as const;
const QuestionOptionSchema = z.strictObject({
  label: z.string().trim().min(1).max(3),
  text: ShortText(400),
  isKey: z.boolean(),
});
export const RestructureInputSchema = z.strictObject({
  questionRef: RefSchema,
  transform: z.enum(RESTRUCTURE_TRANSFORMS),
  stem: ShortText(1_500),
  options: z.array(QuestionOptionSchema).min(2).max(10),
  explanation: ShortText(2_000),
});
export type RestructureInput = z.infer<typeof RestructureInputSchema>;

// ---------------------------------------------------------------------------------------------
// Salidas por motor

export const HypothesisOutputSchema = z.strictObject({
  /** Sin hipótesis es null. Si la evidencia no alcanza, esa es la respuesta correcta (8.2) */
  hypothesis: z.string().trim().min(1).max(280).nullable(),
  evidence: z.array(RefSchema).max(12),
  /** Nunca alta (8.2) */
  confidence: z.enum(['low', 'medium']),
  actions: z.array(TutorActionNameSchema).max(3),
  studentMessage: z.string().trim().min(1).max(500).nullable(),
});
export type HypothesisOutput = z.infer<typeof HypothesisOutputSchema>;

export const WeeklyReportOutputSchema = z.strictObject({
  summary: ShortText(400),
  priorities: z
    .array(z.strictObject({ ref: RefSchema, text: ShortText(300) }))
    .min(1)
    .max(3),
  habit: z.string().trim().min(1).max(300).nullable(),
  challenge: z.string().trim().min(1).max(300).nullable(),
});
export type WeeklyReportOutput = z.infer<typeof WeeklyReportOutputSchema>;

export const FlashcardsOutputSchema = z.strictObject({
  cards: z
    .array(
      z.strictObject({
        kind: z.enum(['basic', 'cloze']),
        front: z.string().min(1).max(3000),
        back: z.string().max(3000),
        quote: z.string().min(1).max(2000),
        controversy: z
          .strictObject({
            reason: z.string().max(1000),
            sources: z
              .array(
                z.strictObject({
                  key: z.string().max(40),
                  locator: z.string().max(120).nullable().optional(),
                }),
              )
              .max(5),
          })
          .nullable()
          .optional(),
      }),
    )
    .max(10),
});
export type FlashcardsOutput = z.infer<typeof FlashcardsOutputSchema>;

export const BiasTipOutputSchema = z.strictObject({
  tip: ShortText(600),
  exampleRefs: z.array(RefSchema).min(2).max(3),
});
export type BiasTipOutput = z.infer<typeof BiasTipOutputSchema>;

export const RestructureOutputSchema = z.strictObject({
  stem: ShortText(1_500),
  options: z.array(QuestionOptionSchema).min(2).max(10),
  explanation: ShortText(2_000),
  /** Qué cambió respecto a la pregunta original, para quien la revisa */
  rationale: ShortText(400),
  /** Frase de la explicación original que respalda la nueva clave */
  quote: ShortText(1_000),
});
export type RestructureOutput = z.infer<typeof RestructureOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Por motor

export interface EngineContract<I, O> {
  input: z.ZodType<I>;
  output: z.ZodType<O>;
}

export const ENGINE_CONTRACTS = {
  forgetting: { input: HypothesisInputSchema, output: HypothesisOutputSchema },
  weekly_report: { input: WeeklyReportInputSchema, output: WeeklyReportOutputSchema },
  flashcards: { input: FlashcardsInputSchema, output: FlashcardsOutputSchema },
  bias_tips: { input: BiasTipInputSchema, output: BiasTipOutputSchema },
  restructure: { input: RestructureInputSchema, output: RestructureOutputSchema },
} as const;

export interface EngineInputs {
  forgetting: HypothesisInput;
  weekly_report: WeeklyReportInput;
  flashcards: FlashcardsInput;
  bias_tips: BiasTipInput;
  restructure: RestructureInput;
}
export interface EngineOutputs {
  forgetting: HypothesisOutput;
  weekly_report: WeeklyReportOutput;
  flashcards: FlashcardsOutput;
  bias_tips: BiasTipOutput;
  restructure: RestructureOutput;
}

/** Caracteres de texto que puede traer una petición de cada motor, sumando todos sus campos */
export const AI_INPUT_LIMITS: Readonly<Record<AiEngine, number>> = {
  forgetting: 9_000,
  weekly_report: 2_500,
  flashcards: 2_300,
  bias_tips: 2_500,
  restructure: 6_500,
};

// ---------------------------------------------------------------------------------------------
// Envoltura común

/** Alumno seudónimo. Un ULID o un UUID, nunca un nombre ni un correo */
export const StudentRefSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

export const PROMPT_VERSION_PATTERN = /^[a-z_]+\.[a-z0-9]+\.v\d+$/;
export const PromptVersionSchema = z.string().regex(PROMPT_VERSION_PATTERN).max(40);

export const AiRequestSchema = z.strictObject({
  studentRef: StudentRefSchema,
  promptVersion: PromptVersionSchema,
  /** Nombres del perfil que no pueden aparecer en el texto. El servidor los usa para bloquear y no los guarda */
  blockedNames: z.array(z.string().trim().min(3).max(80)).max(5).optional(),
  input: z.unknown(),
});
export type AiRequest = z.infer<typeof AiRequestSchema>;

export const AI_OUTCOMES = ['ok', 'retried_ok', 'fallback', 'error'] as const;

export const AiCallMetaSchema = z.strictObject({
  engine: AiEngineSchema,
  mode: z.enum(['real', 'mock']),
  model: z.string().min(1).max(80),
  promptVersion: z.string().min(1).max(40),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  cacheWriteTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  latencyMs: z.int().nonnegative(),
  outcome: z.enum(['ok', 'retried_ok']),
  validator: z.strictObject({
    passed: z.boolean(),
    issues: z.array(z.string().max(200)).max(50),
  }),
});
export type AiCallMeta = z.infer<typeof AiCallMetaSchema>;

export const AiSuccessSchema = z.strictObject({
  output: z.unknown(),
  meta: AiCallMetaSchema,
});

/** Por qué el proxy no atendió una petición. El mensaje se muestra tal cual al alumno */
export const AI_ERROR_CODES = [
  'invalid_request',
  'pii_blocked',
  'input_too_large',
  'student_limit',
  'budget_exceeded',
  'rate_limited',
  'invalid_output',
  'provider_error',
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];

export const AiErrorSchema = z.strictObject({
  error: z.enum(AI_ERROR_CODES),
  message: z.string().max(300),
  /** Lo que costó la llamada cuando llegó a hacerse y aun así no sirvió */
  cost: AiCallMetaSchema.omit({
    outcome: true,
    validator: true,
    engine: true,
    promptVersion: true,
    mode: true,
  }).optional(),
});
export type AiErrorBody = z.infer<typeof AiErrorSchema>;

/** Suma de los caracteres de texto de una entrada, para el límite de tamaño */
export function inputChars(value: unknown): number {
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + inputChars(item), 0);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).reduce((sum: number, item) => sum + inputChars(item), 0);
  }
  return 0;
}
