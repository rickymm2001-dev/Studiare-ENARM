// Nombre corto de una tarjeta para citarla como evidencia. Es lo que se le pregunta al alumno al abrir
// la carta, así que en una inversa la carta 1 se nombra por el reverso, y en una cloze ningún hueco
// muestra su respuesta.
import { maskCloze } from '@/data/content/cloze';
import type { Note } from '@/data/schemas/decks';
import { cardFaces } from '../review/study';

const MAX_LENGTH = 110;

export function cardLabel(note: Note, ordinal: number): string {
  const html = note.kind === 'cloze' ? maskCloze(note.text) : cardFaces(note, ordinal).front;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 3)}…` : text;
}
