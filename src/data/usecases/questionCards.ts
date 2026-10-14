// Tarjetas desde una pregunta del banco (B5, comentario 1). El alumno elige el mazo, uno suyo, uno
// precargado o uno nuevo, y la tarjeta se arma con el texto del banco, que puede editar antes de
// guardar, o con una propuesta de la IA anclada a la explicación, siempre en borrador. En un mazo
// precargado la tarjeta queda en la capa del alumno, un mazo privado suyo que cuelga del precargado,
// así el mazo compartido no cambia para nadie más (4.16). Queda un evento que solo se agrega con la
// pregunta y su versión. Los IDs salen del alumno, la pregunta, su versión y el mazo elegido, así
// pulsar dos veces no duplica la tarjeta. Cuando la nota ya está se completa lo que haya faltado de
// un intento que se cortó, sin repetir nada.
import { stableUlid } from '@/demo/stableId';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import type { Question } from '../schemas/bank';
import {
  isEditableDeck,
  isLive,
  type Card,
  type Controversy,
  type Deck,
  type Note,
} from '../schemas/decks';
import type { User } from '../schemas/people';
import { AI_TAG } from './aiCards';
import { TOPIC_TAG_PREFIX } from './errorCards';
import {
  cardOrdinals,
  clozeOrdinals,
  contentOf,
  createManualDeck,
  validateDraft,
  type NoteDraft,
} from './manualDecks';

type Api = Pick<DataApi, 'repos' | 'recordEvent'>;
type Person = Pick<User, 'id' | 'timeZone'>;

/**
 * Momento fijo de los IDs. Lo que cambia entre alumnos, preguntas y mazos es la parte aleatoria.
 * Es a propósito que sea anterior al contenido precargado (DEMO_CONTENT_TIME) y a todo lo que se crea
 * con la fecha del día. Repasar toma las tarjetas nuevas en el orden de su ID, así que las que el
 * alumno hizo con una pregunta van primero entre sus nuevas. Las creó porque quiere estudiarlas y le
 * sirve verlas pronto, mientras recuerda la pregunta. tests/e2e/exam-review.spec.ts cuenta con este
 * orden para encontrarlas entre las primeras del repaso
 */
const ID_TIME = Date.UTC(2026, 0, 1);

export const questionCardIds = {
  /** La nota. Una por alumno, pregunta, versión y mazo elegido */
  note: (userId: string, questionId: string, version: number, deckId: string) =>
    stableUlid(`question-card|${userId}|${questionId}|${version}|${deckId}`, ID_TIME),
  card: (noteId: string, ordinal: number) =>
    stableUlid(`question-card|${noteId}|${ordinal}`, ID_TIME),
  /** La capa del alumno en un mazo precargado */
  layer: (userId: string, preloadedDeckId: string) =>
    stableUlid(`layer-deck|${userId}|${preloadedDeckId}`, ID_TIME),
  /** La capa que sigue cuando el alumno movió la anterior a otro lado. Sale del ID de la anterior */
  nextLayer: (previousLayerId: string) => stableUlid(`layer-deck-next|${previousLayerId}`, ID_TIME),
};

/**
 * Si el mazo es la capa del alumno en un precargado. Es un mazo suyo que cuelga de uno precargado,
 * algo que solo arma este caso de uso, porque crear o mover mazos pide un padre propio
 */
export function isLayerDeck(
  deck: Pick<Deck, 'ownerId' | 'parentId'>,
  decks: ReadonlyMap<string, Pick<Deck, 'origin'>>,
  userId: string,
): boolean {
  return (
    deck.ownerId === userId &&
    typeof deck.parentId === 'string' &&
    decks.get(deck.parentId)?.origin === 'preloaded'
  );
}

/** Dónde puede ir una tarjeta nueva. Un mazo existente por su ID o uno nuevo con el ID que se le da */
export type QuestionCardTarget =
  | { kind: 'deck'; deckId: string }
  /** El ID lo fija quien llama, una vez por diálogo, así un segundo toque no crea otro mazo */
  | { kind: 'new'; deckId: string; name: string };

export type QuestionCardSource =
  | { kind: 'bank' }
  | {
      kind: 'ai';
      /** Frase literal de la explicación de la pregunta que respalda la tarjeta */
      quote: string;
      /** De dónde salió, para que la tarjeta lo diga */
      sourceTitle: string;
      /** La generación en borrador que la propuso */
      artifactId: string;
      controversy: Controversy | null;
    };

export interface QuestionCardInput {
  question: Pick<Question, 'id' | 'questionId' | 'version' | 'topic' | 'isDemo'>;
  target: QuestionCardTarget;
  draft: NoteDraft;
  source: QuestionCardSource;
  from: 'exam_review' | 'practice_review';
  /** Nombre y descripción de la capa del alumno, que pone la interfaz */
  layer: { name: string; description: string };
}

export interface QuestionCardResult {
  /** created si quedó una tarjeta nueva y exists si ya estaba de un toque anterior */
  status: 'created' | 'exists';
  noteId: string;
  /** El mazo donde quedó la nota */
  deckId: string;
  /** Quedó en la capa del alumno de un mazo precargado */
  layer: boolean;
}

export class QuestionCardTargetError extends Error {
  constructor() {
    super('Ese mazo no puede recibir tarjetas');
    this.name = 'QuestionCardTargetError';
  }
}

/**
 * La capa del alumno en un mazo precargado. La crea si falta y la revive si la había borrado. Si el
 * alumno movió su capa a otro lado, se respeta lo que hizo. Se queda donde la dejó, con el nombre que
 * le haya puesto, y se arma otra debajo del precargado con un ID que sale del de la anterior
 */
async function ensureLayer(
  api: Pick<DataApi, 'repos'>,
  user: Person,
  preloaded: Deck,
  input: Pick<QuestionCardInput, 'layer' | 'question'>,
  stamp: string,
): Promise<Deck> {
  const decks = await api.repos.decks.list();
  // Una capa que llegó de otro dispositivo trae otro ID, porque el ID del alumno es de cada navegador
  const found = decks.find(
    (deck) => deck.parentId === preloaded.id && isEditableDeck(deck, user.id),
  );
  if (found) return found;
  let id = questionCardIds.layer(user.id, preloaded.id);
  let stored = await api.repos.decks.getRaw(id);
  // Cada vuelta salta una capa viva que el alumno movió, así que no puede haber más vueltas que mazos
  for (let moved = 0; stored && isLive(stored) && stored.parentId !== preloaded.id; moved += 1) {
    if (moved > decks.length) throw new QuestionCardTargetError();
    id = questionCardIds.nextLayer(id);
    stored = await api.repos.decks.getRaw(id);
  }
  return api.repos.decks.put({
    id,
    name: stored?.name ?? input.layer.name,
    description: stored?.description ?? input.layer.description,
    ownerId: user.id,
    origin: 'manual',
    visibility: 'private',
    // Lleva la marca de demostración si la lleva su contenido (4.6)
    isDemo: input.question.isDemo || (stored?.isDemo ?? false),
    parentId: preloaded.id,
    createdAt: stored?.createdAt ?? stamp,
    updatedAt: stamp,
    deletedAt: null,
  });
}

/**
 * El mazo elegido y el mazo donde queda la nota. En un mazo propio son el mismo. En uno precargado
 * la nota va a la capa del alumno, y si eligió su capa directo cuenta como si eligiera el precargado,
 * así los dos caminos dan la misma tarjeta
 */
async function resolveTarget(
  api: Pick<DataApi, 'repos'>,
  user: Person,
  input: QuestionCardInput,
  stamp: string,
): Promise<{ chosenId: string; deck: Deck; layer: boolean }> {
  const { target } = input;
  if (target.kind === 'new') {
    const existing = await api.repos.decks.get(target.deckId);
    if (existing) {
      if (!isEditableDeck(existing, user.id)) throw new QuestionCardTargetError();
      return { chosenId: existing.id, deck: existing, layer: false };
    }
    const name = target.name.trim();
    if (name === '') throw new QuestionCardTargetError();
    const deck = await createManualDeck(api, user, { id: target.deckId, name }, new Date(stamp));
    return { chosenId: deck.id, deck, layer: false };
  }
  const deck = await api.repos.decks.get(target.deckId);
  if (!deck) throw new QuestionCardTargetError();
  if (deck.origin === 'preloaded') {
    return {
      chosenId: deck.id,
      deck: await ensureLayer(api, user, deck, input, stamp),
      layer: true,
    };
  }
  if (!isEditableDeck(deck, user.id)) throw new QuestionCardTargetError();
  const parent = deck.parentId ? await api.repos.decks.get(deck.parentId) : undefined;
  if (parent?.origin === 'preloaded') return { chosenId: parent.id, deck, layer: true };
  return { chosenId: deck.id, deck, layer: false };
}

/** La nota de la tarjeta. Sin IA es del alumno, con IA es generada, en borrador y con su cita */
function noteOf(
  input: QuestionCardInput,
  id: string,
  deckId: string,
  stamp: string,
  createdAt: string,
): Note {
  const topicTag = `${TOPIC_TAG_PREFIX}${input.question.topic}`;
  const common = {
    id,
    deckId,
    editorialStatus: 'draft' as const,
    // No es la pregunta fallada que entra al repaso, como las de Mis errores, así que no se marca
    // como pregunta. De qué pregunta salió lo dice el evento question_card_created
    sourceQuestionVersionId: null,
    isDemo: input.question.isDemo,
    createdAt,
    updatedAt: stamp,
    deletedAt: null,
    ...contentOf(input.draft),
  };
  const { source } = input;
  if (source.kind === 'bank') {
    return { ...common, tags: [topicTag], origin: 'manual', sourceQuote: null };
  }
  return {
    ...common,
    tags: [topicTag, AI_TAG],
    origin: 'generated',
    sourceQuote: source.quote,
    sourceTitle: source.sourceTitle,
    ...(source.controversy ? { controversy: source.controversy } : {}),
  };
}

/** Las creaciones de esta pestaña van una tras otra, así dos toques casi juntos no se pisan */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Crea la tarjeta de una pregunta en el mazo que eligió el alumno. Si ya estaba, de un toque
 * anterior, no la duplica y devuelve exists
 */
export function createQuestionCard(
  api: Api,
  user: Person,
  input: QuestionCardInput,
  now: Date = new Date(),
): Promise<QuestionCardResult> {
  const run = queue.then(() => create(api, user, input, now));
  queue = run.catch(() => undefined);
  return run;
}

async function create(
  api: Api,
  user: Person,
  input: QuestionCardInput,
  now: Date,
): Promise<QuestionCardResult> {
  const problem = validateDraft(input.draft);
  if (problem) throw new RangeError(`La tarjeta no es válida (${problem})`);
  const stamp = now.toISOString();
  const { chosenId, deck, layer } = await resolveTarget(api, user, input, stamp);
  const { question } = input;
  const noteId = questionCardIds.note(user.id, question.questionId, question.version, chosenId);

  const stored = await api.repos.notes.getRaw(noteId);
  const live = stored !== undefined && isLive(stored);
  // Ya estaba. Solo se completa lo que haya faltado si un intento anterior se cortó a la mitad
  const note = live ? stored : noteOf(input, noteId, deck.id, stamp, stamp);
  if (!live) await api.repos.notes.put(note);

  const ordinals = live ? noteOrdinals(note) : cardOrdinals(input.draft);
  const current = new Map(
    (await api.repos.cards.listAllForNotes([noteId])).map((card) => [card.id, card]),
  );
  const writes: Card[] = [];
  for (const ordinal of ordinals) {
    const id = questionCardIds.card(noteId, ordinal);
    const card = current.get(id);
    if (card && isLive(card)) continue;
    // Una carta que se había borrado revive con su historial de repaso, como en Mis errores
    writes.push({
      id,
      noteId,
      deckId: note.deckId,
      ordinal,
      createdAt: card?.createdAt ?? stamp,
      updatedAt: stamp,
      deletedAt: null,
    });
  }
  if (writes.length > 0) await api.repos.cards.putMany(writes);

  // El evento va al final. Si un intento anterior se cortó antes de dejarlo, este lo deja
  const recorded = (
    await api.repos.events.query({ userId: user.id, types: ['question_card_created'] })
  ).some(
    (event) =>
      event.type === 'question_card_created' &&
      event.payload.noteId === noteId &&
      event.at >= note.createdAt,
  );
  if (!recorded) {
    await api.recordEvent(
      createEvent(
        'question_card_created',
        {
          questionId: question.questionId,
          questionVersionId: question.id,
          version: question.version,
          deckId: chosenId,
          noteDeckId: note.deckId,
          noteId,
          source: input.source.kind,
          artifactId: input.source.kind === 'ai' ? input.source.artifactId : null,
          from: input.from,
        },
        { userId: user.id, tz: user.timeZone, clock: { now: () => now } },
      ),
    );
  }
  return { status: live ? 'exists' : 'created', noteId, deckId: note.deckId, layer };
}

/** Los números de carta de una nota ya guardada */
function noteOrdinals(note: Note): number[] {
  switch (note.kind) {
    case 'basic':
      return [0];
    case 'basic_reverse':
      return [0, 1];
    case 'cloze':
      return clozeOrdinals(note.text);
  }
}
