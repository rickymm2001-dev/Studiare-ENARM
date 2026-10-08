// Organizar tarjetas ya hechas (D-085, filas 3 a 5). Mover notas entre mazos propios, poner y quitar
// etiquetas, mover y renombrar mazos, y suspender o reanudar tarjetas. Lo precargado no se edita, solo
// se suspende, porque suspender es un evento que se suma a la bitácora y no toca el contenido. Todo
// cambio de una nota o de un mazo pone su fecha de modificación, para sincronizar entre dispositivos.
import { canMoveDeck } from '../../engines/deckTree';
import { SUSPEND_BATCH, inBatches } from '../../engines/suspension';
import { TAGS_PER_NOTE_MAX, normalizeTags, sanitizeTag } from '../../engines/tagPath';
import type { DataApi } from '../context';
import { createEvent, type Clock } from '../events/createEvent';
import type { Deck, Note } from '../schemas/decks';
import type { User } from '../schemas/people';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Actor = Pick<User, 'id' | 'timeZone'>;

export interface BatchResult {
  /** Notas o tarjetas que cambiaron */
  changed: number;
  /** Las que no se pueden cambiar porque son precargadas o de otra persona */
  skipped: number;
}

/** Notas que el alumno puede editar. Las de mazos suyos y que no vienen precargadas */
async function editableNotes(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  noteIds: readonly string[],
): Promise<{ notes: Note[]; skipped: number }> {
  const wanted = new Set(noteIds);
  const decks = new Map((await api.repos.decks.list()).map((deck) => [deck.id, deck]));
  const found = (await api.repos.notes.list()).filter((note) => wanted.has(note.id));
  const notes = found.filter(
    (note) => note.origin !== 'preloaded' && decks.get(note.deckId)?.ownerId === user.id,
  );
  return { notes, skipped: wanted.size - notes.length };
}

async function ownManualDeck(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  deckId: string,
): Promise<Deck> {
  const deck = await api.repos.decks.get(deckId);
  if (deck?.ownerId !== user.id || deck.origin !== 'manual')
    throw new Error('Solo puedes cambiar los mazos que creaste tú');
  return deck;
}

/** Pasa notas, con todas sus cartas, a otro mazo del alumno. La carta conserva su ID y su historial */
export async function moveNotes(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  noteIds: readonly string[],
  targetDeckId: string,
  now: Date = new Date(),
): Promise<BatchResult> {
  await ownManualDeck(api, user, targetDeckId);
  const { notes, skipped } = await editableNotes(api, user, noteIds);
  const moving = notes.filter((note) => note.deckId !== targetDeckId);
  const stamp = now.toISOString();
  const ids = new Set(moving.map((note) => note.id));
  // Las cartas van primero. Si algo falla a la mitad la nota sigue en el mazo de antes y mover otra
  // vez termina el trabajo, en lugar de dejar la nota en un mazo y sus cartas en otro
  // Las cartas de un borrado se mueven también, para que sigan al revivir la nota
  const cards = (await api.repos.cards.listAll()).filter((card) => ids.has(card.noteId));
  await api.repos.cards.putMany(
    cards.map((card) => ({ ...card, deckId: targetDeckId, updatedAt: stamp })),
  );
  await api.repos.notes.putMany(
    moving.map((note) => ({ ...note, deckId: targetDeckId, updatedAt: stamp })),
  );
  return { changed: moving.length, skipped };
}

/** Agrega etiquetas a las notas. Las que ya las tienen no cambian */
export async function addTags(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  noteIds: readonly string[],
  tags: readonly string[],
  now: Date = new Date(),
): Promise<BatchResult> {
  const clean = normalizeTags(tags);
  if (clean.length === 0) return { changed: 0, skipped: 0 };
  const { notes, skipped } = await editableNotes(api, user, noteIds);
  const stamp = now.toISOString();
  const changed: Note[] = [];
  for (const note of notes) {
    const tagsNow = normalizeTags([...note.tags, ...clean]);
    // Con el tope de etiquetas por nota, lo que no cabe se queda fuera
    if (tagsNow.length === note.tags.length) continue;
    changed.push({ ...note, tags: tagsNow.slice(0, TAGS_PER_NOTE_MAX), updatedAt: stamp });
  }
  await api.repos.notes.putMany(changed);
  return { changed: changed.length, skipped };
}

/** Quita una etiqueta exacta de las notas, sin distinguir mayúsculas. Las rutas de abajo se quedan */
export async function removeTag(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  noteIds: readonly string[],
  tag: string,
  now: Date = new Date(),
): Promise<BatchResult> {
  const target = sanitizeTag(tag).toLowerCase();
  if (target === '') return { changed: 0, skipped: 0 };
  const { notes, skipped } = await editableNotes(api, user, noteIds);
  const stamp = now.toISOString();
  const changed = notes
    .filter((note) => note.tags.some((entry) => entry.toLowerCase() === target))
    .map((note) => ({
      ...note,
      tags: note.tags.filter((entry) => entry.toLowerCase() !== target),
      updatedAt: stamp,
    }));
  await api.repos.notes.putMany(changed);
  return { changed: changed.length, skipped };
}

/**
 * Suspende o reanuda tarjetas con eventos, de hasta 500 por evento. Sirve para cualquier tarjeta,
 * también las precargadas, porque no cambia su contenido. Solo toca tarjetas que existen
 */
export async function setSuspended(
  api: Api,
  user: Actor,
  cardIds: readonly string[],
  suspend: boolean,
  options: { reason?: 'manual' | 'leech'; clock?: Clock } = {},
): Promise<number> {
  const existing = new Set((await api.repos.cards.list()).map((card) => card.id));
  const ids = [...new Set(cardIds)].filter((id) => existing.has(id));
  const context = { userId: user.id, tz: user.timeZone, clock: options.clock };
  for (const batch of inBatches(ids, SUSPEND_BATCH)) {
    await api.recordEvent(
      suspend
        ? createEvent(
            'cards_suspended',
            { cardIds: batch, reason: options.reason ?? 'manual' },
            context,
          )
        : createEvent('cards_unsuspended', { cardIds: batch }, context),
    );
  }
  return ids.length;
}

export type MoveDeckError = 'missing' | 'self' | 'cycle' | 'too_deep';

/** Cuelga un mazo propio de otro mazo propio, o lo deja de primer nivel con parentId null */
export async function moveDeck(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  deckId: string,
  parentId: string | null,
  now: Date = new Date(),
): Promise<MoveDeckError | null> {
  const deck = await ownManualDeck(api, user, deckId);
  if (parentId !== null) await ownManualDeck(api, user, parentId);
  const check = canMoveDeck(await api.repos.decks.list(), deckId, parentId);
  if (check !== 'ok') return check;
  await api.repos.decks.put({ ...deck, parentId, updatedAt: now.toISOString() });
  return null;
}

export async function renameDeck(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  deckId: string,
  name: string,
  now: Date = new Date(),
): Promise<void> {
  const deck = await ownManualDeck(api, user, deckId);
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === deck.name) return;
  await api.repos.decks.put({ ...deck, name: trimmed, updatedAt: now.toISOString() });
}
