// Registro de tablas. Cada tabla dice con qué esquema zod se valida y qué índices tiene en Dexie.
// La primera entrada de indexes es la llave primaria. [a+b] es índice compuesto y *x es multientrada.
// Una prueba revisa que cada campo indexado exista en su esquema.
import type { z } from 'zod';
import {
  AiArtifactSchema,
  AiCallLogSchema,
  ChallengeSchema,
  FindingSchema,
  GroupSchema,
  MembershipSchema,
  PatternSchema,
  SessionSchema,
  SimTruthSchema,
  WidgetLayoutSchema,
} from '../schemas/activity';
import {
  BiasLabelSchema,
  ClinicalCaseSchema,
  ContentReportSchema,
  OptionSchema,
  QuestionSchema,
} from '../schemas/bank';
import {
  CardStateCacheSchema,
  ItemStatsCacheSchema,
  StreakCacheSchema,
  UserAbilityCacheSchema,
  XpCacheSchema,
} from '../schemas/caches';
import { CardSchema, DeckSchema, NoteSchema } from '../schemas/decks';
import { AppEventSchema } from '../schemas/events';
import {
  ConsentSchema,
  OfficialScoreSchema,
  SubscriptionSchema,
  UserSchema,
} from '../schemas/people';

interface TableDef {
  schema: z.ZodType;
  indexes: string;
  /** Las cachés se pueden borrar y reconstruir desde la bitácora */
  kind: 'entity' | 'events' | 'cache';
  /** Solo existe en enarm_demo (D-024) */
  demoOnly?: boolean;
}

export const TABLES = {
  users: { schema: UserSchema, indexes: 'id', kind: 'entity' },
  consents: { schema: ConsentSchema, indexes: 'id, userId, [userId+purpose]', kind: 'entity' },
  subscriptions: { schema: SubscriptionSchema, indexes: 'userId', kind: 'entity' },
  officialScores: { schema: OfficialScoreSchema, indexes: 'userId', kind: 'entity' },

  decks: { schema: DeckSchema, indexes: 'id, ownerId, origin', kind: 'entity' },
  notes: { schema: NoteSchema, indexes: 'id, deckId, *tags', kind: 'entity' },
  cards: { schema: CardSchema, indexes: 'id, noteId, deckId', kind: 'entity' },

  cases: { schema: ClinicalCaseSchema, indexes: 'id', kind: 'entity' },
  questions: {
    schema: QuestionSchema,
    indexes: 'id, questionId, &[questionId+version], caseId, branch, topic, subtopic',
    kind: 'entity',
  },
  options: { schema: OptionSchema, indexes: 'id, optionId, questionVersionId', kind: 'entity' },
  biasLabels: {
    schema: BiasLabelSchema,
    indexes: 'id, &[optionId+physicianId], physicianId',
    kind: 'entity',
  },
  contentReports: { schema: ContentReportSchema, indexes: 'id, targetId, status', kind: 'entity' },

  events: {
    schema: AppEventSchema,
    indexes: 'id, type, [userId+type], [userId+at], sessionId',
    kind: 'events',
  },
  sessions: { schema: SessionSchema, indexes: 'id, userId, kind', kind: 'entity' },
  findings: { schema: FindingSchema, indexes: 'id, userId, rule, area, createdAt', kind: 'entity' },
  patterns: { schema: PatternSchema, indexes: 'id, userId, rule, area, status', kind: 'entity' },
  aiArtifacts: { schema: AiArtifactSchema, indexes: 'id, userId, kind, status', kind: 'entity' },
  aiCallLog: { schema: AiCallLogSchema, indexes: 'id, engine, at', kind: 'entity' },

  groups: { schema: GroupSchema, indexes: 'id, &inviteCode', kind: 'entity' },
  memberships: { schema: MembershipSchema, indexes: 'id, groupId, userId', kind: 'entity' },
  challenges: { schema: ChallengeSchema, indexes: 'id, groupId', kind: 'entity' },
  widgetLayouts: { schema: WidgetLayoutSchema, indexes: 'userId', kind: 'entity' },

  simTruth: { schema: SimTruthSchema, indexes: 'userId', kind: 'entity', demoOnly: true },

  cardStateCache: { schema: CardStateCacheSchema, indexes: 'cardId, userId', kind: 'cache' },
  itemStatsCache: { schema: ItemStatsCacheSchema, indexes: 'questionVersionId', kind: 'cache' },
  userAbilityCache: { schema: UserAbilityCacheSchema, indexes: 'userId', kind: 'cache' },
  xpCache: { schema: XpCacheSchema, indexes: 'userId', kind: 'cache' },
  streakCache: { schema: StreakCacheSchema, indexes: 'userId', kind: 'cache' },
} as const satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;
export const TABLE_NAMES = Object.keys(TABLES) as TableName[];

export type DatabaseKind = 'real' | 'demo';

export const DATABASE_NAMES: Record<DatabaseKind, string> = {
  real: 'enarm_real',
  demo: 'enarm_demo',
};

/** Índices de Dexie para una base. enarm_real no tiene SimTruth */
export function storesFor(kind: DatabaseKind): Record<string, string> {
  const stores: Record<string, string> = {};
  for (const name of TABLE_NAMES) {
    const def: TableDef = TABLES[name];
    if (def.demoOnly && kind !== 'demo') continue;
    stores[name] = def.indexes;
  }
  return stores;
}
