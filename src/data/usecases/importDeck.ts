// Guardar lo que se leyó de un archivo (D-093). El resultado de leer un archivo, que son notas en
// bruto, pasa por el saneador, se compara con lo que el alumno ya tiene para no duplicar y se
// guarda como un mazo privado suyo, con sus submazos, notas y cartas. Las tarjetas empiezan nuevas,
// el historial de otra persona no entra (D-010). Es seguro repetirlo con el mismo archivo. Lo que ya
// está se omite y a las notas que se quedaron sin cartas por una interrupción se les completan.
import { MAX_DECK_DEPTH } from '../../engines/deckTree';
import { duplicateKey, normalizeForDuplicates } from '../../engines/duplicates';
import { normalizeTags } from '../../engines/tagPath';
import { clozeOrdinals } from './manualDecks';
import { textToHtml } from '../content/plainText';
import type { DataApi } from '../context';
import { newId } from '../ids';
import type { Card, Deck, Note } from '../schemas/decks';
import type { User } from '../schemas/people';
import { IMPORT_LIMITS, type ImportLimits } from '../import/limits';
import type { ParsedImport, ParsedNote, RowError } from '../import/types';

type Repos = Pick<DataApi, 'repos'>;

export const IMPORT_BATCH = 500;
/** Largo máximo de un nombre de mazo, igual que el esquema */
const DECK_NAME_MAX = 120;

export type ImportBlockedReason = 'rights_required' | 'empty_name' | 'nothing_to_import';

export class ImportBlockedError extends Error {
  readonly reason: ImportBlockedReason;

  constructor(reason: ImportBlockedReason) {
    super(reason);
    this.reason = reason;
    this.name = 'ImportBlockedError';
  }
}

export interface ImportOptions {
  /** Nombre del mazo raíz de la importación */
  deckName: string;
  /** El alumno confirmó que tiene derecho a usar el contenido (14.3) */
  rightsConfirmed: boolean;
  /** Saneador de HTML. Recibe HTML y devuelve HTML seguro, sin imágenes ni enlaces */
  sanitize: (html: string) => string;
  limits?: ImportLimits;
}

export interface ImportResult {
  rootDeckId: string;
  /** Mazos nuevos creados, sin contar el raíz si ya existía */
  decksCreated: number;
  notesCreated: number;
  cardsCreated: number;
  /** Notas que ya estaban, por su identificador o por su texto */
  duplicates: number;
  /** Cartas que faltaban de notas ya guardadas y se completaron */
  repaired: number;
  /** Filas que no se pudieron guardar, con su motivo */
  rejected: RowError[];
}

interface Prepared {
  note: ParsedNote;
  front: string;
  back: string;
  tags: string[];
  /** Clave para comparar con lo que ya hay, sin importar mayúsculas ni acentos */
  key: string;
}

function ordinalsOf(kind: Note['kind'], front: string): number[] {
  if (kind === 'basic') return [0];
  if (kind === 'basic_reverse') return [0, 1];
  return clozeOrdinals(front);
}

/** Una nota en bruto lista para guardar, o el motivo por el que no se puede */
function prepare(
  note: ParsedNote,
  options: ImportOptions,
  limits: ImportLimits,
): Prepared | RowError['code'] {
  const html = (text: string) => options.sanitize(note.html ? text : textToHtml(text)).trim();
  const front = html(note.front);
  const back = html(note.back);
  if (front === '') return 'empty_front';
  if (note.kind !== 'cloze' && back === '') return 'empty_back';
  if (front.length > limits.maxFieldChars || back.length > limits.maxFieldChars) return 'too_long';
  if (note.kind === 'cloze' && clozeOrdinals(front).length === 0) return 'cloze_without_holes';
  return {
    note,
    front,
    back,
    tags: normalizeTags(note.tags),
    key: `${note.kind}|${duplicateKey(
      note.kind === 'cloze' ? { kind: 'cloze', text: front } : { kind: note.kind, front },
    )}|${normalizeForDuplicates(back)}`,
  };
}

function noteKey(note: Note): string {
  const source =
    note.kind === 'cloze'
      ? { kind: 'cloze' as const, text: note.text }
      : { kind: note.kind, front: note.front };
  return `${note.kind}|${duplicateKey(source)}|${normalizeForDuplicates(note.kind === 'cloze' ? note.extra : note.back)}`;
}

/** Busca o crea el mazo de esa ruta bajo el padre. Los mazos que no existen se agregan a pendientes */
function deckFinder(
  existing: readonly Deck[],
  pending: Deck[],
  user: Pick<User, 'id'>,
  stamp: string,
) {
  const all = [...existing];
  return (parentId: string | null, name: string, origin: Deck['origin']): Deck => {
    const found = all.find(
      (deck) =>
        deck.ownerId === user.id &&
        (deck.parentId ?? null) === parentId &&
        deck.name === name &&
        (deck.origin === 'imported' || deck.origin === 'manual'),
    );
    if (found) return found;
    const created: Deck = {
      id: newId(),
      name,
      description: '',
      ownerId: user.id,
      origin,
      visibility: 'private',
      isDemo: false,
      parentId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    all.push(created);
    pending.push(created);
    return created;
  };
}

export async function importParsed(
  api: Repos,
  user: Pick<User, 'id'>,
  parsed: ParsedImport,
  options: ImportOptions,
  now: Date = new Date(),
): Promise<ImportResult> {
  if (!options.rightsConfirmed) throw new ImportBlockedError('rights_required');
  const rootName = options.deckName.trim().slice(0, DECK_NAME_MAX);
  if (rootName === '') throw new ImportBlockedError('empty_name');
  const limits = options.limits ?? IMPORT_LIMITS;
  const stamp = now.toISOString();

  const rejected: RowError[] = [...parsed.errors];
  const prepared: Prepared[] = [];
  for (const note of parsed.notes) {
    const result = prepare(note, options, limits);
    if (typeof result === 'string') rejected.push({ position: note.position, code: result });
    else prepared.push(result);
  }
  if (prepared.length === 0) throw new ImportBlockedError('nothing_to_import');

  const decks = await api.repos.decks.list();
  const ownDeckIds = new Set(
    decks.filter((deck) => deck.ownerId === user.id).map((deck) => deck.id),
  );
  const existingNotes = (await api.repos.notes.list()).filter((note) =>
    ownDeckIds.has(note.deckId),
  );
  const byGuid = new Map<string, Note>();
  const byKey = new Map<string, Note>();
  for (const note of existingNotes) {
    // El identificador que exporta Studiare es el de la nota, así que también cuenta como origen
    byGuid.set(note.id, note);
    if (note.sourceGuid) byGuid.set(note.sourceGuid, note);
    byKey.set(noteKey(note), note);
  }

  const pendingDecks: Deck[] = [];
  const findDeck = deckFinder(decks, pendingDecks, user, stamp);
  const root = findDeck(null, rootName, 'imported');
  const deckFor = (path: readonly string[]): Deck => {
    let current = root;
    // El mazo raíz ocupa un nivel y el resto se corta al tope de niveles del árbol
    for (const part of path.slice(0, MAX_DECK_DEPTH - 1)) {
      const name = part.trim().slice(0, DECK_NAME_MAX);
      if (name !== '') current = findDeck(current.id, name, 'imported');
    }
    return current;
  };

  const notes: Note[] = [];
  const cards: Card[] = [];
  const repairs: Card[] = [];
  const seenInFile = new Set<string>();
  let duplicates = 0;
  const cardsByNote = new Map<string, Set<number>>();
  const existingCards = (await api.repos.cards.list()).filter((card) =>
    ownDeckIds.has(card.deckId),
  );
  for (const card of existingCards) {
    const set = cardsByNote.get(card.noteId) ?? new Set<number>();
    set.add(card.ordinal);
    cardsByNote.set(card.noteId, set);
  }

  for (const item of prepared) {
    const { note } = item;
    const idKey = note.guid ? `guid|${note.guid}` : null;
    if (idKey && seenInFile.has(idKey)) {
      duplicates += 1;
      continue;
    }
    if (seenInFile.has(item.key)) {
      duplicates += 1;
      continue;
    }
    if (idKey) seenInFile.add(idKey);
    seenInFile.add(item.key);

    const known = (note.guid ? byGuid.get(note.guid) : undefined) ?? byKey.get(item.key);
    if (known) {
      duplicates += 1;
      // Una interrupción pudo dejar notas sin todas sus cartas, y volver a importar las completa
      const have = cardsByNote.get(known.id) ?? new Set<number>();
      const wanted = ordinalsOf(known.kind, known.kind === 'cloze' ? known.text : known.front);
      for (const ordinal of wanted.filter((value) => !have.has(value))) {
        repairs.push({
          id: newId(),
          noteId: known.id,
          deckId: known.deckId,
          ordinal,
          createdAt: stamp,
          updatedAt: stamp,
        });
      }
      continue;
    }

    const deck = deckFor(note.deckPath);
    const base = {
      id: newId(),
      deckId: deck.id,
      tags: item.tags,
      origin: 'imported' as const,
      editorialStatus: 'draft' as const,
      sourceQuote: null,
      sourceQuestionVersionId: null,
      sourceGuid: note.guid,
      isDemo: false,
      createdAt: stamp,
      updatedAt: stamp,
    };
    const created: Note =
      note.kind === 'cloze'
        ? { ...base, kind: 'cloze', text: item.front, extra: item.back }
        : { ...base, kind: note.kind, front: item.front, back: item.back };
    notes.push(created);
    for (const ordinal of ordinalsOf(created.kind, item.front)) {
      cards.push({
        id: newId(),
        noteId: created.id,
        deckId: deck.id,
        ordinal,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
  }

  // Los mazos primero, luego las notas y sus cartas por tandas. Si algo se interrumpe, al volver a
  // importar el mismo archivo se completa lo que faltó
  if (pendingDecks.length > 0) await api.repos.decks.putMany(pendingDecks);
  for (let at = 0; at < notes.length; at += IMPORT_BATCH) {
    const batch = notes.slice(at, at + IMPORT_BATCH);
    await api.repos.notes.putMany(batch);
    const ids = new Set(batch.map((note) => note.id));
    await api.repos.cards.putMany(cards.filter((card) => ids.has(card.noteId)));
  }
  for (let at = 0; at < repairs.length; at += IMPORT_BATCH) {
    await api.repos.cards.putMany(repairs.slice(at, at + IMPORT_BATCH));
  }

  return {
    rootDeckId: root.id,
    decksCreated: pendingDecks.filter((deck) => deck.id !== root.id).length,
    notesCreated: notes.length,
    cardsCreated: cards.length,
    duplicates,
    repaired: repairs.length,
    rejected,
  };
}
