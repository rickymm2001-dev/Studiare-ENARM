// Mazos y tarjetas hechos a mano por el alumno (3.1). Son privados, del alumno y sin revisión médica,
// así que quedan en borrador. El texto es plano y se guarda como HTML escapado, así que nada de lo
// que escribe se vuelve código (14.3). Una tarjeta básica lleva una carta, una básica con tarjeta
// inversa lleva dos (la 0 pregunta el frente y la 1 el reverso) y una cloze lleva una carta por cada
// número de hueco. Al editarla las cartas que siguen conservan su ID y con él su historial de repaso.
// Borrar pone una marca de borrado en lugar de quitar el registro y toda edición pone su fecha de
// modificación, para sincronizar entre dispositivos (D-085). Las líneas de un apunte en esquema se
// guardan con las mismas piezas (D-092), así que aquí también viven las que comparten los dos casos
// de uso, armar la nota (manualNoteOf) y ajustar sus cartas (reconcileCards).
import { MAX_DECK_DEPTH, deckChain, descendantIds } from '../../engines/deckTree';
import { normalizeTags } from '../../engines/tagPath';
import { clozeHoles, clozeOpenings, type ClozeHole } from '../content/cloze';
import { htmlToText, textToHtml } from '../content/plainText';
import type { DataApi } from '../context';
import { newId } from '../ids';
import { isLive, type Card, type Deck, type Note } from '../schemas/decks';
import type { User } from '../schemas/people';

export type NoteDraft =
  | { kind: 'basic'; front: string; back: string }
  | { kind: 'basic_reverse'; front: string; back: string }
  | { kind: 'cloze'; text: string; extra: string };

export type NoteKind = NoteDraft['kind'];

/** Largo máximo de cada campo en texto plano. Escapado cabe en los 20,000 de una nota */
export const FIELD_MAX = 3000;
/** El nombre del mazo cabe en DeckSchema */
export const DECK_NAME_MAX = 120;

export type DraftError =
  'empty_front' | 'empty_back' | 'empty_text' | 'no_cloze' | 'unclosed_cloze' | 'too_long';

/** Un hueco sirve si tiene número de 1 a 100 y una respuesta que no esté en blanco. Vale igual para
 * un hueco que va dentro de otro */
const usable = (hole: ClozeHole) =>
  hole.ordinal >= 1 && hole.ordinal <= 100 && hole.answer.trim() !== '';

/** Números de hueco de un texto cloze, de menor a mayor y sin repetir. Solo cuentan los completos */
export function clozeOrdinals(text: string): number[] {
  return [
    ...new Set(
      clozeHoles(text)
        .filter(usable)
        .map((hole) => hole.ordinal),
    ),
  ].sort((a, b) => a - b);
}

/** null si la tarjeta se puede guardar */
export function validateDraft(draft: NoteDraft): DraftError | null {
  const fields = draft.kind === 'cloze' ? [draft.text, draft.extra] : [draft.front, draft.back];
  if (fields.some((field) => field.length > FIELD_MAX)) return 'too_long';
  if (draft.kind !== 'cloze') {
    if (draft.front.trim() === '') return 'empty_front';
    if (draft.back.trim() === '') return 'empty_back';
    return null;
  }
  if (draft.text.trim() === '') return 'empty_text';
  const opened = clozeOpenings(draft.text);
  if (opened === 0) return 'no_cloze';
  // Un hueco que no cierra o sin respuesta deja la respuesta a la vista en el frente de la tarjeta.
  // Los huecos anidados cuentan como uno más, así que uno sin cerrar dentro de otro también falla
  return clozeHoles(draft.text).filter(usable).length === opened ? null : 'unclosed_cloze';
}

/** Los números de carta que genera una tarjeta. Una básica tiene la 0, una inversa la 0 y la 1 */
export function cardOrdinals(draft: NoteDraft): number[] {
  switch (draft.kind) {
    case 'basic':
      return [0];
    case 'basic_reverse':
      return [0, 1];
    case 'cloze':
      return clozeOrdinals(draft.text);
  }
}

/**
 * Cambia el tipo de una tarjeta que se está escribiendo sin perder lo escrito, como Cambiar tipo
 * de nota en Anki. Frente y reverso de las dos básicas son los mismos campos, el frente pasa al
 * texto con huecos y el reverso a la nota extra
 */
export function convertDraft(draft: NoteDraft, kind: NoteKind): NoteDraft {
  if (draft.kind === kind) return draft;
  if (draft.kind === 'cloze') {
    return kind === 'cloze' ? draft : { kind, front: draft.text, back: draft.extra };
  }
  return kind === 'cloze'
    ? { kind: 'cloze', text: draft.front, extra: draft.back }
    : { kind, front: draft.front, back: draft.back };
}

/** Lo que el editor muestra de una tarjeta guardada, para volver a editarla */
export function draftOf(note: Note): NoteDraft {
  switch (note.kind) {
    case 'basic':
    case 'basic_reverse':
      return { kind: note.kind, front: htmlToText(note.front), back: htmlToText(note.back) };
    case 'cloze':
      return { kind: 'cloze', text: htmlToText(note.text), extra: htmlToText(note.extra) };
  }
}

/** Los campos de la nota con el texto ya escapado, para guardarlo como HTML (14.3) */
export function contentOf(draft: NoteDraft) {
  switch (draft.kind) {
    case 'basic':
      return {
        kind: 'basic',
        front: textToHtml(draft.front),
        back: textToHtml(draft.back),
      } as const;
    case 'basic_reverse':
      return {
        kind: 'basic_reverse',
        front: textToHtml(draft.front),
        back: textToHtml(draft.back),
      } as const;
    case 'cloze':
      return {
        kind: 'cloze',
        text: textToHtml(draft.text),
        extra: textToHtml(draft.extra),
      } as const;
  }
}

type Repos = Pick<DataApi, 'repos'>;

const FROM_OUTLINE = 'Esta tarjeta sale de un apunte. Cámbiala o bórrala en el apunte';

/** Si la nota viene de la línea de un apunte. Esas tarjetas se editan desde el apunte */
export function isFromOutline<T extends Pick<Note, 'outlineId' | 'outlineNodeId'>>(
  note: T,
): note is T & { outlineId: string; outlineNodeId: string } {
  return typeof note.outlineId === 'string' && typeof note.outlineNodeId === 'string';
}

const isCloze = (kind: NoteKind) => kind === 'cloze';

export async function ownManualDeck(
  api: Repos,
  user: Pick<User, 'id'>,
  deckId: string,
): Promise<Deck> {
  const deck = await api.repos.decks.get(deckId);
  if (deck?.ownerId !== user.id || deck.origin !== 'manual')
    throw new Error('Solo puedes cambiar los mazos que creaste tú');
  return deck;
}

export async function createManualDeck(
  api: Repos,
  user: Pick<User, 'id'>,
  input: { name: string; description?: string; parentId?: string | null },
  now: Date = new Date(),
): Promise<Deck> {
  if (input.parentId) {
    await ownManualDeck(api, user, input.parentId);
    // Mover un mazo ya respeta el tope de niveles, y crear uno nuevo también
    if (deckChain(await api.repos.decks.list(), input.parentId).length >= MAX_DECK_DEPTH)
      throw new RangeError('Ya son demasiados niveles de mazos');
  }
  return api.repos.decks.put({
    id: newId(),
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    ownerId: user.id,
    origin: 'manual',
    visibility: 'private',
    isDemo: false,
    parentId: input.parentId ?? null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

/** El apunte y la línea de la que sale una nota (D-092) */
export interface OutlineLink {
  outlineId: string;
  nodeId: string;
}

/** Arma la nota de una tarjeta hecha a mano. Una nota que ya existe conserva su ID y su creación */
export function manualNoteOf(args: {
  existing?: Note | undefined;
  deckId: string;
  draft: NoteDraft;
  tags: readonly string[];
  outline: OutlineLink | null;
  stamp: string;
}): Note {
  const { existing, outline, stamp } = args;
  return {
    id: existing?.id ?? newId(),
    deckId: args.deckId,
    tags: [...args.tags],
    origin: 'manual',
    editorialStatus: 'draft',
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    // Una tarjeta suelta no lleva estos campos, para no cambiar lo que ya se guardaba
    ...(outline ? { outlineId: outline.outlineId, outlineNodeId: outline.nodeId } : {}),
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
    ...contentOf(args.draft),
  };
}

/**
 * Las cartas que hay que escribir para que la nota tenga una carta viva por cada número de carta de
 * su tarjeta. Las que siguen conservan su ID, también las que se habían quitado, que reviven con su
 * historial. Las que sobran quedan con marca de borrado. Entre una cloze y una básica el mismo
 * número es otra pregunta, porque la carta 1 de una inversa pregunta el reverso y la del hueco 1
 * pregunta un dato. Ahí ninguna hereda historial y salen cartas nuevas (changesFamily). Una carta que
 * ya está como se pide no se devuelve, para no escribir de más
 */
export function reconcileCards(
  note: Pick<Note, 'id' | 'deckId'>,
  wanted: readonly number[],
  current: readonly Card[],
  changesFamily: boolean,
  stamp: string,
): Card[] {
  // Si por cambios de tipo hay dos cartas con el mismo número, manda la viva y luego la más reciente
  const byOrdinal = new Map(
    (changesFamily ? [] : [...current])
      .sort(
        (a, b) =>
          Number(isLive(a)) - Number(isLive(b)) ||
          (a.updatedAt ?? a.createdAt).localeCompare(b.updatedAt ?? b.createdAt),
      )
      .map((card) => [card.ordinal, card]),
  );
  const kept = new Set<string>();
  const writes: Card[] = [];
  for (const ordinal of wanted) {
    const found = byOrdinal.get(ordinal);
    if (!found) {
      writes.push({
        id: newId(),
        noteId: note.id,
        deckId: note.deckId,
        ordinal,
        createdAt: stamp,
        updatedAt: stamp,
      });
      continue;
    }
    kept.add(found.id);
    if (!isLive(found) || found.deckId !== note.deckId) {
      writes.push({ ...found, deckId: note.deckId, deletedAt: null, updatedAt: stamp });
    }
  }
  for (const card of current) {
    if (!kept.has(card.id) && isLive(card)) {
      writes.push({ ...card, deletedAt: stamp, updatedAt: stamp });
    }
  }
  return writes;
}

/** Si pasar de un tipo de tarjeta a otro cambia el sentido de los números de carta */
export const changesCardFamily = (from: NoteKind, to: NoteKind) => isCloze(from) !== isCloze(to);

/**
 * Guarda una tarjeta nueva o los cambios de una que ya existe, con sus cartas. Las etiquetas
 * (tags) se limpian y reemplazan las de la nota, y sin ellas la nota conserva las que tenía. Con
 * outline la nota queda unida a la línea de un apunte, y una nota que ya venía de un apunte
 * conserva su unión
 */
export async function saveManualNote(
  api: Repos,
  user: Pick<User, 'id'>,
  input: {
    deckId: string;
    draft: NoteDraft;
    noteId?: string;
    tags?: readonly string[];
    outline?: OutlineLink;
  },
  now: Date = new Date(),
): Promise<Note> {
  const error = validateDraft(input.draft);
  if (error) throw new RangeError(`La tarjeta no es válida (${error})`);
  await ownManualDeck(api, user, input.deckId);

  const existing = input.noteId ? await api.repos.notes.get(input.noteId) : undefined;
  if (input.noteId && existing?.deckId !== input.deckId)
    throw new Error('La tarjeta no está en este mazo');
  // Una tarjeta que sale de la línea de un apunte se cambia en el apunte, que es quien la sincroniza.
  // Si se pudiera editar aquí, la siguiente sincronización la volvería a escribir como estaba
  if (existing && isFromOutline(existing) && input.outline === undefined)
    throw new Error(FROM_OUTLINE);
  const stamp = now.toISOString();
  const draft = input.draft;
  const kept: OutlineLink | null =
    typeof existing?.outlineId === 'string' && typeof existing.outlineNodeId === 'string'
      ? { outlineId: existing.outlineId, nodeId: existing.outlineNodeId }
      : null;
  const note = manualNoteOf({
    existing,
    deckId: input.deckId,
    draft,
    tags: input.tags ? normalizeTags(input.tags) : (existing?.tags ?? []),
    outline: input.outline ?? kept,
    stamp,
  });
  await api.repos.notes.put(note);

  const current = existing ? await api.repos.cards.listAllForNotes([note.id]) : [];
  const writes = reconcileCards(
    note,
    cardOrdinals(draft),
    current,
    existing !== undefined && changesCardFamily(existing.kind, draft.kind),
    stamp,
  );
  if (writes.length > 0) await api.repos.cards.putMany(writes);
  return note;
}

export async function deleteManualNote(
  api: Repos,
  user: Pick<User, 'id'>,
  noteId: string,
  now: Date = new Date(),
): Promise<void> {
  const note = await api.repos.notes.get(noteId);
  if (!note) return;
  if (isFromOutline(note)) throw new Error(FROM_OUTLINE);
  await ownManualDeck(api, user, note.deckId);
  const stamp = now.toISOString();
  const cards = (await api.repos.cards.list()).filter((entry) => entry.noteId === noteId);
  await api.repos.cards.putMany(
    cards.map((card) => ({ ...card, deletedAt: stamp, updatedAt: stamp })),
  );
  await api.repos.notes.put({ ...note, deletedAt: stamp, updatedAt: stamp });
}

/**
 * Borra el mazo con sus tarjetas y con los mazos que cuelgan de él. Todo queda con marca de borrado
 * y el historial de repasos queda en la bitácora, que solo se agrega
 */
export async function deleteManualDeck(
  api: Repos,
  user: Pick<User, 'id'>,
  deckId: string,
  now: Date = new Date(),
): Promise<void> {
  await ownManualDeck(api, user, deckId);
  const stamp = now.toISOString();
  const decks = await api.repos.decks.list();
  const doomed = descendantIds(decks, deckId);
  const mark = <T extends object>(entity: T) => ({ ...entity, deletedAt: stamp, updatedAt: stamp });
  await api.repos.cards.putMany(
    (await api.repos.cards.list()).filter((card) => doomed.has(card.deckId)).map(mark),
  );
  await api.repos.notes.putMany(
    (await api.repos.notes.list()).filter((note) => doomed.has(note.deckId)).map(mark),
  );
  await api.repos.decks.putMany(decks.filter((deck) => doomed.has(deck.id)).map(mark));
}
