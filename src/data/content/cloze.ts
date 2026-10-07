// Huecos de una tarjeta cloze, {{c1::respuesta}} o {{c1::respuesta::pista}}. Un solo patrón para
// validar lo que escribe el alumno y para pintar la tarjeta, así lo que el editor acepta es lo que
// el repaso muestra. Un hueco que no cierra con }} no es un hueco.

const HOLE = String.raw`\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}`;

/** Expresión nueva cada vez, porque las globales guardan por dónde van leyendo */
export const clozePattern = () => new RegExp(HOLE, 'g');

export interface ClozeHole {
  ordinal: number;
  answer: string;
  hint: string | undefined;
}

/** Los huecos completos de un texto, en el orden en que aparecen */
export function clozeHoles(text: string): ClozeHole[] {
  return [...text.matchAll(clozePattern())].map((match) => ({
    ordinal: Number(match[1]),
    answer: match[2] ?? '',
    hint: match[3],
  }));
}

/** Cuántos huecos se abrieron con {{cN::, cierren o no */
export function clozeOpenings(text: string): number {
  return (text.match(/\{\{c\d+::/g) ?? []).length;
}
