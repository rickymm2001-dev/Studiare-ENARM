// Interfaces de los repositorios. La interfaz no sabe de Dexie. En producción habrá una
// implementación con Supabase que cumple las mismas interfaces (2, PLAN.md 2.1).
import type {
  AiArtifact,
  AiCallLog,
  Challenge,
  Finding,
  Group,
  Membership,
  Pattern,
  Session,
  SimTruth,
  WidgetLayout,
} from '../schemas/activity';
import type {
  BiasLabel,
  ClinicalCase,
  ContentReport,
  Option,
  Question,
  ReviewAssignment,
} from '../schemas/bank';
import type {
  CardStateCache,
  ItemStatsCache,
  StreakCache,
  UserAbilityCache,
  XpCache,
} from '../schemas/caches';
import type { EditorialStatusSchema, Id } from '../schemas/common';
import type { Card, Deck, Note } from '../schemas/decks';
import type { AppEvent, EventType } from '../schemas/events';
import type { Account, Consent, OfficialScore, Subscription, User } from '../schemas/people';
import type { z } from 'zod';
import type { DatabaseKind } from '../databases';

export interface EventFilter {
  userId: Id;
  types?: readonly EventType[];
  /** Desde este momento UTC, incluido */
  from?: string;
  /** Hasta este momento UTC, incluido */
  to?: string;
  sessionId?: Id;
  limit?: number;
}

/**
 * Bitácora inmutable (4.7). Solo agregar, consultar y recorrer. No hay update ni delete,
 * y la base rechaza cualquier intento de editar o borrar un evento.
 */
export interface EventRepo {
  /** Valida con zod y agrega. Falla si el ID ya existe */
  append(event: AppEvent): Promise<AppEvent>;
  /** Eventos del alumno en orden de tiempo */
  query(filter: EventFilter): Promise<AppEvent[]>;
  /** Recorre la bitácora por páginas, en orden de tiempo, sin cargarla toda en memoria */
  stream(filter: EventFilter): AsyncIterable<AppEvent>;
}

/** Entidad editable con validación al escribir */
export interface EntityRepo<T, K extends string = Id> {
  get(key: K): Promise<T | undefined>;
  list(): Promise<T[]>;
  /** Valida con zod y guarda, creando o reemplazando */
  put(entity: T): Promise<T>;
  /** Valida con zod y guarda varios en una sola operación. Devuelve cuántos guardó */
  putMany(entities: readonly T[]): Promise<number>;
  remove(key: K): Promise<void>;
}

/**
 * Entidad que se sincroniza entre dispositivos (D-085, fila 12). Borrar es poner una marca de
 * borrado y no quitar el registro, así otro dispositivo se entera. get y list solo ven lo vivo, y
 * getRaw y listAll ven también lo marcado como borrado, que es lo que necesita la sincronización.
 * No tiene remove, para que nadie quite un registro de verdad y otro dispositivo no se entere
 */
export interface SyncableRepo<T, K extends string = Id> extends Omit<EntityRepo<T, K>, 'remove'> {
  getRaw(key: K): Promise<T | undefined>;
  listAll(): Promise<T[]>;
}

/**
 * Registros inmutables. Solo se agregan. Lo usan los casos clínicos, porque su viñeta es parte
 * del contenido de preguntas ya respondidas. Editar una viñeta es agregar un caso nuevo y
 * versiones nuevas de sus preguntas que apunten a él (6.1)
 */
export interface AppendOnlyRepo<T, K extends string = Id> {
  get(key: K): Promise<T | undefined>;
  list(): Promise<T[]>;
  /** Valida con zod y agrega. Falla si el ID ya existe */
  add(entity: T): Promise<T>;
}

/** Preguntas con versiones inmutables (6.1). Editar es agregar una versión nueva */
export interface QuestionRepo {
  get(questionVersionId: Id): Promise<Question | undefined>;
  listVersions(questionId: Id): Promise<Question[]>;
  latest(questionId: Id): Promise<Question | undefined>;
  listLatest(): Promise<Question[]>;
  /** Agrega una versión nueva con sus opciones en una sola transacción */
  addVersion(question: Question, options: readonly Option[]): Promise<Question>;
  /** Cambia solo el estado editorial de una versión, sin tocar su contenido */
  setEditorialStatus(
    questionVersionId: Id,
    status: z.infer<typeof EditorialStatusSchema>,
  ): Promise<void>;
}

export interface OptionRepo {
  get(optionVersionId: Id): Promise<Option | undefined>;
  listForQuestionVersion(questionVersionId: Id): Promise<Option[]>;
}

/** Las cachés se leen desde la interfaz y solo las escriben las derivaciones */
export interface CacheReader<T, K extends string = Id> {
  get(key: K): Promise<T | undefined>;
  list(): Promise<T[]>;
}

export interface Repositories {
  readonly kind: DatabaseKind;
  events: EventRepo;
  users: EntityRepo<User>;
  accounts: EntityRepo<Account>;
  consents: EntityRepo<Consent>;
  subscriptions: EntityRepo<Subscription>;
  officialScores: EntityRepo<OfficialScore>;
  decks: SyncableRepo<Deck>;
  notes: SyncableRepo<Note>;
  cards: SyncableRepo<Card>;
  cases: AppendOnlyRepo<ClinicalCase>;
  questions: QuestionRepo;
  options: OptionRepo;
  biasLabels: EntityRepo<BiasLabel>;
  contentReports: EntityRepo<ContentReport>;
  reviewAssignments: EntityRepo<ReviewAssignment>;
  sessions: EntityRepo<Session>;
  findings: EntityRepo<Finding>;
  patterns: EntityRepo<Pattern>;
  aiArtifacts: EntityRepo<AiArtifact>;
  aiCallLog: EntityRepo<AiCallLog>;
  groups: EntityRepo<Group>;
  memberships: EntityRepo<Membership>;
  challenges: EntityRepo<Challenge>;
  widgetLayouts: EntityRepo<WidgetLayout>;
  /** Solo en enarm_demo. null en enarm_real (D-024) */
  simTruth: EntityRepo<SimTruth> | null;
  caches: {
    cardState: CacheReader<CardStateCache>;
    itemStats: CacheReader<ItemStatsCache>;
    userAbility: CacheReader<UserAbilityCache>;
    xp: CacheReader<XpCache>;
    streak: CacheReader<StreakCache>;
  };
}
