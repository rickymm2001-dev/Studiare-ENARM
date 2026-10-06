// Mazos y tarjetas hechos a mano por el alumno (3.1). Son privados, del alumno y sin revisión médica,
// así que quedan en borrador. El texto es plano y se guarda como HTML escapado, así que nada de lo
// que escribe se vuelve código (14.3). Una tarjeta cloze lleva una carta por cada hueco, y al
// editarla las cartas de los huecos que siguen conservan su ID y con él su historial de repaso.
import { htmlToText, textToHtml } from '../content/plainText';
import type { DataApi } from '../context';
import { newId } from '../ids';
import type { Card, Deck, Note } from '../schemas/decks';
import type { User } from '../schemas/people';

export type NoteDraft =
  { kind: 'basic'; front: string; back: string } | { kind: 'cloze'; text: string; extra: string };

/** Largo máximo de cada campo en texto plano. Escapado cabe en los 20,000 de una nota */
export const FIELD_MAX = 3000;
/** El nombre del mazo cabe en DeckSchema */
export const DECK_NAME_MAX = 120;

export type DraftError = 'empty_front' | 'empty_back' | 'empty_text' | 'no_cloze' | 'too_long';

const CLOZE_START = /\{\{c(\d+)::/g;

/** Números de hueco de un texto cloze, de menor a mayor y sin repetir */
export function clozeOrdinals(text: string): number[] {
  const found = new Set<number>();
  for (const match of text.matchAll(CLOZE_START)) found.add(Number(match[1]));
  return [...found].filter((ordinal) => ordinal >= 1 && ordinal <= 100).sort((a, b) => a - b);
}

/** null si la tarjeta se puede guardar */
export function validateDraft(draft: NoteDraft): DraftError | null {
  const fields = draft.kind === 'basic' ? [draft.front, draft.back] : [draft.text, draft.extra];
  if (fields.some((field) => field.length > FIELD_MAX)) return 'too_long';
  if (draft.kind === 'basic') {
    if (draft.front.trim() === '') return 'empty_front';
    if (draft.back.trim() === '') return 'empty_back';
    return null;
  }
  if (draft.text.trim() === '') return 'empty_text';
  return clozeOrdinals(draft.text).length === 0 ? 'no_cloze' : null;
}

/** Lo que el editor muestra de una tarjeta guardada, para volver a editarla */
export function draftOf(note: Note): NoteDraft {
  return note.kind === 'basic'
    ? { kind: 'basic', front: htmlToText(note.front), back: htmlToText(note.back) }
    : { kind: 'cloze', text: htmlToText(note.text), extra: htmlToText(note.extra) };
}

type Repos = Pick<DataApi, 'repos'>;

async function ownManualDeck(api: Repos, user: Pick<User, 'id'>, deckId: string): Promise<Deck> {
  const deck = await api.repos.decks.get(deckId);
  if (deck?.ownerId !== user.id || deck.origin !== 'manual')
    throw new Error('Solo puedes cambiar los mazos que creaste tú');
  return deck;
}

export async function createManualDeck(
  api: Repos,
  user: Pick<User, 'id'>,
  input: { name: string; description?: string },
  now: Date = new Date(),
): Promise<Deck> {
  return api.repos.decks.put({
    id: newId(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    ownerId: user.id,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    createdAt: now.toISOString(),
  });
}

/** Guarda una tarjeta nueva o los cambios de una que ya existe, con sus cartas */
export async function saveManualNote(
  api: Repos,
  user: Pick<User, 'id'>,
  input: { deckId: string; draft: NoteDraft; noteId?: string },
  now: Date = new Date(),
): Promise<Note> {
  const error = validateDraft(input.draft);
  if (error) throw new RangeError(`La tarjeta no es válida (${error})`);
  await ownManualDeck(api, user, input.deckId);

  const existing = input.noteId ? await api.repos.notes.get(input.noteId) : undefined;
  if (input.noteId && existing?.deckId !== input.deckId)
    throw new Error('La tarjeta no está en este mazo');
  const base = {
    id: existing?.id ?? newId(),
    deckId: input.deckId,
    tags: existing?.tags ?? [],
    origin: 'manual' as const,
    editorialStatus: 'draft' as const,
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: existing?.createdAt ?? now.toISOString(),
  };
  const draft = input.draft;
  const note: Note =
    draft.kind === 'basic'
      ? { ...base, kind: 'basic', front: textToHtml(draft.front), back: textToHtml(draft.back) }
      : { ...base, kind: 'cloze', text: textToHtml(draft.text), extra: textToHtml(draft.extra) };
  await api.repos.notes.put(note);

  // Una carta por hueco. Las de huecos que siguen conservan su ID y las que sobran se quitan
  const wanted = draft.kind === 'basic' ? [0] : clozeOrdinals(draft.text);
  const current = (await api.repos.cards.list()).filter((card) => card.noteId === note.id);
  const keep = new Map(current.map((card) => [card.ordinal, card]));
  const cards: Card[] = wanted.map(
    (ordinal) =>
      keep.get(ordinal) ?? {
        id: newId(),
        noteId: note.id,
        deckId: note.deckId,
        ordinal,
        createdAt: now.toISOString(),
      },
  );
  await api.repos.cards.putMany(cards.filter((card) => !keep.has(card.ordinal)));
  for (const card of current)
    if (!wanted.includes(card.ordinal)) await api.repos.cards.remove(card.id);
  return note;
}

export async function deleteManualNote(
  api: Repos,
  user: Pick<User, 'id'>,
  noteId: string,
): Promise<void> {
  const note = await api.repos.notes.get(noteId);
  if (!note) return;
  await ownManualDeck(api, user, note.deckId);
  for (const card of (await api.repos.cards.list()).filter((entry) => entry.noteId === noteId))
    await api.repos.cards.remove(card.id);
  await api.repos.notes.remove(noteId);
}

/** Borra el mazo con sus tarjetas. El historial de repasos queda en la bitácora, que solo se agrega */
export async function deleteManualDeck(
  api: Repos,
  user: Pick<User, 'id'>,
  deckId: string,
): Promise<void> {
  await ownManualDeck(api, user, deckId);
  for (const card of (await api.repos.cards.list()).filter((entry) => entry.deckId === deckId))
    await api.repos.cards.remove(card.id);
  for (const note of (await api.repos.notes.list()).filter((entry) => entry.deckId === deckId))
    await api.repos.notes.remove(note.id);
  await api.repos.decks.remove(deckId);
}
