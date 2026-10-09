// Plantillas descargables del importador (pantalla 22). El Excel viene hecho en public/plantillas y
// aquí se arman el CSV y el JSON con los mismos encabezados y la misma fila de ejemplo, que el
// importador omite por su ID. Los encabezados salen de bankColumns.ts, no de textos escritos aquí.
import {
  DRAFT_STATE_LABEL,
  EXAMPLE_ID,
  HEADERS,
  MIN_BANK_OPTIONS,
  OPTION_LETTERS,
  PLACEHOLDER,
  PLACEHOLDER_PICK,
  TEMPLATE_OPTIONS,
  optionHeaders,
} from '@/data/content/bankColumns';

// La marca de orden de bytes se escribe con su código para que ningún editor ni formateador la
// convierta en un carácter invisible dentro del archivo
export const BOM = String.fromCharCode(0xfeff);

export const EXCEL_TEMPLATE_FILE = 'plantillas/Studiare-banco-plantilla.xlsx';

const OPTION_COLUMNS = OPTION_LETTERS.slice(0, TEMPLATE_OPTIONS).flatMap((letter) =>
  Object.values(optionHeaders(letter)),
);
export const TEMPLATE_COLUMNS: readonly string[] = [...Object.values(HEADERS), ...OPTION_COLUMNS];

/** La fila de ejemplo, con marcadores neutros y sin nada de medicina */
export function exampleRecord(): Record<string, string> {
  const example: Record<string, string> = {
    [HEADERS.id]: EXAMPLE_ID,
    [HEADERS.branch]: PLACEHOLDER_PICK,
    [HEADERS.topic]: PLACEHOLDER_PICK,
    [HEADERS.subtopic]: PLACEHOLDER_PICK,
    [HEADERS.difficulty]: 'Elige de 1 a 5',
    [HEADERS.vignette]: `${PLACEHOLDER} el caso clínico`,
    [HEADERS.prompt]: `${PLACEHOLDER} la pregunta`,
    [HEADERS.correct]: 'A',
    [HEADERS.explanation]: `${PLACEHOLDER} la explicación de la respuesta`,
    [HEADERS.refs]: `${PLACEHOLDER} el título de la guía de práctica clínica o de la norma`,
    [HEADERS.status]: DRAFT_STATE_LABEL,
  };
  OPTION_LETTERS.slice(0, MIN_BANK_OPTIONS).forEach((letter, index) => {
    const names = optionHeaders(letter);
    example[names.text] = `${PLACEHOLDER} la opción ${letter}`;
    example[names.rationale] =
      index === 0
        ? `${PLACEHOLDER} por qué la opción ${letter} es la correcta`
        : `${PLACEHOLDER} por qué la opción ${letter} atrae`;
    if (index > 0) example[names.bias] = PLACEHOLDER_PICK;
  });
  return example;
}

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

/** CSV con encabezados y la fila de ejemplo, listo para abrir en Excel */
export function csvTemplate(): string {
  const example = exampleRecord();
  const lines = [
    TEMPLATE_COLUMNS.map(csvCell).join(','),
    TEMPLATE_COLUMNS.map((column) => csvCell(example[column] ?? '')).join(','),
  ];
  // Con la marca de orden de bytes Excel abre el archivo con los acentos bien
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/** JSON con un objeto de ejemplo, que usa los mismos encabezados como llaves */
export function jsonTemplate(): string {
  const example = exampleRecord();
  const record = Object.fromEntries(
    TEMPLATE_COLUMNS.map((column) => [column, example[column] ?? '']),
  );
  return `${JSON.stringify([record], null, 2)}\n`;
}

/** Baja un texto como archivo. Solo se usa desde un clic */
export function downloadText(fileName: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
