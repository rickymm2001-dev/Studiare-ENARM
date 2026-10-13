// Apuntes en esquema (Fase C2, Etapa 3, D-085 fila 2 y D-092). Un apunte es un árbol de líneas y cada
// línea con una marca (Pregunta >> Respuesta, A :: B, un {{hueco}}, Tema >>>) es una tarjeta del
// modelo de notas y tarjetas, así FSRS, el tutor y la bitácora siguen funcionando igual. El motor
// puro src/engines/outline.ts lee las marcas y arma el plan. Aquí se guarda el apunte y se une cada
// línea con su nota por el ID de la línea (outlineNodeId), dentro del mismo apunte.
//
// Lo que no se rompe al sincronizar
// - Una línea que sigue marcada conserva el ID de su nota y de sus cartas por número de carta, así
//   su historial de repaso sigue. Editar el texto, mover la línea o pasar de >> a <> no crea notas
// - Una línea que pierde su marca, o se borra, deja su nota y sus cartas con marca de borrado, nunca
//   borrado duro. Si la marca vuelve a esa línea, reviven con los mismos IDs
// - Lo que no cambió no se escribe, ni siquiera su fecha de modificación
// - Solo se tocan las notas de ese apunte, nunca las sueltas ni las de otro apunte
// Las escrituras van en lotes (putMany) y las lecturas usan el índice del apunte, no recorren todo.
//
// Mazo y tema de cada apunte (B6 del plan del cambio). El alumno elige el mazo de sus tarjetas, uno
// suyo o el automático que cuelga de Apuntes, y el tema, uno del ENARM o una materia libre. Todas las
// tarjetas del apunte llevan la etiqueta de su tema (subjectTags). La de una materia libre nunca es
// topic:, así esas tarjetas no cuentan en las estadísticas del ENARM.
import {
  normalizeTitle,
  planCards,
  sameSubject,
  subjectTags,
  type OutlineNode,
  type OutlineSubject,
  type PlanIssue,
} from '../../engines/outline';
import { normalizeTags } from '../../engines/tagPath';
import type { DataApi } from '../context';
import { newId } from '../ids';
import { isLive, modifiedAt, type Card, type Deck, type Note } from '../schemas/decks';
import { OutlineSchema, OutlineSubjectSchema, type Outline } from '../schemas/outlines';
import type { User } from '../schemas/people';
import {
  cardOrdinals,
  changesCardFamily,
  createManualDeck,
  isFromOutline,
  manualNoteOf,
  ownManualDeck,
  reconcileCards,
  validateDraft,
  type DraftError,
  type NoteDraft,
} from './manualDecks';

/** Mazo de primer nivel donde cuelgan los mazos que se crean solos para cada apunte */
export const OUTLINES_ROOT_DECK_NAME = 'Apuntes';

type Api = Pick<DataApi, 'repos'>;
type Actor = Pick<User, 'id'>;

const NOT_YOURS = 'Solo puedes cambiar los apuntes que escribiste tú';
const OUTLINE_MISSING = 'No se encontró el apunte';
const OUTLINE_DECK_MISSING =
  'El mazo de este apunte ya no existe. Muévelo a otro mazo tuyo para seguir guardando';
const CHOSEN_DECK_MISSING = 'El mazo elegido ya no existe';
const OUTLINE_CHANGED = 'El apunte cambió en otra ventana desde que lo abriste';

/** El apunte guardado es más nuevo que la copia con la que se quiso guardar */
export class OutlineConflictError extends Error {
  constructor() {
    super(OUTLINE_CHANGED);
    this.name = 'OutlineConflictError';
  }
}

const queues = new Map<string, Promise<unknown>>();

/**
 * Una sola escritura a la vez por apunte. Con el candado del navegador vale entre pestañas y ventanas
 * y, donde no hay, vale dentro de esta. Así dos sincronizaciones no dejan dos notas de la misma línea
 */
async function withOutlineLock<T>(outlineId: string, work: () => Promise<T>): Promise<T> {
  // El candado del navegador no existe en todos los entornos, por eso puede faltar
  const locks =
    typeof navigator === 'undefined' ? undefined : (navigator as { locks?: LockManager }).locks;
  const run = () => (locks ? locks.request(`studiare-outline-${outlineId}`, work) : work());
  const previous = queues.get(outlineId) ?? Promise.resolve();
  const next = previous.then(run, run);
  queues.set(outlineId, next);
  try {
    return await next;
  } finally {
    if (queues.get(outlineId) === next) queues.delete(outlineId);
  }
}

/** Lo que pasó con las notas del apunte en una sincronización. Los números son de notas */
export interface OutlineSyncResult {
  /** Líneas que se volvieron nota por primera vez */
  created: number;
  /** Notas que cambiaron, incluidas las que revivieron porque la marca volvió a su línea */
  updated: number;
  /** Notas que quedaron con marca de borrado porque su línea ya no tiene marca o ya no existe */
  deleted: number;
  /** Notas que ya estaban como pide la línea y no se escribieron */
  unchanged: number;
  /** Problemas que el motor encontró en las líneas, para avisarlos al alumno */
  issues: PlanIssue[];
}

export { isFromOutline };

async function ownedOutline(api: Api, user: Actor, outlineId: string): Promise<Outline> {
  const outline = await api.repos.outlines.get(outlineId);
  if (!outline) throw new Error(OUTLINE_MISSING);
  if (outline.ownerId !== user.id) throw new Error(NOT_YOURS);
  return outline;
}

/** El mazo existe y es del alumno. Se revisa antes de escribir para no dejar nada a medias */
async function ownOutlineDeck(
  api: Api,
  user: Actor,
  deckId: string,
  missing: string,
): Promise<Deck> {
  if (!(await api.repos.decks.get(deckId))) throw new Error(missing);
  return ownManualDeck(api, user, deckId);
}

/** Valida un título con las reglas del esquema y lo devuelve ya recortado */
function checkedTitle(title: string): string {
  const parsed = OutlineSchema.shape.title.safeParse(title);
  if (!parsed.success) throw new RangeError(parsed.error.issues[0]?.message ?? 'Título inválido');
  return parsed.data;
}

/** Valida el tema con las reglas del esquema. null es un apunte sin tema */
function checkedSubject(subject: OutlineSubject | null | undefined): OutlineSubject | null {
  if (subject === null || subject === undefined) return null;
  const parsed = OutlineSubjectSchema.safeParse(subject);
  if (!parsed.success) throw new RangeError(parsed.error.issues[0]?.message ?? 'Tema inválido');
  return parsed.data;
}

const isRootDeck = (deck: Deck, user: Actor, wanted = normalizeTitle(OUTLINES_ROOT_DECK_NAME)) =>
  deck.ownerId === user.id &&
  deck.origin === 'manual' &&
  isLive(deck) &&
  !deck.parentId &&
  normalizeTitle(deck.name) === wanted;

/** El mazo raíz Apuntes del alumno. Se crea si no existe */
async function rootDeck(api: Api, user: Actor, now: Date): Promise<Deck> {
  const found = (await api.repos.decks.list()).find((deck) => isRootDeck(deck, user));
  return found ?? createManualDeck(api, user, { name: OUTLINES_ROOT_DECK_NAME }, now);
}

/** Si el mazo es uno automático de un apunte, de los que cuelgan del mazo raíz Apuntes */
export function isAutomaticOutlineDeck(
  decks: readonly Deck[],
  deckId: string,
  user: Actor,
): boolean {
  const deck = decks.find((entry) => entry.id === deckId);
  if (!deck || !isLive(deck) || !deck.parentId) return false;
  const parent = decks.find((entry) => entry.id === deck.parentId);
  return parent !== undefined && isRootDeck(parent, user);
}

/** Un mazo automático nuevo para el apunte, con su título, colgado del mazo raíz Apuntes */
async function automaticDeck(api: Api, user: Actor, title: string, now: Date): Promise<string> {
  const root = await rootDeck(api, user, now);
  return (await createManualDeck(api, user, { name: title, parentId: root.id }, now)).id;
}

/**
 * Crea un apunte. Sin deckId crea un mazo propio con el nombre del título, colgado del mazo raíz
 * Apuntes, y con deckId usa ese mazo, que debe ser un mazo propio hecho a mano. Puede nacer con su
 * tema y con las líneas de una plantilla (B6). Si alguna línea ya trae marca, sus tarjetas se crean
 */
export async function createOutline(
  api: Api,
  user: Actor,
  input: {
    title: string;
    deckId?: string;
    subject?: OutlineSubject | null;
    nodes?: readonly OutlineNode[];
  },
  now: Date = new Date(),
): Promise<Outline> {
  const title = checkedTitle(input.title);
  const subject = checkedSubject(input.subject);
  const stamp = now.toISOString();
  const draft = OutlineSchema.safeParse({
    id: newId(),
    ownerId: user.id,
    title,
    // Se revisa antes de crear el mazo, así una plantilla inválida no deja un mazo de más
    deckId: input.deckId ?? newId(),
    ...(subject ? { subject } : {}),
    nodes: input.nodes ?? [],
    createdAt: stamp,
    updatedAt: stamp,
  });
  if (!draft.success) {
    throw new RangeError(draft.error.issues[0]?.message ?? 'El apunte no es válido');
  }
  let deckId: string;
  if (input.deckId === undefined) {
    deckId = await automaticDeck(api, user, title, now);
  } else {
    await ownOutlineDeck(api, user, input.deckId, CHOSEN_DECK_MISSING);
    deckId = input.deckId;
  }
  const outline = await api.repos.outlines.put({ ...draft.data, deckId });
  if (outline.nodes.length > 0) await syncOutlineCards(api, user, outline, now);
  return outline;
}

/** Las notas de una línea, la que manda primero. Manda la viva y luego la modificada más tarde */
function byAuthority(a: Note, b: Note): number {
  return Number(isLive(b)) - Number(isLive(a)) || modifiedAt(b).localeCompare(modifiedAt(a));
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** El contenido de la nota que se ve en la tarjeta, para saber si cambió */
const contentKey = (note: Note) =>
  JSON.stringify(
    note.kind === 'cloze' ? [note.kind, note.text, note.extra] : [note.kind, note.front, note.back],
  );

/** Si la nota ya está como la pide la línea. No cuentan las fechas ni el estado editorial */
const sameNote = (a: Note, b: Note) =>
  contentKey(a) === contentKey(b) &&
  a.deckId === b.deckId &&
  a.tags.length === b.tags.length &&
  a.tags.every((tag, index) => tag === b.tags[index]);

/** Con qué código avisar si el esquema de la tarjeta rechaza lo que el motor dio por bueno */
const issueOf = (error: DraftError): PlanIssue['code'] =>
  error === 'too_long' ? 'too_long' : 'cloze_unusable';

/**
 * Pone las notas y cartas del apunte como las pide su plan de tarjetas. Valida el mazo antes de
 * escribir, y escribe en este orden, notas vivas, cartas y por último las notas que se quitan, así
 * una nota viva nunca se queda sin su carta ni una carta sin su nota. Si algo se corta a la mitad,
 * repetir la sincronización lo termina, porque no hace nada de lo que ya está hecho
 */
export async function syncOutlineCards(
  api: Api,
  user: Actor,
  outline: Outline,
  now: Date = new Date(),
): Promise<OutlineSyncResult> {
  if (outline.ownerId !== user.id) throw new Error(NOT_YOURS);
  // Un apunte borrado no resucita sus tarjetas
  if (!isLive(outline)) throw new Error(OUTLINE_MISSING);
  await ownOutlineDeck(api, user, outline.deckId, OUTLINE_DECK_MISSING);

  const stamp = now.toISOString();
  const { plans, issues } = planCards(outline.nodes);
  // La etiqueta del tema va primero en todas las tarjetas del apunte (B6)
  const baseTags = subjectTags(outline.subject);
  // Las notas del apunte con el índice, también las borradas, y solo las cartas de esas notas
  const stored = await api.repos.notes.listAllByOutline(outline.id);
  const storedCards = await api.repos.cards.listAllForNotes(stored.map((note) => note.id));
  const cardsOf = groupBy(storedCards, (card) => card.noteId);
  // Las notas sin línea (no debería haber) quedan solas en su grupo y se retiran más abajo
  const notesOf = groupBy(stored, (note) => note.outlineNodeId ?? note.id);

  const result: OutlineSyncResult = { created: 0, updated: 0, deleted: 0, unchanged: 0, issues };
  const liveNotes: Note[] = [];
  const cardWrites: Card[] = [];
  // Las notas que siguen vigentes, una por línea con marca
  const current = new Set<string>();
  const doneNodes = new Set<string>();

  for (const plan of plans) {
    const draft: NoteDraft = plan.draft;
    const invalid = validateDraft(draft);
    if (invalid) {
      issues.push({ nodeId: plan.nodeId, code: issueOf(invalid) });
      continue;
    }
    // Un ID de línea repetido no debería llegar aquí, pero no debe crear dos notas
    if (doneNodes.has(plan.nodeId)) continue;
    doneNodes.add(plan.nodeId);
    const existing = [...(notesOf.get(plan.nodeId) ?? [])].sort(byAuthority)[0];
    if (existing) current.add(existing.id);
    const next = manualNoteOf({
      existing,
      deckId: outline.deckId,
      draft,
      tags: baseTags.length === 0 ? plan.tags : normalizeTags([...baseTags, ...plan.tags]),
      outline: { outlineId: outline.id, nodeId: plan.nodeId },
      stamp,
    });
    const cards = reconcileCards(
      next,
      cardOrdinals(draft),
      existing ? (cardsOf.get(existing.id) ?? []) : [],
      existing !== undefined && changesCardFamily(existing.kind, draft.kind),
      stamp,
    );
    cardWrites.push(...cards);
    if (!existing) {
      liveNotes.push(next);
      result.created += 1;
    } else if (!isLive(existing)) {
      liveNotes.push({ ...next, deletedAt: null });
      result.updated += 1;
    } else if (!sameNote(existing, next)) {
      liveNotes.push(next);
      result.updated += 1;
    } else if (cards.length > 0) {
      // La nota está bien y solo se arreglan sus cartas, sin tocar la fecha de la nota
      result.updated += 1;
    } else {
      result.unchanged += 1;
    }
  }

  // Todo lo que no es la nota vigente de una línea con marca se retira, también sus cartas vivas
  const retired: Note[] = [];
  for (const note of stored) {
    if (current.has(note.id)) continue;
    if (isLive(note)) {
      retired.push({ ...note, deletedAt: stamp, updatedAt: stamp });
      result.deleted += 1;
    }
    for (const card of cardsOf.get(note.id) ?? []) {
      if (isLive(card)) cardWrites.push({ ...card, deletedAt: stamp, updatedAt: stamp });
    }
  }

  if (liveNotes.length > 0) await api.repos.notes.putMany(liveNotes);
  if (cardWrites.length > 0) await api.repos.cards.putMany(cardWrites);
  if (retired.length > 0) await api.repos.notes.putMany(retired);
  return result;
}

/** Si dos árboles son el mismo, línea por línea. Los dos salieron del esquema, con el mismo orden */
const sameNodes = (a: readonly OutlineNode[], b: readonly OutlineNode[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Guarda el texto del apunte, con su título si cambió, y sincroniza sus tarjetas. Valida que sea
 * del alumno, los límites y que el mazo siga siendo suyo antes de escribir. Guardar lo mismo no
 * escribe nada, ni el apunte ni sus notas. Con expectedUpdatedAt, que es la fecha de la copia que el
 * alumno tiene abierta, no pisa un apunte que otra ventana guardó después y avisa con
 * OutlineConflictError
 */
export async function saveOutline(
  api: Api,
  user: Actor,
  input: {
    outlineId: string;
    title?: string;
    nodes: readonly OutlineNode[];
    expectedUpdatedAt?: string;
  },
  now: Date = new Date(),
): Promise<{ outline: Outline; sync: OutlineSyncResult }> {
  return withOutlineLock(input.outlineId, async () => {
    const stored = await ownedOutline(api, user, input.outlineId);
    if (input.expectedUpdatedAt !== undefined && stored.updatedAt !== input.expectedUpdatedAt) {
      throw new OutlineConflictError();
    }
    const parsed = OutlineSchema.safeParse({
      ...stored,
      title: input.title ?? stored.title,
      nodes: input.nodes,
      updatedAt: now.toISOString(),
    });
    if (!parsed.success) {
      throw new RangeError(parsed.error.issues[0]?.message ?? 'El apunte no es válido');
    }
    await ownOutlineDeck(api, user, stored.deckId, OUTLINE_DECK_MISSING);

    const unchanged =
      parsed.data.title === stored.title && sameNodes(parsed.data.nodes, stored.nodes);
    const outline = unchanged ? stored : await api.repos.outlines.put(parsed.data);
    return { outline, sync: await syncOutlineCards(api, user, outline, now) };
  });
}

/** Cambia el título del apunte. No toca el mazo ni las tarjetas */
export async function renameOutline(
  api: Api,
  user: Actor,
  outlineId: string,
  title: string,
  now: Date = new Date(),
): Promise<Outline> {
  const outline = await ownedOutline(api, user, outlineId);
  const clean = checkedTitle(title);
  if (clean === outline.title) return outline;
  return api.repos.outlines.put({ ...outline, title: clean, updatedAt: now.toISOString() });
}

/**
 * Pasa el apunte a otro mazo propio hecho a mano, con todas sus tarjetas. Sirve también cuando el
 * mazo de antes ya no existe, que es cuando guardar falla. Las cartas conservan su ID
 */
export async function moveOutline(
  api: Api,
  user: Actor,
  outlineId: string,
  deckId: string,
  now: Date = new Date(),
): Promise<{ outline: Outline; sync: OutlineSyncResult }> {
  return withOutlineLock(outlineId, async () => {
    const stored = await ownedOutline(api, user, outlineId);
    await ownOutlineDeck(api, user, deckId, CHOSEN_DECK_MISSING);
    const outline =
      stored.deckId === deckId
        ? stored
        : await api.repos.outlines.put({ ...stored, deckId, updatedAt: now.toISOString() });
    return { outline, sync: await syncOutlineCards(api, user, outline, now) };
  });
}

/** A dónde van las tarjetas. Un mazo propio por su ID, o el automático del apunte en Apuntes */
export type OutlineDeckChoice = { kind: 'deck'; deckId: string } | { kind: 'automatic' };

/**
 * Cambia el mazo y el tema del apunte (B6) y pone sus tarjetas como corresponde. El mazo automático
 * reutiliza el que ya cuelga de Apuntes si el apunte está en uno, y si no crea uno con su título. Con
 * expectedUpdatedAt no pisa un apunte que otra ventana guardó después
 */
export async function updateOutlineSettings(
  api: Api,
  user: Actor,
  input: {
    outlineId: string;
    deck: OutlineDeckChoice;
    subject: OutlineSubject | null;
    expectedUpdatedAt?: string;
  },
  now: Date = new Date(),
): Promise<{ outline: Outline; sync: OutlineSyncResult }> {
  return withOutlineLock(input.outlineId, async () => {
    const stored = await ownedOutline(api, user, input.outlineId);
    if (input.expectedUpdatedAt !== undefined && stored.updatedAt !== input.expectedUpdatedAt) {
      throw new OutlineConflictError();
    }
    const subject = checkedSubject(input.subject);
    let deckId = stored.deckId;
    if (input.deck.kind === 'deck') {
      await ownOutlineDeck(api, user, input.deck.deckId, CHOSEN_DECK_MISSING);
      deckId = input.deck.deckId;
    } else if (!isAutomaticOutlineDeck(await api.repos.decks.list(), stored.deckId, user)) {
      deckId = await automaticDeck(api, user, stored.title, now);
    }
    const changed = deckId !== stored.deckId || !sameSubject(stored.subject, subject);
    const outline = changed
      ? await api.repos.outlines.put({ ...stored, deckId, subject, updatedAt: now.toISOString() })
      : stored;
    return { outline, sync: await syncOutlineCards(api, user, outline, now) };
  });
}

/**
 * Borra el apunte con una marca de borrado. Sin keepCards sus notas y cartas también quedan con
 * marca. Con keepCards las notas siguen vivas pero sueltas, sin apunte ni línea, como tarjetas
 * normales. El apunte se marca al final, así repetir la llamada termina lo que se cortó
 */
export async function deleteOutline(
  api: Api,
  user: Actor,
  outlineId: string,
  options: { keepCards: boolean },
  now: Date = new Date(),
): Promise<void> {
  const outline = await api.repos.outlines.get(outlineId);
  if (!outline) return;
  if (outline.ownerId !== user.id) throw new Error(NOT_YOURS);
  const stamp = now.toISOString();
  const notes = await api.repos.notes.listAllByOutline(outlineId);
  const live = notes.filter((note) => isLive(note));
  if (options.keepCards) {
    await api.repos.notes.putMany(
      live.map((note) => ({ ...note, outlineId: null, outlineNodeId: null, updatedAt: stamp })),
    );
  } else {
    const cards = await api.repos.cards.listAllForNotes(notes.map((note) => note.id));
    await api.repos.cards.putMany(
      cards.filter(isLive).map((card) => ({ ...card, deletedAt: stamp, updatedAt: stamp })),
    );
    await api.repos.notes.putMany(
      live.map((note) => ({ ...note, deletedAt: stamp, updatedAt: stamp })),
    );
  }
  await api.repos.outlines.put({ ...outline, deletedAt: stamp, updatedAt: stamp });
}
