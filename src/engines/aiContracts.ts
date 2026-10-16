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
 * B12. Aquí viven también los contratos entre paquetes de la IA real (contrato C1 de 8.5 del plan de
 * B12). La salud del proxy con su modo y la compuerta por motor, los trabajos por lote de hipótesis,
 * la generación de tarjetas con su número de sección, el vocabulario de sesgo o trampa y los esquemas
 * de la compuerta 1 (estado, reseña del médico y archivo de muestra). La Edge Function usa una copia
 * de este archivo que escribe npm run ai:sync.
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

/**
 * Motores que aceptan trabajos por lote con Message Batches (B12, 3.4). Las hipótesis van siempre por
 * lote. Las reestructuradas quedan listas para que B14 las encole de noche (10.15)
 */
export const BATCH_ENGINES = ['forgetting', 'restructure'] as const;
export type BatchEngine = (typeof BATCH_ENGINES)[number];
export const BatchEngineSchema = z.enum(BATCH_ENGINES);

/** Esfuerzo de razonamiento que acepta la API (output_config.effort). Qué modelo acepta cuál lo dice el servidor */
export const AI_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];
export const AiEffortSchema = z.enum(AI_EFFORTS);

/**
 * Razonamiento del modelo (B12, 2.8). adaptive deja que el modelo razone cuando lo necesita y off lo
 * apaga donde el modelo lo permite. null en la configuración es un modelo sin razonamiento
 * configurable, como Haiku 4.5
 */
export const AI_THINKING_MODES = ['adaptive', 'off'] as const;
export type AiThinking = (typeof AI_THINKING_MODES)[number];
export const AiThinkingSchema = z.enum(AI_THINKING_MODES);

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

/**
 * Cómo llama la app a los sesgos ante el alumno (D-099, 4.4 y 7.11). Mientras el acuerdo entre
 * médicos no alcanza la app dice trampas, y la IA tampoco puede decir sesgo (B12, 10.14)
 */
export const BIAS_VOCABULARIES = ['sesgo', 'trampa'] as const;
export type BiasVocabulary = (typeof BIAS_VOCABULARIES)[number];
export const BiasVocabularySchema = z.enum(BIAS_VOCABULARIES);
/** El vocabulario de una entrada que no lo trae. Es el que usa la app mientras no hay acuerdo medido */
export const DEFAULT_BIAS_VOCABULARY: BiasVocabulary = 'trampa';

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
  /**
   * El vocabulario que ve el alumno (B12). Opcional para que las entradas de antes de B12 sigan
   * siendo válidas. Si falta cuenta como DEFAULT_BIAS_VOCABULARY
   */
  vocabulary: BiasVocabularySchema.optional(),
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

/** Secciones de una generación de tarjetas. Igual a SECTIONS_PER_GENERATION de la app (B12, 2.4) */
export const MAX_GENERATION_SECTIONS = 12;

/**
 * Una generación de tarjetas, igual en todas sus secciones (B12, 2.4 y 3.2). Con la misma forma que
 * acepta la columna ai_generations.generation_ref, así que es más estricta que una ref común
 */
export const GenerationRefSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
export const AiGenerationSchema = z.strictObject({
  ref: GenerationRefSchema,
  /** Número de la sección dentro de la generación, desde 0 */
  section: z
    .int()
    .min(0)
    .max(MAX_GENERATION_SECTIONS - 1),
});
export type AiGeneration = z.infer<typeof AiGenerationSchema>;

export const AiRequestSchema = z.strictObject({
  studentRef: StudentRefSchema,
  promptVersion: PromptVersionSchema,
  /** Nombres del perfil que no pueden aparecer en el texto. El servidor los usa para bloquear y no los guarda */
  blockedNames: z.array(z.string().trim().min(3).max(80)).max(5).optional(),
  input: z.unknown(),
  /** Solo en tarjetas (B12). El servidor cuenta generaciones por día y secciones por generación */
  generation: AiGenerationSchema.optional(),
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
  // Solo en el proxy alojado. Sin sesión válida o desde un dispositivo que ya no es el activo
  'unauthorized',
  // Solo en el proxy alojado. La IA es de los planes de pago para los alumnos
  'plan_required',
  // B12. El motor sigue cerrado para alumnos hasta pasar la compuerta 1, o cambió su modelo o su prompt
  'gate_closed',
  // B12. Solo médicos, admins y dueño, como las preguntas reestructuradas
  'staff_only',
  // B12. El modelo se negó a contestar (stop_reason refusal). No se reintenta
  'refused',
  // B12. Llegó al tope de generaciones de tarjetas de hoy o de secciones de una generación
  'generation_limit',
  // B12. La función no tiene clave de IA ni permiso de respuestas simuladas
  'not_configured',
  // B12. La IA está en pausa para todos salvo admin y dueño
  'paused',
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

// ---------------------------------------------------------------------------------------------
// Salud del proxy (B12, 2.1 y 5.5)

/** Estado de un motor para alumnos. gated es cerrado por la compuerta 1 */
export const AI_ENGINE_GATES = ['open', 'gated'] as const;
export type AiEngineGate = (typeof AI_ENGINE_GATES)[number];

/** GET /health. No estricto, para tolerar campos futuros */
export const AiHealthSchema = z.object({
  status: z.literal('ok'),
  /** unavailable es sin clave y sin permiso de respuestas simuladas (2.9) */
  mode: z.enum(['real', 'mock', 'unavailable']),
  version: z.int(),
  /** Solo la Edge Function. Un motor que falta cuenta como cerrado */
  engines: z.partialRecord(AiEngineSchema, z.enum(AI_ENGINE_GATES)).optional(),
});
export type AiHealth = z.infer<typeof AiHealthSchema>;

// ---------------------------------------------------------------------------------------------
// Trabajos por lote (B12, 3.4)

/** La llave de un trabajo, que la app arma sin texto, como fgt_ más 32 caracteres hexadecimales */
export const JobKeySchema = z.string().regex(/^[a-z0-9_-]{8,64}$/);

/** POST /ai/jobs/:engine. El sobre de siempre más la llave del trabajo */
export const AiJobRequestSchema = AiRequestSchema.extend({ jobKey: JobKeySchema });
export type AiJobRequest = z.infer<typeof AiJobRequestSchema>;

/** POST /ai/jobs/status. Hasta 20 trabajos propios a la vez */
export const MAX_JOB_STATUS_KEYS = 20;
export const AiJobStatusRequestSchema = z.strictObject({
  jobKeys: z.array(JobKeySchema).min(1).max(MAX_JOB_STATUS_KEYS),
});
export type AiJobStatusRequest = z.infer<typeof AiJobStatusRequestSchema>;

export const AI_JOB_STATUSES = ['queued', 'running', 'ready', 'failed'] as const;
export type AiJobState = (typeof AI_JOB_STATUSES)[number];

/**
 * Un trabajo como lo ve la app. POST /ai/jobs/:engine contesta uno (202 si quedó en cola, 200 si ya
 * estaba listo) y POST /ai/jobs/status una lista en AiJobStatusResponseSchema. La salida llega sin
 * validar contra el esquema del motor. La app la vuelve a validar con la entrada que guardó
 */
export const AiJobStatusSchema = z.strictObject({
  jobKey: JobKeySchema,
  engine: AiEngineSchema,
  status: z.enum(AI_JOB_STATUSES),
  output: z.unknown().optional(),
  meta: AiCallMetaSchema.optional(),
  error: z.enum(AI_ERROR_CODES).optional(),
  message: z.string().max(300).optional(),
  queuedAt: z.string(),
  readyAt: z.string().nullable(),
});
export type AiJobStatus = z.infer<typeof AiJobStatusSchema>;

/** Respuesta de POST /ai/jobs/status. Los trabajos que no son del alumno o no existen no aparecen */
export const AiJobStatusResponseSchema = z.strictObject({
  jobs: z.array(AiJobStatusSchema).max(MAX_JOB_STATUS_KEYS),
});
export type AiJobStatusResponse = z.infer<typeof AiJobStatusResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Compuerta 1 (B12, 5.2, 5.5 y 6.3). Nombres y valores en inglés, como el resto del código. Entre
// paréntesis, el nombre de la rúbrica del plan

/** Huella SHA-256 en hexadecimal */
export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** Identificador de una muestra de la compuerta, como b12-2026-10 */
export const GateSampleIdSchema = z.string().regex(/^[a-z0-9_-]{4,64}$/);

/**
 * Cómo quedó auditado un motor. promptHash es el SHA-256 en hexadecimal del texto del prompt del
 * motor tal como va en el system (PromptSet.text, en UTF-8)
 */
export const AiGateEngineStateSchema = z.object({
  open: z.boolean(),
  model: z.string().min(1).max(80),
  effort: AiEffortSchema.nullable(),
  thinking: AiThinkingSchema.nullable(),
  promptVersion: PromptVersionSchema,
  promptHash: Sha256HexSchema,
  sampleId: GateSampleIdSchema,
  /** Cuándo se abrió o se cerró, en ISO 8601 */
  at: z.string().min(1).max(40),
});
export type AiGateEngineState = z.infer<typeof AiGateEngineStateSchema>;

/**
 * La bandera que deja ver la IA a los alumnos (5.5), en platform_settings con la clave ai_gate. Solo
 * la cambian admin_ai_gate_set y admin_ai_pause. Un motor que no aparece cuenta como cerrado, y uno
 * abierto cuyo modelo, esfuerzo, razonamiento o huella del prompt ya no son los auditados también.
 * No estricto, para tolerar campos futuros
 */
export const AiGateStateSchema = z.object({
  paused: z.boolean(),
  engines: z.partialRecord(AiEngineSchema, AiGateEngineStateSchema),
});
export type AiGateState = z.infer<typeof AiGateStateSchema>;

/** Exactitud (exactitud). correct es correcto, minor es impreciso menor y severe es error grave */
export const GATE_ACCURACY = ['correct', 'minor', 'severe'] as const;
/** Veredicto (veredicto). Aprobado, aprobado con cambios menores o rechazado */
export const GATE_VERDICTS = ['approved', 'minor_changes', 'rejected'] as const;

/** La reseña de un médico a un texto de la muestra (5.2). Es lo que recibe ai_gate_review como p_review */
export const AiGateReviewSchema = z.strictObject({
  accuracy: z.enum(GATE_ACCURACY),
  /** Anclaje (anclaje). Todo lo que afirma está en su fuente */
  grounded: z.boolean(),
  /**
   * Seguridad (seguridad). true si agrega un fármaco, una dosis, una cifra o una conducta que la
   * fuente no trae, o da consejo clínico
   */
  safetyIssue: z.boolean(),
  /** Utilidad para estudiar el ENARM (utilidad), de 1 a 4 */
  usefulness: z.int().min(1).max(4),
  /** Claridad y tono en español de México con trato de tú (claridad), de 1 a 4 */
  clarity: z.int().min(1).max(4),
  verdict: z.enum(GATE_VERDICTS),
  /** Comentario opcional (comentario) */
  comment: z.string().trim().max(500).nullable(),
});
export type AiGateReview = z.infer<typeof AiGateReviewSchema>;

/**
 * De dónde sale la fuente de un texto (source_kind). bank es el banco real aprobado, demo el de
 * demostración, synthetic los alumnos simulados del generador y team los textos que escribe el equipo
 */
export const GATE_SOURCE_KINDS = ['bank', 'demo', 'synthetic', 'team'] as const;
export type GateSourceKind = (typeof GATE_SOURCE_KINDS)[number];

const gateItem = <E extends AiEngine>(engine: E, output: (typeof ENGINE_CONTRACTS)[E]['output']) =>
  z.strictObject({
    id: z.uuid(),
    engine: z.literal(engine),
    model: z.string().min(1).max(80),
    effort: AiEffortSchema.nullable(),
    thinking: AiThinkingSchema.nullable(),
    promptVersion: PromptVersionSchema,
    promptHash: Sha256HexSchema,
    sourceKind: z.enum(GATE_SOURCE_KINDS),
    /** La fuente que el médico ve junto al texto */
    input: ENGINE_CONTRACTS[engine].input,
    /** Lo que vería el alumno o el médico */
    output,
  });

/** Un texto de la muestra. En tarjetas es una sola tarjeta */
export const AiGateItemSchema = z.discriminatedUnion('engine', [
  gateItem('forgetting', HypothesisOutputSchema),
  gateItem('weekly_report', WeeklyReportOutputSchema),
  gateItem(
    'flashcards',
    FlashcardsOutputSchema.refine((output) => output.cards.length === 1, {
      message: 'Cada texto de la muestra es una sola tarjeta',
    }),
  ),
  gateItem('bias_tips', BiasTipOutputSchema),
  gateItem('restructure', RestructureOutputSchema),
]);
export type AiGateItem = z.infer<typeof AiGateItemSchema>;

/** Hasta 400 textos, para la muestra de 300 con margen. La auditoría corta es de 60 (10.12) */
export const MAX_GATE_SAMPLE_ITEMS = 400;

/**
 * El archivo de una muestra (5.1), private/ai-gate/<id>.json. Lo escribe npm run ai:gate-sample y lo
 * importa el admin en la pantalla de auditoría. El orden de items es la posición de cada texto
 */
export const AiGateSampleFileSchema = z
  .strictObject({
    version: z.literal(1),
    id: GateSampleIdSchema,
    /** Cuándo se generó, en ISO 8601 */
    createdAt: z.string().min(1).max(40),
    items: z.array(AiGateItemSchema).min(1).max(MAX_GATE_SAMPLE_ITEMS),
  })
  .refine((file) => new Set(file.items.map((item) => item.id)).size === file.items.length, {
    message: 'Cada texto de la muestra lleva un id distinto',
    path: ['items'],
  });
export type AiGateSampleFile = z.infer<typeof AiGateSampleFileSchema>;
