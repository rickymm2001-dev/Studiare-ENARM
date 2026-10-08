// Importador de paquetes .apkg de Anki (D-009, D-010, D-026, D-093). Lee los dos formatos, el viejo
// con collection.anki2 o collection.anki21 y el nuevo con collection.anki21b comprimido con zstd.
// Ignora la tabla de repasos y la programación, así todas las tarjetas empiezan como nuevas (D-010),
// y no importa imágenes ni audios todavía. No hay nada de red ni de disco, todo ocurre en memoria.
import type { Database, SqlJsStatic } from 'sql.js';
import { normalizeTags } from '../../engines/tagPath';
import { detectKind, splitFields } from './kinds';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import { readVarintFields } from './protobuf';
import { ImportError, WarningTally, type ParsedImport, type ParsedNote } from './types';
import { readZip } from './zip';
import { decompressZstd } from './zstd';

const FIELD_SEPARATOR = '\x1f';
const COLLECTIONS = ['collection.anki21b', 'collection.anki21', 'collection.anki2'] as const;
/** Niveles de submazos que se conservan bajo el mazo de la importación */
export const IMPORT_MAX_SUBDECK_DEPTH = 6;
const MEDIA_IMAGE = /<img\b/gi;
const MEDIA_SOUND = /\[sound:[^\]]*\]/gi;

interface ModelInfo {
  name: string;
  cloze: boolean;
  templates: number;
}

function rows<T>(db: Database, sql: string): T[] {
  const statement = db.prepare(sql);
  const result: T[] = [];
  try {
    while (statement.step()) result.push(statement.getAsObject() as T);
  } finally {
    statement.free();
  }
  return result;
}

function tableNames(db: Database): Set<string> {
  return new Set(
    rows<{ name: string }>(db, "select name from sqlite_master where type = 'table'").map(
      (row) => row.name,
    ),
  );
}

/** Tipos de nota y mazos del formato viejo, que viven como JSON en la tabla col */
function legacyCollection(db: Database): {
  models: Map<number, ModelInfo>;
  decks: Map<number, string[]>;
} {
  const [col] = rows<{ models: string; decks: string }>(db, 'select models, decks from col');
  if (!col) throw new ImportError('corrupt');
  const parsedModels = JSON.parse(col.models) as Record<
    string,
    { name?: string; type?: number; tmpls?: unknown[] }
  >;
  const parsedDecks = JSON.parse(col.decks) as Record<string, { name?: string }>;
  const models = new Map<number, ModelInfo>();
  for (const [id, model] of Object.entries(parsedModels)) {
    models.set(Number(id), {
      name: model.name ?? '',
      cloze: model.type === 1,
      templates: model.tmpls?.length ?? 1,
    });
  }
  const decks = new Map<number, string[]>();
  for (const [id, deck] of Object.entries(parsedDecks)) {
    decks.set(Number(id), (deck.name ?? '').split('::'));
  }
  return { models, decks };
}

/** Tipos de nota y mazos del formato nuevo, que viven en tablas propias */
function modernCollection(db: Database): {
  models: Map<number, ModelInfo>;
  decks: Map<number, string[]>;
} {
  const templates = new Map(
    rows<{ ntid: number; total: number }>(
      db,
      'select ntid, count(*) as total from templates group by ntid',
    ).map((row) => [row.ntid, row.total]),
  );
  const models = new Map<number, ModelInfo>();
  for (const row of rows<{ id: number; name: string; config: Uint8Array | null }>(
    db,
    'select id, name, config from notetypes',
  )) {
    // En la configuración, el campo 1 es el tipo. 0 es normal y 1 es cloze
    const kind = row.config
      ? readVarintFields(row.config).find((field) => field.field === 1)
      : null;
    models.set(row.id, {
      name: row.name,
      cloze: kind?.value === 1,
      templates: templates.get(row.id) ?? 1,
    });
  }
  const decks = new Map<number, string[]>();
  for (const row of rows<{ id: number; name: string }>(db, 'select id, name from decks')) {
    decks.set(row.id, row.name.split(FIELD_SEPARATOR));
  }
  return { models, decks };
}

function deckPathOf(parts: readonly string[] | undefined): string[] {
  if (!parts) return [];
  const clean = parts.map((part) => part.trim()).filter((part) => part !== '');
  // El mazo que trae Anki de origen no es una carpeta del alumno
  return clean.length === 1 && clean[0] === 'Default' ? [] : clean;
}

export function parseApkg(
  bytes: Uint8Array,
  sql: SqlJsStatic,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedImport {
  const entries = readZip(bytes, limits, (info) =>
    (COLLECTIONS as readonly string[]).includes(info.name),
  );
  const chosen = COLLECTIONS.find((name) => entries[name]);
  const raw = chosen ? entries[chosen] : undefined;
  if (!chosen || !raw) throw new ImportError('no_collection');
  const database =
    chosen === 'collection.anki21b' ? decompressZstd(raw, limits.maxDatabaseBytes) : raw;
  if (database.length > limits.maxDatabaseBytes) throw new ImportError('too_large');

  let db: Database;
  try {
    db = new sql.Database(database);
  } catch {
    throw new ImportError('corrupt');
  }
  const warnings = new WarningTally();
  const notes: ParsedNote[] = [];
  try {
    const tables = tableNames(db);
    if (!tables.has('notes')) throw new ImportError('corrupt');
    const { models, decks } = tables.has('notetypes') ? modernCollection(db) : legacyCollection(db);

    // La carta de cada nota dice en qué mazo vive y si tiene inversa
    const cardsByNote = new Map<number, { deck: number | undefined; ordinals: Set<number> }>();
    for (const card of rows<{ nid: number; did: number; ord: number }>(
      db,
      'select nid, did, ord from cards order by id',
    )) {
      const known = cardsByNote.get(card.nid);
      if (known) known.ordinals.add(card.ord);
      else cardsByNote.set(card.nid, { deck: card.did, ordinals: new Set([card.ord]) });
    }

    let position = 0;
    for (const row of rows<{
      id: number;
      guid: string;
      mid: number;
      flds: string;
      tags: string;
    }>(db, 'select id, guid, mid, flds, tags from notes order by id')) {
      position += 1;
      const model = models.get(row.mid);
      const fields = row.flds.split(FIELD_SEPARATOR);
      const kind = detectKind({
        declaredCloze: model?.cloze ?? false,
        modelName: model?.name ?? '',
        firstField: fields[0] ?? '',
        ordinals: cardsByNote.get(row.id)?.ordinals ?? new Set<number>(),
        templateCount: model?.templates ?? 1,
      });
      if (/occlusion|oclusi/i.test(model?.name ?? '')) warnings.add('image_occlusion');
      if (kind !== 'cloze' && (model?.templates ?? 1) > 2) warnings.add('extra_templates');
      const { front, back, extra } = splitFields(fields, '<br>');
      if (kind !== 'cloze' && extra > 0 && fields.length > 2) warnings.add('extra_columns');

      let sounds = 0;
      const clean = (text: string) =>
        text.replace(MEDIA_SOUND, () => {
          sounds += 1;
          return '';
        });
      const cleanedFront = clean(front);
      const cleanedBack = clean(back);
      warnings.add(
        'media_skipped',
        sounds +
          (cleanedFront.match(MEDIA_IMAGE)?.length ?? 0) +
          (cleanedBack.match(MEDIA_IMAGE)?.length ?? 0),
      );

      let deckPath = deckPathOf(decks.get(cardsByNote.get(row.id)?.deck ?? -1));
      if (deckPath.length > IMPORT_MAX_SUBDECK_DEPTH) {
        deckPath = deckPath.slice(0, IMPORT_MAX_SUBDECK_DEPTH);
        warnings.add('deck_too_deep');
      }
      notes.push({
        guid: row.guid === '' ? null : row.guid,
        kind,
        front: cleanedFront,
        back: cleanedBack,
        html: true,
        tags: normalizeTags(row.tags.split(/\s+/)),
        deckPath,
        position,
      });
    }
    if (tables.has('revlog')) {
      const [reviews] = rows<{ total: number }>(db, 'select count(*) as total from revlog');
      warnings.add('revlog_ignored', reviews?.total ?? 0);
    }
  } catch (error) {
    throw error instanceof ImportError ? error : new ImportError('corrupt');
  } finally {
    db.close();
  }
  return {
    source: 'apkg',
    format: chosen === 'collection.anki21b' ? 'apkg_new' : 'apkg_legacy',
    fileName,
    notes,
    warnings: warnings.toList(),
    errors: [],
  };
}
