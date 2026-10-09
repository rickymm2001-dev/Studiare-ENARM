// Lee la plantilla de Excel del banco (bankTemplate.ts) ya llenada por el médico y la convierte al
// formato de borrador de preguntas que revisa check-draft.ts, el mismo de bank-convert.ts. No decide
// nada de medicina. Solo traduce los nombres de la lista a las claves de las taxonomías, arma las
// opciones (de 4 a 6, con las demás en blanco) y avisa con el número de fila lo que no se pueda
// representar. Una fila con problemas no pasa a la salida. La revisión de fondo, como que la
// explicación no esté vacía o que el set canónico incluya la correcta, la hacen draftRules.ts y el
// esquema del lote. Funciones puras de un libro ya leído, para probarlas sin disco.
import ExcelJS from 'exceljs';
import { basename, extname } from 'node:path';
import { normalizeText } from './bankColumns.ts';
import {
  convertTable,
  type BankTable,
  type ConvertContext,
  type ConvertResult,
  type ConvertedQuestion,
} from '../../src/data/content/bankConvert.ts';

export type ImportContext = ConvertContext;
export type ImportedQuestion = ConvertedQuestion;
export type ImportResult = ConvertResult;

/** Texto de una celda sin importar si Excel la guardó como número, texto con formato o fórmula */
export function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value)
    return value.richText
      .map((part) => part.text)
      .join('')
      .trim();
  if ('result' in value) return cellText(value.result);
  if ('text' in value) return cellText(value.text);
  return '';
}

/** Prefijo de las claves sin ID, a partir del nombre del archivo */
export function bankPrefix(file: string): string {
  const slug = normalizeText(basename(file, extname(file)))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug === '' ? 'banco' : slug;
}

export async function loadWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(file);
  return book;
}

/** Pasa la hoja a la tabla de texto que entiende el convertidor compartido de la app */
function sheetToTable(sheet: ExcelJS.Worksheet): BankTable {
  const lastColumn = sheet.columnCount;
  const text = (row: ExcelJS.Row) =>
    Array.from({ length: lastColumn }, (_, index) => cellText(row.getCell(index + 1).value));
  const rows: { rowNumber: number; cells: string[] }[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    rows.push({ rowNumber, cells: text(sheet.getRow(rowNumber)) });
  }
  return { name: `la hoja ${sheet.name}`, headers: text(sheet.getRow(1)), rows };
}

/** Convierte las filas de la hoja Preguntas. Cada fila con problemas se queda fuera de la salida */
export function convertSheet(
  sheet: ExcelJS.Worksheet,
  context: ImportContext,
  options: { prefix: string },
): ImportResult {
  return convertTable(sheetToTable(sheet), context, options);
}

/** Convierte el libro entero. Lee la hoja Preguntas, o la primera si el médico la renombró */
export function convertWorkbook(
  book: ExcelJS.Workbook,
  context: ImportContext,
  options: { prefix: string },
): ImportResult {
  const sheet = book.getWorksheet('Preguntas') ?? book.worksheets[0];
  if (!sheet)
    return {
      questions: [],
      problems: ['El archivo no tiene hojas'],
      rowProblems: [],
      meta: {},
      notes: [],
      rows: 0,
      skippedExamples: 0,
    };
  return convertSheet(sheet, context, options);
}
