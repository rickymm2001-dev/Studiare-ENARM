// Apuntes en esquema (D-092). Guardar un apunte mantiene al día las tarjetas que salen de sus
// líneas. Cada línea con una marca completa tiene su nota en el mazo del apunte. Si la línea
// cambia, la nota cambia y conserva su ID y el historial de sus cartas. Si la línea ya no tiene
// marca o se borra, la nota y sus cartas quedan con marca de borrado. Una línea incompleta, como
// una pregunta sin respuesta todavía, no toca la última tarjeta buena. Todo el texto pasa como
// texto plano escapado, igual que en las tarjetas a mano (14.3).
import {
  analyzeOutline,
  normalizeDepths,
  titleKey,
  OUTLINE_LINES_MAX,
} from '../../engines/outline';
import { normalizeTags } from '../../engines/tagPath';
import type { DataApi } from '../context';
import { newId } from '../ids';
import type { Deck, Note } from '../schemas/decks';
import type { OutlineLine, OutlinePage } from '../schemas/outlines';
import type { User } from '../schemas/people';
import {
  createManualDeck,
  deleteManualDeck,
  deleteManualNote,
  draftOf,
  saveManualNote,
  type NoteDraft,
} from './manualDecks';

export const OUTLINES_ROOT_DECK = 'Apuntes';

export type OutlineErrorCode = 'not_found' | 'duplicate_title' | 'empty_title' | 'too_many_lines';

export class OutlineError extends Error {
  readonly code: OutlineErrorCode;

  constructor(code: OutlineErrorCode) {
    super(
      {
        not_found: 'No se encontró el apunte',
        duplicate_title: 'Ya tienes un apunte con ese título',
        empty_title: 'El apunte necesita un título',
        too_many_lines: 'El apunte tiene demasiadas líneas',
      }[code],
    );
    this.code = code;
    this.name = 'OutlineError';
  }
}

type Repos = Pick<DataApi, 'repos'>;

async function ownPage(api: Repos, user: Pick<User, 'id'>, pageId: string): Promise<OutlinePage> {
  const page = await api.repos.outlines.get(pageId);
  if (page?.ownerId !== user.id) throw new OutlineError('not_found');
  return page;
}

async function rootDeck(api: Repos, user: Pick<User, 'id'>, now: Date): Promise<Deck> {
  const decks = await api.repos.decks.list();
  const found = decks.find(
    (deck) =>
      deck.ownerId === user.id &&
      deck.origin === 'manual' &&
      !deck.parentId &&
      deck.name === OUTLINES_ROOT_DECK,
  );
  return found ?? createManualDeck(api, user, { name: OUTLINES_ROOT_DECK }, now);
}

async function assertFreeTitle(
  api: Repos,
  user: Pick<User, 'id'>,
  title: string,
  exceptId?: string,
) {
  if (title.trim() === '') throw new OutlineError('empty_title');
  const key = titleKey(title);
  const taken = (await api.repos.outlines.list()).some(
    (page) => page.ownerId === user.id && page.id !== exceptId && titleKey(page.title) === key,
  );
  if (taken) throw new OutlineError('duplicate_title');
}

/** Crea un apunte vacío con su mazo, dentro del mazo Apuntes */
export async function createOutline(
  api: Repos,
  user: Pick<User, 'id'>,
  input: { title: string },
  now: Date = new Date(),
): Promise<OutlinePage> {
  const title = input.title.trim();
  await assertFreeTitle(api, user, title);
  const root = await rootDeck(api, user, now);
  const deck = await createManualDeck(api, user, { name: title, parentId: root.id }, now);
  const stamp = now.toISOString();
  return api.repos.outlines.put({
    id: newId(),
    ownerId: user.id,
    title,
    deckId: deck.id,
    tags: [],
    lines: [{ id: newId(), depth: 0, text: '', noteId: null }],
    createdAt: stamp,
    updatedAt: stamp,
  });
}

/** Cambia el título del apunte y el nombre de su mazo */
export async function renameOutline(
  api: Repos,
  user: Pick<User, 'id'>,
  pageId: string,
  title: string,
  now: Date = new Date(),
): Promise<OutlinePage> {
  const page = await ownPage(api, user, pageId);
  const next = title.trim();
  await assertFreeTitle(api, user, next, pageId);
  if (next === page.title) return page;
  const stamp = now.toISOString();
  const deck = await api.repos.decks.get(page.deckId);
  if (deck) await api.repos.decks.put({ ...deck, name: next, updatedAt: stamp });
  return api.repos.outlines.put({ ...page, title: next, updatedAt: stamp });
}

export interface SaveOutlineResult {
  page: OutlinePage;
  /** Cuántas tarjetas se crearon o cambiaron en esta pasada */
  written: number;
  /** Cuántas notas se borraron porque su línea ya no tiene marca o desapareció */
  removed: number;
  problems: { lineId: string; error: string }[];
}

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((tag, index) => tag === [...b].sort()[index]);

const sameDraft = (a: NoteDraft, b: NoteDraft) =>
  a.kind === b.kind &&
  (a.kind === 'cloze'
    ? b.kind === 'cloze' && a.text === b.text && a.extra === b.extra
    : b.kind !== 'cloze' && a.front === b.front && a.back === b.back);

/**
 * Guarda las líneas del apunte y deja sus tarjetas al día. Es seguro llamarla seguido, por ejemplo
 * en un guardado automático, porque no escribe nada de lo que no cambió
 */
export async function saveOutline(
  api: Repos,
  user: Pick<User, 'id'>,
  pageId: string,
  input: { lines: readonly OutlineLine[]; tags?: readonly string[] },
  now: Date = new Date(),
): Promise<SaveOutlineResult> {
  const page = await ownPage(api, user, pageId);
  if (input.lines.length > OUTLINE_LINES_MAX) throw new OutlineError('too_many_lines');
  const lines = normalizeDepths(input.lines);
  const tags = normalizeTags(input.tags ?? page.tags);
  const plan = analyzeOutline(lines, tags);
  const stored = new Map(page.lines.map((line) => [line.id, line.noteId]));
  // Lo que manda es lo guardado y no lo que mande la pantalla, por si dos guardados se cruzan
  const noteIdOf = (line: OutlineLine) => stored.get(line.id) ?? line.noteId;

  const liveNote = async (noteId: string | null): Promise<Note | undefined> =>
    noteId ? await api.repos.notes.get(noteId) : undefined;

  const noteIds = new Map<string, string | null>();
  for (const line of lines) noteIds.set(line.id, noteIdOf(line));

  let written = 0;
  for (const card of plan.cards) {
    const existing = await liveNote(noteIds.get(card.lineId) ?? null);
    // Solo una nota de este mazo cuenta como la de esta línea
    const mine = existing?.deckId === page.deckId ? existing : undefined;
    if (mine && sameDraft(draftOf(mine), card.draft) && sameTags(mine.tags, card.tags)) continue;
    const note = await saveManualNote(
      api,
      user,
      {
        deckId: page.deckId,
        draft: card.draft,
        tags: card.tags,
        ...(mine ? { noteId: mine.id } : {}),
      },
      now,
    );
    noteIds.set(card.lineId, note.id);
    written += 1;
  }

  // Las líneas que perdieron su marca y las que ya no están sueltan su nota
  const stale: string[] = [];
  for (const lineId of plan.unmarked) {
    const noteId = noteIds.get(lineId);
    if (noteId) {
      stale.push(noteId);
      noteIds.set(lineId, null);
    }
  }
  const present = new Set(lines.map((line) => line.id));
  for (const line of page.lines) {
    if (!present.has(line.id) && line.noteId) stale.push(line.noteId);
  }
  let removed = 0;
  for (const noteId of new Set(stale)) {
    if (await liveNote(noteId)) {
      await deleteManualNote(api, user, noteId, now);
      removed += 1;
    }
  }

  const saved: OutlineLine[] = lines.map((line) => ({
    ...line,
    noteId: noteIds.get(line.id) ?? null,
  }));
  const unchanged =
    written === 0 &&
    removed === 0 &&
    sameTags(page.tags, tags) &&
    saved.length === page.lines.length &&
    saved.every((line, index) => {
      const old = page.lines[index];
      return (
        old?.id === line.id &&
        old.depth === line.depth &&
        old.text === line.text &&
        old.noteId === line.noteId
      );
    });
  const next = unchanged
    ? page
    : await api.repos.outlines.put({ ...page, tags, lines: saved, updatedAt: now.toISOString() });
  return {
    page: next,
    written,
    removed,
    problems: plan.problems.map((problem) => ({ lineId: problem.lineId, error: problem.error })),
  };
}

/** Borra el apunte, su mazo y todas sus tarjetas. El historial de repasos queda en la bitácora */
export async function deleteOutline(
  api: Repos,
  user: Pick<User, 'id'>,
  pageId: string,
  now: Date = new Date(),
): Promise<void> {
  const page = await ownPage(api, user, pageId);
  if (await api.repos.decks.get(page.deckId)) await deleteManualDeck(api, user, page.deckId, now);
  const stamp = now.toISOString();
  await api.repos.outlines.put({ ...page, deletedAt: stamp, updatedAt: stamp });
}
