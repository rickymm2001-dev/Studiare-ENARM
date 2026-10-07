// Convierte los mazos demo (JSON) en mazos, notas y tarjetas de la base con IDs estables (D-053).
// Los mazos forman un árbol (D-085, fila 3). ENARM 2027 es la raíz, cada mazo de Paco cuelga de ella
// como rama y cada materia, que es el segundo nivel de la etiqueta original, es un submazo. Las
// etiquetas pasan a ser una sola ruta sin espacios, por ejemplo Medicina-Interna::Infectología::Sepsis.
// Una tarjeta por nota básica y una por cada hueco de las notas cloze.
import { normalizeTags, sanitizeTag, tagSegments } from '@/engines/tagPath';
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

/** Clave y nombre del mazo raíz que contiene a todos los precargados */
export const ROOT_DECK_KEY = 'enarm-2027';
export const ROOT_DECK_NAME = 'ENARM 2027';

export const deckIds = {
  deck: (deckKey: string) => stableUlid(`deck|${deckKey}`, DEMO_CONTENT_TIME),
  /** El submazo de una materia dentro de un mazo precargado */
  subject: (deckKey: string, subject: string) =>
    stableUlid(`deck|${deckKey}::${subject}`, DEMO_CONTENT_TIME),
  note: (noteKey: string) => stableUlid(`note|${noteKey}`, DEMO_CONTENT_TIME),
  card: (cardKey: string) => stableUlid(`card|${cardKey}`, DEMO_CONTENT_TIME),
};

/** La ruta de etiqueta de una nota. La original ya viene sin espacios y se conserva con sus niveles */
export function noteTagPath(note: Pick<DemoDeckNote, 'sourceTag' | 'tags'>): string[] {
  const path = sanitizeTag(note.sourceTag);
  return path === '' ? normalizeTags(note.tags) : [path];
}

/** La materia de una nota, el segundo nivel de su etiqueta. null si la etiqueta solo tiene un nivel */
export function noteSubject(note: Pick<DemoDeckNote, 'sourceTag'>): string | null {
  return tagSegments(sanitizeTag(note.sourceTag))[1] ?? null;
}

/** Nombre legible de una materia. Los guiones y guiones bajos de la etiqueta pasan a espacios */
const subjectName = (subject: string) => subject.replace(/[-_]+/g, ' ').trim();

const deckBase = {
  ownerId: null,
  origin: 'preloaded' as const,
  visibility: 'public' as const,
  isDemo: true,
  createdAt,
  updatedAt: createdAt,
};

export function buildDeckEntities(files: readonly DemoDeckFile[]): DemoDeckEntities {
  const decks: Deck[] = [];
  const notes: Note[] = [];
  const cards: DemoDeckCard[] = [];
  const rootId = deckIds.deck(ROOT_DECK_KEY);
  if (files.length > 0) {
    decks.push(
      DeckSchema.parse({
        ...deckBase,
        id: rootId,
        name: ROOT_DECK_NAME,
        description: 'Todo el contenido precargado, ordenado por rama y materia. Demostración.',
        parentId: null,
      }),
    );
  }
  for (const file of files) {
    const fileDeckId = deckIds.deck(file.key);
    decks.push(
      DeckSchema.parse({
        ...deckBase,
        id: fileDeckId,
        name: file.name,
        description: `${file.description} Autor ${file.author}.`,
        parentId: rootId,
      }),
    );
    // Un submazo por materia, en el orden en que aparece cada una
    const subjectDecks = new Map<string, string>();
    for (const note of file.notes) {
      const subject = noteSubject(note);
      if (subject === null || subjectDecks.has(subject)) continue;
      const id = deckIds.subject(file.key, subject);
      subjectDecks.set(subject, id);
      decks.push(
        DeckSchema.parse({
          ...deckBase,
          id,
          name: subjectName(subject),
          description: '',
          parentId: fileDeckId,
        }),
      );
    }
    for (const note of file.notes) {
      const noteId = deckIds.note(note.key);
      const subject = noteSubject(note);
      const deckId = (subject === null ? undefined : subjectDecks.get(subject)) ?? fileDeckId;
      const common = {
        id: noteId,
        deckId,
        tags: noteTagPath(note),
        origin: 'preloaded' as const,
        editorialStatus: 'draft' as const,
        sourceQuote: null,
        sourceQuestionVersionId: null,
        isDemo: true,
        createdAt,
        updatedAt: createdAt,
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
          card: CardSchema.parse({
            id: deckIds.card(key),
            noteId,
            deckId,
            ordinal,
            createdAt,
            updatedAt: createdAt,
          }),
        });
      }
    }
  }
  return { decks, notes, cards };
}
