// Errores al repaso (7.1). Cada pregunta fallada pasa a Repasar como una tarjeta de pregunta, en un
// mazo privado del alumno. Los IDs son estables por dueño y pregunta, así fallar la misma pregunta dos
// veces no duplica la tarjeta ni reinicia su historial.
//
// Un solo Mis errores entre dispositivos (B14, 2.6 y H05). El dueño de los IDs es la clave de la cuenta
// de la nube cuando la hay, igual en todos los dispositivos, y el id del perfil local cuando no. Antes de
// B14 era siempre el id local, distinto en cada dispositivo, y la sincronización traía el mazo del otro
// como si fuera otro mazo. El mazo lleva la marca system errors y la nota su errorKey, así un dispositivo
// reconoce lo que nació en otro con otra clave, no crea una tarjeta que ya existe y, al sincronizar,
// reconcileErrorDecks une lo que ya estaba repetido.
import { stableUlid } from '@/demo/stableId';
import { errorGroupKey } from '@/engines/errorDeckMerge';
import type { DataApi } from '../context';
import { isLive, type Card, type Deck, type Note } from '../schemas/decks';
import type { User } from '../schemas/people';

/** Momento fijo de los IDs. Lo que cambia entre alumnos y preguntas es la parte aleatoria */
const ID_TIME = Date.UTC(2026, 0, 1);

/** Los ids salen de la clave del dueño. Es la cuenta de la nube o, sin ella, el id del perfil local */
export const errorIds = {
  deck: (ownerKey: string) => stableUlid(`error-deck|${ownerKey}`, ID_TIME),
  note: (ownerKey: string, key: string) => stableUlid(`error-note|${ownerKey}|${key}`, ID_TIME),
  card: (ownerKey: string, key: string) => stableUlid(`error-card|${ownerKey}|${key}`, ID_TIME),
};

/**
 * La clave del dueño de Mis errores. Con cuenta de la nube es el id de la cuenta, el mismo en todos los
 * dispositivos. Sin ella, el id del perfil local, como antes de B14
 */
export async function errorOwnerKey(api: Pick<DataApi, 'repos'>, userId: string): Promise<string> {
  const state = await api.repos.syncState.get(userId);
  return state?.authId ?? userId;
}

/** Las claves con las que este dispositivo pudo haber armado Mis errores, la de la cuenta y la local */
export function errorOwnerKeys(userId: string, ownerKey: string): string[] {
  return ownerKey === userId ? [userId] : [ownerKey, userId];
}

/** Los mazos vivos del alumno que son Mis errores, con la marca o con un id que este dispositivo armó */
export function liveErrorDecks(
  decks: readonly Deck[],
  userId: string,
  keys: readonly string[],
): Deck[] {
  const known = new Set(keys.map((key) => errorIds.deck(key)));
  return decks.filter(
    (deck) =>
      deck.ownerId === userId && isLive(deck) && (deck.system === 'errors' || known.has(deck.id)),
  );
}

/** Etiqueta de la nota con la subespecialidad de la pregunta, para filtrar en Repasar */
export const TOPIC_TAG_PREFIX = 'topic:';

export interface ErrorCardInput {
  /** Versión de la pregunta que falló. Es la fuente de la tarjeta */
  questionVersionId: string;
  /**
   * Identifica la tarjeta para no duplicarla. Por defecto es la pregunta. Una tarjeta de contraste
   * entre dos preguntas lleva su propia clave
   */
  key?: string;
  /** Subespecialidad de la pregunta */
  topic: string;
  /** La tarjeta hereda el estado editorial y la marca de demostración de su pregunta */
  editorialStatus: Note['editorialStatus'];
  isDemo: boolean;
  front: string;
  back: string;
  /** Frase del banco que respalda la tarjeta (4.1) */
  quote: string;
}

/** Cuántas notas vivas tiene el alumno en Mis errores, sin importar con qué clave de dueño nacieron */
export async function countErrorCards(
  api: Pick<DataApi, 'repos'>,
  userId: string,
): Promise<number> {
  const keys = errorOwnerKeys(userId, await errorOwnerKey(api, userId));
  const decks = liveErrorDecks(await api.repos.decks.listAll(), userId, keys);
  let total = 0;
  for (const deck of decks) {
    total += (await api.repos.notes.listAllByDeck(deck.id)).filter(isLive).length;
  }
  return total;
}

const frontOf = (note: Note) => (note.kind === 'cloze' ? note.text : note.front);

/**
 * Crea las tarjetas de error que todavía no existen y el mazo si falta. Devuelve cuántas tarjetas
 * nuevas quedaron. Una pregunta que ya tiene tarjeta no se toca, la haya creado este dispositivo o
 * otro de la misma cuenta
 */
export async function queueErrorCards(
  api: Pick<DataApi, 'repos'>,
  user: Pick<User, 'id'>,
  inputs: readonly ErrorCardInput[],
  deck: { name: string; description: string },
  now: Date = new Date(),
): Promise<number> {
  const keyOf = (input: ErrorCardInput) => input.key ?? input.questionVersionId;
  const seen = new Set<string>();
  const unique = inputs.filter((input) => {
    if (seen.has(keyOf(input))) return false;
    seen.add(keyOf(input));
    return true;
  });
  if (unique.length === 0) return 0;

  const ownerKey = await errorOwnerKey(api, user.id);
  const keys = errorOwnerKeys(user.id, ownerKey);
  const errorDecks = liveErrorDecks(await api.repos.decks.listAll(), user.id, keys);

  // Las notas de Mis errores que ya hay, por tarjeta. Se leen solo si alguna pregunta no tiene todavía
  // una tarjeta con los ids de este dispositivo
  let known: Map<string, Note> | null = null;
  const knownNotes = async (): Promise<Map<string, Note>> => {
    if (known) return known;
    const found = new Map<string, Note>();
    for (const errorDeck of errorDecks) {
      for (const note of await api.repos.notes.listAllByDeck(errorDeck.id)) {
        if (!isLive(note)) continue;
        const group = errorGroupKey({
          errorKey: note.errorKey,
          questionVersionId: note.sourceQuestionVersionId,
          front: frontOf(note),
        });
        if (group !== null && !found.has(group)) found.set(group, note);
      }
    }
    known = found;
    return found;
  };

  // La tarjeta se guarda al final, así si un intento se cortó entre la nota y la tarjeta el
  // siguiente la completa en vez de darla por hecha
  const alreadyThere = async (input: ErrorCardInput): Promise<boolean> => {
    const key = keyOf(input);
    for (const owner of keys) {
      if (await api.repos.cards.get(errorIds.card(owner, key))) return true;
    }
    // La misma tarjeta nacida en otro dispositivo con otra clave de dueño
    const group = errorGroupKey({
      errorKey: key,
      questionVersionId: input.questionVersionId,
      front: input.front,
    });
    const note = group === null ? undefined : (await knownNotes()).get(group);
    if (!note) return false;
    return (await api.repos.cards.listAllForNotes([note.id])).some(isLive);
  };
  const fresh: ErrorCardInput[] = [];
  for (const input of unique) {
    if (!(await alreadyThere(input))) fresh.push(input);
  }
  if (fresh.length === 0) return 0;

  // Las tarjetas van al mazo de la clave de la cuenta o, si no existe, al que ya hay, el más antiguo, que
  // es el que deja la unión al sincronizar. Si no hay ninguno se crea con la marca
  const accountDeckId = errorIds.deck(ownerKey);
  const target =
    errorDecks.find((entry) => entry.id === accountDeckId) ??
    [...errorDecks].sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )[0];
  const deckId = target?.id ?? accountDeckId;
  const anyDemo = fresh.some((input) => input.isDemo);
  if (!target || (anyDemo && !target.isDemo)) {
    const stamp = now.toISOString();
    const entity: Deck = target
      ? // Basta una tarjeta de demostración para que el mazo lleve la etiqueta (4.6)
        { ...target, system: 'errors', isDemo: true, updatedAt: stamp }
      : {
          id: deckId,
          name: deck.name,
          description: deck.description,
          ownerId: user.id,
          origin: 'generated',
          visibility: 'private',
          system: 'errors',
          isDemo: anyDemo,
          createdAt: stamp,
        };
    await api.repos.decks.put(entity);
  }

  const notes: Note[] = [];
  const cards: Card[] = [];
  fresh.forEach((input, index) => {
    // Un milisegundo de diferencia por tarjeta conserva el orden en que se fallaron
    const createdAt = new Date(now.getTime() + index).toISOString();
    const key = keyOf(input);
    const noteId = errorIds.note(ownerKey, key);
    notes.push({
      id: noteId,
      deckId,
      kind: 'basic',
      front: input.front,
      back: input.back,
      tags: [`${TOPIC_TAG_PREFIX}${input.topic}`],
      origin: 'generated',
      editorialStatus: input.editorialStatus,
      sourceQuote: input.quote,
      sourceQuestionVersionId: input.questionVersionId,
      errorKey: key,
      isDemo: input.isDemo,
      createdAt,
    });
    cards.push({
      id: errorIds.card(ownerKey, key),
      noteId,
      deckId,
      ordinal: 0,
      createdAt,
    });
  });
  await api.repos.notes.putMany(notes);
  await api.repos.cards.putMany(cards);
  return fresh.length;
}
