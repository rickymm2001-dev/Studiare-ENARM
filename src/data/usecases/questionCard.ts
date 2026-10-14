// Crear tarjeta desde una pregunta (D-124, comentario 1).
// El alumno puede crear una tarjeta desde cualquier pregunta de la revisión del examen o de la
// retroalimentación de la práctica. Al frente el caso en corto y la pregunta, y atrás la respuesta
// correcta, la explicación y la referencia. Se puede editar antes de guardar.
// En un mazo precargado la tarjeta va a un submazo privado "Mis tarjetas" que cuelga del precargado (4.16),
// así el mazo compartido no cambia. Los IDs son deterministas por alumno, pregunta, versión y mazo,
// de modo que pulsar dos veces no duplica la tarjeta.
import { stableUlid } from '@/demo/stableId';
import { textToHtml } from '../content/plainText';
import type { DataApi } from '../context';
import { createEvent } from '../events/createEvent';
import type { Option, Question } from '../schemas/bank';
import { isEditableDeck, isLive, type Card, type Deck, type Note } from '../schemas/decks';
import type { User } from '../schemas/people';

const ID_TIME = Date.UTC(2026, 0, 1);

export interface QuestionCardInput {
  question: Pick<Question, 'id' | 'prompt' | 'explanation' | 'topic' | 'gpcRefs'>;
  questionVersionId: string;
  vignette?: string;
  options: readonly Pick<Option, 'id' | 'text' | 'isCorrect' | 'rationale'>[];
  destinationDeckId: string;
  customFront?: string;
  customBack?: string;
  now?: Date;
}

export interface QuestionCardResult {
  card: Card;
  note: Note;
  effectiveDeckId: string;
  created: boolean;
}

/** Genera el frente por omisión de la tarjeta a partir de la viñeta y el enunciado */
export function defaultQuestionFront(prompt: string, vignette?: string): string {
  if (vignette && vignette.trim()) {
    return `${vignette.trim()}\n\n${prompt.trim()}`;
  }
  return prompt.trim();
}

/** Genera el reverso por omisión de la tarjeta con la respuesta correcta, explicación y referencias */
export function defaultQuestionBack(
  options: readonly Pick<Option, 'text' | 'isCorrect'>[],
  explanation?: string | null,
  gpcRefs?: readonly { title: string }[],
): string {
  const correct = options.find((option) => option.isCorrect);
  const parts: string[] = [];
  if (correct) {
    parts.push(`Respuesta correcta:\n${correct.text.trim()}`);
  }
  if (explanation && explanation.trim()) {
    parts.push(`Explicación:\n${explanation.trim()}`);
  }
  if (gpcRefs && gpcRefs.length > 0) {
    const refs = gpcRefs.map((ref) => ref.title).filter(Boolean).join('\n');
    if (refs) parts.push(`Referencias:\n${refs}`);
  }
  return parts.join('\n\n');
}

/**
 * Crea una tarjeta a partir de una pregunta de forma idempotente.
 * Si el mazo elegido es precargado, crea o usa un submazo privado "Mis tarjetas" que cuelga del precargado.
 */
export async function createCardFromQuestion(
  api: Pick<DataApi, 'repos' | 'recordEvent'>,
  user: Pick<User, 'id' | 'timeZone'>,
  input: QuestionCardInput,
): Promise<QuestionCardResult> {
  const { question, questionVersionId, options, destinationDeckId } = input;
  const now = input.now ?? new Date();
  const stamp = now.toISOString();

  // Determinar el mazo efectivo: si el mazo destino no es editable por el usuario (es precargado o ajeno),
  // la tarjeta se aloja en un submazo privado "Mis tarjetas" bajo ese mazo (capa del alumno, 4.16).
  const targetDeck = await api.repos.decks.get(destinationDeckId);
  let effectiveDeckId = destinationDeckId;

  if (targetDeck && !isEditableDeck(targetDeck, user.id)) {
    const allDecks = await api.repos.decks.list();
    const subdeck = allDecks.find(
      (deck) =>
        deck.parentId === targetDeck.id &&
        deck.ownerId === user.id &&
        deck.name === 'Mis tarjetas' &&
        isLive(deck),
    );
    if (subdeck) {
      effectiveDeckId = subdeck.id;
    } else {
      const subdeckId = stableUlid(
        `subdeck|${user.id}|${targetDeck.id}|mis-tarjetas`,
        ID_TIME,
      );
      const newSubdeck: Deck = {
        id: subdeckId,
        name: 'Mis tarjetas',
        description: `Tarjetas propias en ${targetDeck.name}`,
        ownerId: user.id,
        origin: 'manual',
        visibility: 'private',
        isDemo: false,
        parentId: targetDeck.id,
        createdAt: stamp,
        updatedAt: stamp,
      };
      await api.repos.decks.put(newSubdeck);
      effectiveDeckId = subdeckId;
    }
  }

  // IDs deterministas para prevenir duplicados ante pulsaciones dobles o repeticiones
  const noteId = stableUlid(
    `qcard|note|${user.id}|${question.id}|${questionVersionId}|${effectiveDeckId}`,
    ID_TIME,
  );
  const cardId = stableUlid(
    `qcard|card|${user.id}|${question.id}|${questionVersionId}|${effectiveDeckId}`,
    ID_TIME,
  );

  const existingCard = await api.repos.cards.get(cardId);
  if (existingCard) {
    const existingNote = await api.repos.notes.get(noteId);
    if (existingNote) {
      return { card: existingCard, note: existingNote, effectiveDeckId, created: false };
    }
  }

  const frontText =
    input.customFront !== undefined
      ? input.customFront
      : defaultQuestionFront(question.prompt, input.vignette);
  const backText =
    input.customBack !== undefined
      ? input.customBack
      : defaultQuestionBack(options, question.explanation, question.gpcRefs);

  const note: Note = {
    id: noteId,
    deckId: effectiveDeckId,
    kind: 'basic',
    front: textToHtml(frontText),
    back: textToHtml(backText),
    tags: [`topic:${question.topic}`],
    origin: 'manual',
    editorialStatus: 'draft',
    sourceQuote: null,
    // No se enlaza sourceQuestionVersionId para que Repasar la trate como tarjeta manual y no de errores
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const card: Card = {
    id: cardId,
    noteId,
    deckId: effectiveDeckId,
    ordinal: 0,
    createdAt: stamp,
    updatedAt: stamp,
  };

  await api.repos.notes.put(note);
  await api.repos.cards.put(card);

  await api.recordEvent(
    createEvent(
      'question_card_created',
      {
        questionId: question.id,
        questionVersionId,
        cardId,
        deckId: effectiveDeckId,
      },
      {
        userId: user.id,
        tz: user.timeZone,
      },
    ),
  );

  return { card, note, effectiveDeckId, created: true };
}
