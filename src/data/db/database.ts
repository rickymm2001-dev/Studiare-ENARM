// Bases de IndexedDB con Dexie. enarm_real para el alumno real y enarm_demo para la demo (D-024).
// La bitácora de eventos queda protegida en el nivel más bajo de Dexie (DBCore). Solo acepta
// agregar. put, delete, clear, modify y bulkPut fallan con ImmutableEventError.
import Dexie, { type EntityTable } from 'dexie';
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
import type { Card, Deck, Note } from '../schemas/decks';
import type { AppEvent } from '../schemas/events';
import type { Account, Consent, OfficialScore, Subscription, User } from '../schemas/people';
import { normalizeTags } from '../../engines/tagPath';
import { DATABASE_NAMES, type DatabaseKind } from '../databases';
import { storesFor } from './tables';

/** Tabla sin llaves autogeneradas. Cada registro llega completo y con su ID */
type StrictTable<T, K extends keyof T> = EntityTable<T, K, T>;

export interface EnarmTables {
  users: StrictTable<User, 'id'>;
  consents: StrictTable<Consent, 'id'>;
  subscriptions: StrictTable<Subscription, 'userId'>;
  officialScores: StrictTable<OfficialScore, 'userId'>;
  decks: StrictTable<Deck, 'id'>;
  notes: StrictTable<Note, 'id'>;
  cards: StrictTable<Card, 'id'>;
  cases: StrictTable<ClinicalCase, 'id'>;
  questions: StrictTable<Question, 'id'>;
  options: StrictTable<Option, 'id'>;
  biasLabels: StrictTable<BiasLabel, 'id'>;
  contentReports: StrictTable<ContentReport, 'id'>;
  events: StrictTable<AppEvent, 'id'>;
  sessions: StrictTable<Session, 'id'>;
  findings: StrictTable<Finding, 'id'>;
  patterns: StrictTable<Pattern, 'id'>;
  aiArtifacts: StrictTable<AiArtifact, 'id'>;
  aiCallLog: StrictTable<AiCallLog, 'id'>;
  groups: StrictTable<Group, 'id'>;
  memberships: StrictTable<Membership, 'id'>;
  challenges: StrictTable<Challenge, 'id'>;
  widgetLayouts: StrictTable<WidgetLayout, 'userId'>;
  accounts: StrictTable<Account, 'userId'>;
  reviewAssignments: StrictTable<ReviewAssignment, 'id'>;
  simTruth: StrictTable<SimTruth, 'userId'>;
  cardStateCache: StrictTable<CardStateCache, 'cardId'>;
  itemStatsCache: StrictTable<ItemStatsCache, 'questionVersionId'>;
  userAbilityCache: StrictTable<UserAbilityCache, 'userId'>;
  xpCache: StrictTable<XpCache, 'userId'>;
  streakCache: StrictTable<StreakCache, 'userId'>;
}

export type EnarmDb = Dexie & EnarmTables & { readonly kind: DatabaseKind };

export class ImmutableEventError extends Error {
  constructor(operation: string) {
    super(`La bitácora de eventos solo acepta agregar. Se intentó ${operation}.`);
    this.name = 'ImmutableEventError';
  }
}

/** Versión actual del esquema de Dexie. Cada cambio de índices sube esta versión con su migración */
// 2 agrega accounts (D-068) y 3 agrega reviewAssignments (D-070). Dexie crea las tablas nuevas sin
// tocar los datos. 4 apaga una vez la pregunta de confianza previa (D-087). 5 agrega el índice del
// mazo padre y llena las fechas de modificación y las etiquetas sin espacios (D-085)
export const DB_VERSION = 5;

export function createEnarmDb(kind: DatabaseKind, options?: { name?: string }): EnarmDb {
  const db = new Dexie(options?.name ?? DATABASE_NAMES[kind]) as EnarmDb;
  Object.defineProperty(db, 'kind', { value: kind, enumerable: true });
  // Cada versión que cambia datos declara su migración, así subir de la 3 a la 5 corre las dos
  db.version(4)
    .stores(storesFor(kind))
    .upgrade((tx) =>
      // Quien venía con el valor de siempre, encendido, pasa al modo rápido. Se puede volver a
      // encender en Configuración. Solo corre al subir de versión, no cada vez que se abre
      tx
        .table<{ settings: { cardConfidenceStep?: boolean } }>('users')
        .toCollection()
        .modify((user) => {
          user.settings.cardConfidenceStep = false;
        }),
    );
  db.version(DB_VERSION)
    .stores(storesFor(kind))
    .upgrade(async (tx) => {
      await tx
        .table<{ createdAt: string; updatedAt?: string; parentId?: string | null }>('decks')
        .toCollection()
        .modify((deck) => {
          deck.updatedAt ??= deck.createdAt;
          deck.parentId ??= null;
        });
      await tx
        .table<{ createdAt: string; updatedAt?: string; tags: string[] }>('notes')
        .toCollection()
        .modify((note) => {
          note.updatedAt ??= note.createdAt;
          // Una etiqueta no lleva espacios. Las que traían se limpian una sola vez
          note.tags = normalizeTags(note.tags);
        });
      await tx
        .table<{ createdAt: string; updatedAt?: string }>('cards')
        .toCollection()
        .modify((card) => {
          card.updatedAt ??= card.createdAt;
        });
    });
  db.use({
    stack: 'dbcore',
    name: 'append-only-events',
    create: (down) => ({
      ...down,
      table: (tableName) => {
        const table = down.table(tableName);
        if (tableName !== 'events') return table;
        return {
          ...table,
          mutate: (request) => {
            // Un add con llaves existentes también falla, porque IndexedDB rechaza la llave repetida
            if (request.type !== 'add') {
              return Promise.reject(new ImmutableEventError(request.type));
            }
            return table.mutate(request);
          },
        };
      },
    }),
  });
  return db;
}
