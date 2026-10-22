// Exportar tarjetas a CSV (D-093). El archivo trae las directivas de Anki al inicio, para que Anki
// 2.1.54 o más nuevo sepa qué columna es cada cosa, y un identificador por nota. Con ese
// identificador, volver a importar el archivo en Studiare o en Anki no duplica nada. Los tipos de
// nota llevan los nombres que Anki ya conoce, Basic, Basic (and reversed card) y Cloze.
import type { Note } from '../schemas/decks';

export interface CsvRow {
  note: Note;
  /** Ruta del mazo de la nota, de la raíz a la hoja */
  deckPath: readonly string[];
}

const NOTE_TYPE: Record<Note['kind'], string> = {
  basic: 'Basic',
  basic_reverse: 'Basic (and reversed card)',
  cloze: 'Cloze',
};

/** Lo que una hoja de cálculo toma por el inicio de una fórmula (CWE-1236) */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Antepone un apóstrofo a una celda que empieza como fórmula, para que Excel o Sheets la lean como
 * texto aunque venga de un mazo importado de otra persona. Importar el CSV lo quita de vuelta con
 * restoreFormula, así el texto del alumno no cambia al ir y venir
 */
export function neutralizeFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

/** Quita el apóstrofo que puso neutralizeFormula, y solo si lo que sigue empieza como fórmula */
export function restoreFormula(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

/** La celda va entre comillas si trae coma, comillas, saltos de línea o espacios en las orillas */
function cell(raw: string, always = false): string {
  const value = neutralizeFormula(raw);
  const needsQuotes = always || /[",\r\n]/.test(value) || value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

const HEADER = [
  '#separator:Comma',
  '#html:true',
  '#guid column:1',
  '#notetype column:2',
  '#deck column:3',
  '#tags column:6',
  '#columns:Guid,Notetype,Deck,Front,Back,Tags',
];

export function buildCsv(rows: readonly CsvRow[]): string {
  const lines = rows.map(({ note, deckPath }) => {
    const [front, back] = note.kind === 'cloze' ? [note.text, note.extra] : [note.front, note.back];
    return [
      cell(note.sourceGuid ?? note.id),
      cell(NOTE_TYPE[note.kind]),
      cell(deckPath.join('::')),
      cell(front, true),
      cell(back, true),
      cell(note.tags.join(' ')),
    ].join(',');
  });
  return [...HEADER, ...lines].join('\r\n') + '\r\n';
}
