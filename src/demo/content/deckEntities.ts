// Convierte los mazos demo (JSON) en mazos, notas y tarjetas de la base con IDs estables (D-053).
// Una tarjeta por nota básica y una por cada hueco de las notas cloze.
import type { DemoDeckFile, DemoDeckNote } from '@/data/schemas/content';
import {
  CardSchema,
  DeckSchema,
  NoteSchema,
  type Card,
  type Deck,
  type Note,
} from '@/data/schemas/decks';
import { DEMO_CONTENT_TIME, stableUlid } from '../stableId';

export interface DemoDeckCard {
  /** Clave estable de la tarjeta, por ejemplo paco-mi-0001 o paco-mi-0002-c1 */
  key: string;
  card: Card;
  note: DemoDeckNote;
  deckKey: string;
}

export interface DemoDeckEntities {
  decks: Deck[];
  notes: Note[];
  cards: DemoDeckCard[];
}

const createdAt = new Date(DEMO_CONTENT_TIME).toISOString();

export const deckIds = {
  deck: (deckKey: string) => stableUlid(`deck|${deckKey}`, DEMO_CONTENT_TIME),
  note: (noteKey: string) => stableUlid(`note|${noteKey}`, DEMO_CONTENT_TIME),
  card: (cardKey: string) => stableUlid(`card|${cardKey}`, DEMO_CONTENT_TIME),
};

export function buildDeckEntities(files: readonly DemoDeckFile[]): DemoDeckEntities {
  const decks: Deck[] = [];
  const notes: Note[] = [];
  const cards: DemoDeckCard[] = [];
  for (const file of files) {
    const deckId = deckIds.deck(file.key);
    decks.push(
      DeckSchema.parse({
        id: deckId,
        name: file.name,
        description: `${file.description} Autor ${file.author}.`,
        ownerId: null,
        origin: 'preloaded',
        visibility: 'public',
        isDemo: true,
        createdAt,
      }),
    );
    for (const note of file.notes) {
      const noteId = deckIds.note(note.key);
      const common = {
        id: noteId,
        deckId,
        tags: note.tags,
        origin: 'preloaded' as const,
        editorialStatus: 'draft' as const,
        sourceQuote: null,
        sourceQuestionVersionId: null,
        isDemo: true,
        createdAt,
      };
      notes.push(
        NoteSchema.parse(
          note.kind === 'basic'
            ? { ...common, kind: 'basic', front: note.front, back: note.back }
            : { ...common, kind: 'cloze', text: note.text, extra: note.extra },
        ),
      );
      const ordinals = note.kind === 'basic' ? [0] : note.ordinals;
      for (const ordinal of ordinals) {
        const key = note.kind === 'basic' ? note.key : `${note.key}-c${ordinal}`;
        cards.push({
          key,
          note,
          deckKey: file.key,
          card: CardSchema.parse({ id: deckIds.card(key), noteId, deckId, ordinal, createdAt }),
        });
      }
    }
  }
  return { decks, notes, cards };
}
