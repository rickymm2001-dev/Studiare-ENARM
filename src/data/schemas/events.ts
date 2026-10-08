// Bitácora inmutable (4.7, 6.3). Unión discriminada por type con un payload validado por tipo.
// Los eventos solo se agregan. Nunca se editan ni se borran.
import { z } from 'zod';
import {
  AiArtifactKindSchema,
  CalendarDateSchema,
  CardConfidenceSchema,
  ConsentPurposeSchema,
  ErrorCauseSchema,
  ForgettingRuleSchema,
  FsrsCardStateSchema,
  FsrsRatingSchema,
  IdSchema,
  JsonRecordSchema,
  McqConfidenceSchema,
  SamplingModeSchema,
  SessionKindSchema,
  TimeZoneSchema,
  TutorActionSchema,
  UtcDateTimeSchema,
} from './common';
import { EvidenceSchema } from './activity';

/** Versión del esquema de eventos. Sube cuando cambia un payload, y la derivación sabe leer ambas */
export const EVENT_SCHEMA_VERSION = 1;

const Ms = z
  .int()
  .nonnegative()
  .max(24 * 60 * 60 * 1000);

const PomodoroPhaseSchema = z.enum(['focus', 'short_break', 'long_break']);

/** Payload validado de cada tipo de evento. La clave es el type del evento */
export const EventPayloadSchemas = {
  card_reviewed: z.strictObject({
    cardId: IdSchema,
    deckId: IdSchema,
    /** question cuando la tarjeta es una pregunta fallada que entró al repaso (7.1) */
    source: z.enum(['card', 'question']),
    rating: FsrsRatingSchema,
    /** null si el alumno apagó el paso de confianza */
    confidence: CardConfidenceSchema.nullable(),
    msToReveal: Ms,
    msToRate: Ms,
    stateBefore: FsrsCardStateSchema.nullable(),
    stateAfter: FsrsCardStateSchema,
  }),
  question_shown: z.strictObject({
    questionVersionId: IdSchema,
    shownOptions: z
      .array(z.strictObject({ optionVersionId: IdSchema, position: z.int().min(0).max(9) }))
      .min(2)
      .max(10),
    seed: z.string().min(1).max(64),
    samplingMode: SamplingModeSchema,
    highlightEnabled: z.boolean(),
    positionInSession: z.int().nonnegative(),
  }),
  answer_changed: z.strictObject({
    questionVersionId: IdSchema,
    fromOptionVersionId: IdSchema.nullable(),
    toOptionVersionId: IdSchema,
    msSinceShown: Ms,
  }),
  question_answered: z.strictObject({
    questionVersionId: IdSchema,
    optionVersionId: IdSchema,
    correct: z.boolean(),
    /** null cuando no se pidió, como en el examen, que no la pregunta para parecerse al real */
    confidence: McqConfidenceSchema.nullable(),
    msToAnswer: Ms,
    changeCount: z.int().nonnegative(),
    highlightEnabled: z.boolean(),
    /** Opciones que el alumno descartó antes de contestar, para medir su descarte (D-080) */
    eliminatedOptionVersionIds: z.array(IdSchema).max(10).optional(),
    /** La marcó para revisar en el examen */
    markedForReview: z.boolean().optional(),
  }),
  cause_reported: z.strictObject({
    targetKind: z.enum(['question', 'card']),
    targetId: IdSchema,
    cause: ErrorCauseSchema,
  }),
  session_started: z.strictObject({
    kind: SessionKindSchema,
    config: JsonRecordSchema,
  }),
  session_ended: z.strictObject({
    kind: SessionKindSchema,
    reason: z.enum(['completed', 'abandoned']),
    items: z.int().nonnegative(),
    correct: z.int().nonnegative().nullable(),
    durationMs: z.int().nonnegative(),
    xp: z.int().nonnegative(),
  }),
  visibility_changed: z.strictObject({
    hidden: z.boolean(),
    /** Tiempo fuera de la pestaña, al volver. null al salir */
    awayMs: z.int().nonnegative().nullable(),
  }),
  pomodoro_started: z.strictObject({
    phase: PomodoroPhaseSchema,
    plannedMinutes: z.int().min(1).max(180),
    cycle: z.int().min(1),
  }),
  pomodoro_completed: z.strictObject({
    phase: PomodoroPhaseSchema,
    plannedMinutes: z.int().min(1).max(180),
    actualMinutes: z.number().nonnegative().max(600),
  }),
  pomodoro_interrupted: z.strictObject({
    phase: PomodoroPhaseSchema,
    plannedMinutes: z.int().min(1).max(180),
    actualMinutes: z.number().nonnegative().max(600),
  }),
  xp_awarded: z.strictObject({
    amount: z.int().nonnegative().max(10_000),
    reason: z.enum([
      'mcq_correct',
      'mcq_attempt',
      'card_review',
      'daily_goal',
      'streak_multiplier',
      'challenge',
    ]),
    /** Evento que originó el XP, por ejemplo la respuesta o el repaso */
    sourceEventId: IdSchema.nullable(),
  }),
  streak_day_closed: z.strictObject({
    studyDay: CalendarDateSchema,
    goalMet: z.boolean(),
    freezesUsed: z.int().min(0).max(2),
  }),
  streak_freeze_used: z.strictObject({
    studyDay: CalendarDateSchema,
  }),
  finding_created: z.strictObject({
    findingId: IdSchema,
    rule: ForgettingRuleSchema,
    area: z.string().min(1).max(80),
    evidence: EvidenceSchema,
  }),
  pattern_confirmed: z.strictObject({
    patternId: IdSchema,
    rule: ForgettingRuleSchema,
    area: z.string().min(1).max(80),
    findingIds: z.array(IdSchema).min(1),
  }),
  ai_artifact_created: z.strictObject({
    artifactId: IdSchema,
    kind: AiArtifactKindSchema,
    model: z.string().min(1).max(80),
    promptVersion: z.string().min(1).max(40),
  }),
  ai_artifact_approved: z.strictObject({ artifactId: IdSchema, kind: AiArtifactKindSchema }),
  ai_artifact_edited: z.strictObject({ artifactId: IdSchema, kind: AiArtifactKindSchema }),
  ai_artifact_rejected: z.strictObject({ artifactId: IdSchema, kind: AiArtifactKindSchema }),
  /** El alumno vuelve a mostrar algo que había descartado, así el estado del artefacto sigue a la bitácora */
  ai_artifact_reopened: z.strictObject({ artifactId: IdSchema, kind: AiArtifactKindSchema }),
  hypothesis_feedback: z.strictObject({
    artifactId: IdSchema,
    /** No me ayuda guarda false (8.2) */
    helpful: z.boolean(),
  }),
  action_applied: z.strictObject({
    artifactId: IdSchema.nullable(),
    action: TutorActionSchema,
  }),
  deck_imported: z.strictObject({
    deckId: IdSchema,
    format: z.enum(['apkg_legacy', 'apkg_new', 'csv', 'xlsx', 'docx']),
    notes: z.int().nonnegative(),
    cards: z.int().nonnegative(),
    media: z.int().nonnegative(),
    warnings: z.array(z.string().max(300)).max(100),
  }),
  report_submitted: z.strictObject({
    reportId: IdSchema,
    targetKind: z.enum(['question', 'note']),
    targetId: IdSchema,
    reason: z.enum(['clinical_error', 'wrong_key', 'typo', 'outdated', 'other']),
  }),
  party_joined: z.strictObject({ groupId: IdSchema }),
  party_left: z.strictObject({ groupId: IdSchema }),
  challenge_completed: z.strictObject({ challengeId: IdSchema, groupId: IdSchema }),
  consent_changed: z.strictObject({
    purpose: ConsentPurposeSchema,
    status: z.enum(['granted', 'revoked']),
    noticeVersion: z.string().min(1).max(20),
  }),
  settings_changed: z.strictObject({
    key: z.string().min(1).max(60),
    value: z.json(),
  }),
  /** Cambio de plan con checkout simulado. Nunca hay cobro real ni datos de tarjeta (3.2) */
  subscription_changed: z.strictObject({
    plan: z.enum(['free', 'founder', 'monthly', 'annual']),
    status: z.enum(['none', 'active', 'canceled']),
    amountMxn: z.number().nonnegative().max(100_000),
    receiptId: IdSchema.nullable(),
    simulated: z.literal(true),
  }),
  official_score_submitted: z.strictObject({
    year: z.int().min(2000).max(2100),
    score: z.number().min(0).max(100),
  }),
  /**
   * El alumno saca tarjetas del repaso sin borrarlas (D-085). Un lote lleva hasta 500 tarjetas. El
   * motivo dice si fue a mano o por una sanguijuela. Reanudar es otro evento, nunca se edita este
   */
  cards_suspended: z.strictObject({
    cardIds: z.array(IdSchema).min(1).max(500),
    reason: z.enum(['manual', 'leech']),
  }),
  cards_unsuspended: z.strictObject({
    cardIds: z.array(IdSchema).min(1).max(500),
  }),
  /**
   * Cambio de fecha de repaso de tarjetas (D-085, fila 5). Repartir atrasos, posponer, adelantar o
   * deshacer un cambio anterior. Cada tarjeta lleva su fecha de antes y la nueva. La estabilidad de
   * FSRS no se toca, solo la fecha, y el próximo repaso la corrige con el tiempo transcurrido
   */
  cards_rescheduled: z
    .strictObject({
      kind: z.enum(['spread', 'postpone', 'advance', 'undo']),
      cards: z
        .array(z.strictObject({ cardId: IdSchema, from: UtcDateTimeSchema, to: UtcDateTimeSchema }))
        .min(1)
        .max(500),
      /** Entre cuántos días se repartió o cuántos se pospuso. null al adelantar o deshacer */
      days: z.int().min(1).max(365).nullable(),
      /** El evento de cambio que se deshace. null si no es un deshacer */
      undoes: IdSchema.nullable(),
    })
    // Solo un deshacer dice qué deshace, y solo repartir y posponer llevan días
    .refine((payload) => (payload.kind === 'undo') === (payload.undoes !== null), {
      message: 'Un evento undo debe decir cuál cambio deshace y los demás no',
      path: ['undoes'],
    })
    .refine(
      (payload) =>
        (payload.kind === 'spread' || payload.kind === 'postpone') === (payload.days !== null),
      { message: 'Solo repartir y posponer llevan días', path: ['days'] },
    ),
} as const;

export type EventType = keyof typeof EventPayloadSchemas;
export const EVENT_TYPES = Object.keys(EventPayloadSchemas) as EventType[];

/** Campos comunes de todo evento (6.1) */
const EventEnvelopeShape = {
  id: IdSchema,
  /** ID seudónimo del alumno (4.5) */
  userId: IdSchema,
  /** Momento en UTC */
  at: UtcDateTimeSchema,
  /** Zona horaria del alumno en ese momento, para calcular el día de estudio */
  tz: TimeZoneSchema,
  schemaVersion: z.literal(EVENT_SCHEMA_VERSION),
  sessionId: IdSchema.nullable(),
};

function eventSchemaFor<T extends EventType>(type: T) {
  return z.strictObject({
    ...EventEnvelopeShape,
    type: z.literal(type),
    payload: EventPayloadSchemas[type],
  });
}

export const AppEventSchema = z.discriminatedUnion('type', [
  eventSchemaFor('card_reviewed'),
  eventSchemaFor('question_shown'),
  eventSchemaFor('answer_changed'),
  eventSchemaFor('question_answered'),
  eventSchemaFor('cause_reported'),
  eventSchemaFor('session_started'),
  eventSchemaFor('session_ended'),
  eventSchemaFor('visibility_changed'),
  eventSchemaFor('pomodoro_started'),
  eventSchemaFor('pomodoro_completed'),
  eventSchemaFor('pomodoro_interrupted'),
  eventSchemaFor('xp_awarded'),
  eventSchemaFor('streak_day_closed'),
  eventSchemaFor('streak_freeze_used'),
  eventSchemaFor('finding_created'),
  eventSchemaFor('pattern_confirmed'),
  eventSchemaFor('ai_artifact_created'),
  eventSchemaFor('ai_artifact_approved'),
  eventSchemaFor('ai_artifact_edited'),
  eventSchemaFor('ai_artifact_rejected'),
  eventSchemaFor('ai_artifact_reopened'),
  eventSchemaFor('hypothesis_feedback'),
  eventSchemaFor('action_applied'),
  eventSchemaFor('deck_imported'),
  eventSchemaFor('report_submitted'),
  eventSchemaFor('party_joined'),
  eventSchemaFor('party_left'),
  eventSchemaFor('challenge_completed'),
  eventSchemaFor('consent_changed'),
  eventSchemaFor('settings_changed'),
  eventSchemaFor('subscription_changed'),
  eventSchemaFor('official_score_submitted'),
  eventSchemaFor('cards_suspended'),
  eventSchemaFor('cards_unsuspended'),
  eventSchemaFor('cards_rescheduled'),
]);

export type AppEvent = z.infer<typeof AppEventSchema>;
export type EventOf<T extends EventType> = Extract<AppEvent, { type: T }>;
export type EventPayload<T extends EventType> = z.infer<(typeof EventPayloadSchemas)[T]>;
