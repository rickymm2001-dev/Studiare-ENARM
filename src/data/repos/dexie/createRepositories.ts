import type { EnarmDb } from '../../db/database';
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
} from '../../schemas/activity';
import {
  BiasLabelSchema,
  ClinicalCaseSchema,
  ContentReportSchema,
  ReviewAssignmentSchema,
} from '../../schemas/bank';
import { DeckSchema } from '../../schemas/decks';
import { OutlineSchema } from '../../schemas/outlines';
import {
  ConsentSchema,
  OfficialScoreSchema,
  SubscriptionSchema,
  UserSchema,
  AccountSchema,
} from '../../schemas/people';
import type { Repositories } from '../types';
import {
  createDexieAppendOnlyRepo,
  createDexieCacheReader,
  createDexieCardRepo,
  createDexieEntityRepo,
  createDexieNoteRepo,
  createDexieOptionRepo,
  createDexieQuestionRepo,
  createDexieSyncableRepo,
} from './entityRepos';
import { createDexieEventRepo } from './eventRepo';

export function createDexieRepositories(db: EnarmDb): Repositories {
  return {
    kind: db.kind,
    events: createDexieEventRepo(db),
    users: createDexieEntityRepo(db.users, UserSchema),
    accounts: createDexieEntityRepo(db.accounts, AccountSchema),
    consents: createDexieEntityRepo(db.consents, ConsentSchema),
    subscriptions: createDexieEntityRepo(db.subscriptions, SubscriptionSchema),
    officialScores: createDexieEntityRepo(db.officialScores, OfficialScoreSchema),
    decks: createDexieSyncableRepo(db.decks, DeckSchema),
    notes: createDexieNoteRepo(db),
    cards: createDexieCardRepo(db),
    outlines: createDexieSyncableRepo(db.outlines, OutlineSchema),
    cases: createDexieAppendOnlyRepo(db.cases, ClinicalCaseSchema),
    questions: createDexieQuestionRepo(db),
    options: createDexieOptionRepo(db),
    biasLabels: createDexieEntityRepo(db.biasLabels, BiasLabelSchema),
    contentReports: createDexieEntityRepo(db.contentReports, ContentReportSchema),
    reviewAssignments: createDexieEntityRepo(db.reviewAssignments, ReviewAssignmentSchema),
    sessions: createDexieEntityRepo(db.sessions, SessionSchema),
    findings: createDexieEntityRepo(db.findings, FindingSchema),
    patterns: createDexieEntityRepo(db.patterns, PatternSchema),
    aiArtifacts: createDexieEntityRepo(db.aiArtifacts, AiArtifactSchema),
    aiCallLog: createDexieEntityRepo(db.aiCallLog, AiCallLogSchema),
    groups: createDexieEntityRepo(db.groups, GroupSchema),
    memberships: createDexieEntityRepo(db.memberships, MembershipSchema),
    challenges: createDexieEntityRepo(db.challenges, ChallengeSchema),
    widgetLayouts: createDexieEntityRepo(db.widgetLayouts, WidgetLayoutSchema),
    simTruth: db.kind === 'demo' ? createDexieEntityRepo(db.simTruth, SimTruthSchema) : null,
    caches: {
      cardState: createDexieCacheReader(db.cardStateCache),
      itemStats: createDexieCacheReader(db.itemStatsCache),
      userAbility: createDexieCacheReader(db.userAbilityCache),
      xp: createDexieCacheReader(db.xpCache),
      streak: createDexieCacheReader(db.streakCache),
    },
  };
}
