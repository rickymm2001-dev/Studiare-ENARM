// Repositorios genéricos con Dexie. Validan con zod al escribir.
import type { Table } from 'dexie';
import type { z } from 'zod';
import type { EnarmDb } from '../../db/database';
import { OptionSchema, QuestionSchema, type Option, type Question } from '../../schemas/bank';
import { CardSchema, NoteSchema } from '../../schemas/decks';
import type {
  AppendOnlyRepo,
  CacheReader,
  CardRepo,
  EntityRepo,
  NoteRepo,
  OptionRepo,
  QuestionRepo,
  SyncableRepo,
} from '../types';

export function createDexieEntityRepo<T, K extends string>(
  table: Table<T, K>,
  schema: z.ZodType<T>,
): EntityRepo<T, K> {
  return {
    get: (key) => table.get(key),
    list: () => table.toArray(),
    async put(entity) {
      const parsed = schema.parse(entity);
      await table.put(parsed);
      return parsed;
    },
    async putMany(entities) {
      const parsed = entities.map((entity) => schema.parse(entity));
      await table.bulkPut(parsed);
      return parsed.length;
    },
    async remove(key) {
      await table.delete(key);
    },
  };
}

/**
 * Repositorio de lo que se sincroniza. Lo marcado como borrado queda guardado pero get y list no lo
 * muestran, para que ninguna pantalla lo trate como vivo. getRaw y listAll sí lo devuelven
 */
export function createDexieSyncableRepo<T extends { deletedAt?: string | null }, K extends string>(
  table: Table<T, K>,
  schema: z.ZodType<T>,
): SyncableRepo<T, K> {
  const base = createDexieEntityRepo(table, schema);
  const live = (entity: T) => entity.deletedAt === undefined || entity.deletedAt === null;
  return {
    ...base,
    async get(key) {
      const entity = await table.get(key);
      return entity && live(entity) ? entity : undefined;
    },
    async list() {
      return (await table.toArray()).filter(live);
    },
    getRaw: (key) => table.get(key),
    listAll: () => table.toArray(),
  };
}

export function createDexieNoteRepo(db: EnarmDb): NoteRepo {
  return {
    ...createDexieSyncableRepo(db.notes, NoteSchema),
    listAllByOutline: (outlineId) => db.notes.where('outlineId').equals(outlineId).toArray(),
  };
}

export function createDexieCardRepo(db: EnarmDb): CardRepo {
  return {
    ...createDexieSyncableRepo(db.cards, CardSchema),
    listAllForNotes: (noteIds) =>
      noteIds.length === 0
        ? Promise.resolve([])
        : db.cards
            .where('noteId')
            .anyOf([...noteIds])
            .toArray(),
  };
}

export function createDexieAppendOnlyRepo<T, K extends string>(
  table: Table<T, K>,
  schema: z.ZodType<T>,
): AppendOnlyRepo<T, K> {
  return {
    get: (key) => table.get(key),
    list: () => table.toArray(),
    async add(entity) {
      const parsed = schema.parse(entity);
      await table.add(parsed);
      return parsed;
    },
  };
}

export function createDexieCacheReader<T, K extends string>(table: Table<T, K>): CacheReader<T, K> {
  return {
    get: (key) => table.get(key),
    list: () => table.toArray(),
  };
}

export function createDexieQuestionRepo(db: EnarmDb): QuestionRepo {
  return {
    get: (id) => db.questions.get(id),

    async listVersions(questionId) {
      const versions = await db.questions.where('questionId').equals(questionId).toArray();
      return versions.sort((a, b) => a.version - b.version);
    },

    async latest(questionId) {
      const versions = await db.questions.where('questionId').equals(questionId).toArray();
      return versions.reduce<Question | undefined>(
        (best, current) => (!best || current.version > best.version ? current : best),
        undefined,
      );
    },

    async listLatest() {
      const latestById = new Map<string, Question>();
      await db.questions.each((question) => {
        const current = latestById.get(question.questionId);
        if (!current || question.version > current.version) {
          latestById.set(question.questionId, question);
        }
      });
      return [...latestById.values()];
    },

    async addVersion(question, options) {
      const parsedQuestion = QuestionSchema.parse(question);
      const parsedOptions: Option[] = options.map((option) => OptionSchema.parse(option));
      const optionIds = new Set(parsedOptions.map((option) => option.id));
      if (parsedOptions.some((option) => option.questionVersionId !== parsedQuestion.id)) {
        throw new Error('Cada opción debe pertenecer a esta versión de la pregunta');
      }
      if (parsedOptions.filter((option) => option.isCorrect).length !== 1) {
        throw new Error('Cada pregunta tiene exactamente una opción correcta (7.8)');
      }
      if (!parsedQuestion.canonicalOptionIds.every((id) => optionIds.has(id))) {
        throw new Error('El set canónico solo puede usar opciones de esta versión');
      }
      await db.transaction('rw', db.questions, db.options, async () => {
        // add y no put, para que una versión existente nunca se reemplace
        await db.questions.add(parsedQuestion);
        await db.options.bulkAdd(parsedOptions);
      });
      return parsedQuestion;
    },

    async setEditorialStatus(questionVersionId, status) {
      const updated = await db.questions.update(questionVersionId, { editorialStatus: status });
      if (updated === 0) throw new Error(`No existe la versión de pregunta ${questionVersionId}`);
    },
  };
}

export function createDexieOptionRepo(db: EnarmDb): OptionRepo {
  return {
    get: (id) => db.options.get(id),
    listForQuestionVersion: (questionVersionId) =>
      db.options.where('questionVersionId').equals(questionVersionId).toArray(),
  };
}
