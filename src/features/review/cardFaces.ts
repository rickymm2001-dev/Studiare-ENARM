// Las dos caras de una carta como las ve el alumno. Una básica muestra su frente y su reverso. Una
// con huecos esconde el hueco de la carta al frente y lo resalta al revelar, con la nota extra
// debajo. Lo usan Repasar y Explorar, para que las dos muestren lo mismo.
import type { Card, Note } from '@/data/schemas/decks';
import { renderCloze } from './study';

export interface CardFaces {
  front: string;
  back: string;
}

export function cardFaces(note: Note, card: Pick<Card, 'ordinal'>): CardFaces {
  if (note.kind === 'basic') return { front: note.front, back: note.back };
  return {
    front: renderCloze(note.text, card.ordinal, false),
    back: `${renderCloze(note.text, card.ordinal, true)}${note.extra ? `<br>${note.extra}` : ''}`,
  };
}
