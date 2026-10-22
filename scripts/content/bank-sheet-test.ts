// El Sheet de prueba del banco como .xlsx (B11, 3.11 y guion de la sección 8 del plan de B11). Lleva
// los renglones simulados del Sheet de prueba despues (tests/fixtures/bank-sheet/despues.json), con la
// estructura de PC 7.4, la pestaña Temas, la pestaña Listas con sus rangos con nombre y las validaciones
// de cada columna, incluidas las listas que dependen de la rama con INDIRECTO. Ricardo lo sube a su
// Drive, lo guarda como Hojas de cálculo de Google y lo comparte con la cuenta de servicio. Ahí se
// prueba si las listas dependientes funcionan (8.34). Todo el texto dice [Prueba] y es simulado.
// Uso: npm run bank:sheet-test             escribe content-drafts/bank-sheet/Studiare-banco-prueba.xlsx
//      npm run bank:sheet-test -- otra.xlsx
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import type { FakeSheetFixture } from '../../supabase/functions/_shared/bank/fakeGoogle.ts';
import { readFixture } from './bank-sheet-fixture.ts';
import { addListsSheet, columnLetter, type ListsLayout } from './bank-sheet-lists.ts';
import {
  HEADERS,
  OPTION_LETTERS,
  SHEET_HEADERS,
  firstHeaderLine,
  loadTaxonomies,
  optionHeaders,
  type ContentTaxonomies,
} from './bankColumns.ts';

/** Renglones con validación debajo de los encabezados, de sobra para probar */
export const TEST_SHEET_ROWS = 500;

const HEADER_FILL = 'FF0E5A6B';

/** Los valores de una pestaña del archivo de prueba, por su título */
export function fixtureValues(fixture: FakeSheetFixture, tab: string): string[][] {
  const ranges = fixture.values.valueRanges as { range?: string; values?: unknown[][] }[];
  const found = ranges.find((range) => (range.range ?? '').replace(/^'|'?!.*$/g, '') === tab);
  return (found?.values ?? []).map((row) =>
    row.map((cell) =>
      typeof cell === 'string' ? cell : typeof cell === 'number' ? String(cell) : '',
    ),
  );
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
}

interface ValidationHost {
  dataValidations: { add: (address: string, validation: ExcelJS.DataValidation) => void };
}

/** Las validaciones de la pestaña Preguntas, por encabezado, con las listas de la pestaña Listas */
function addValidations(sheet: ExcelJS.Worksheet, headers: readonly string[], layout: ListsLayout) {
  // exceljs no declara dataValidations en el tipo de la hoja, pero lo escribe como rangos
  const host = sheet as unknown as ValidationHost;
  const letterOf = (header: string): string | null => {
    const index = headers.findIndex((item) => firstHeaderLine(item) === header);
    return index === -1 ? null : columnLetter(index + 1);
  };
  const branch = letterOf(HEADERS.branch);
  const topic = letterOf(HEADERS.topic);
  const list = (header: string, formula: string, warning = false) => {
    const letter = letterOf(header);
    if (letter === null) return;
    host.dataValidations.add(`${letter}2:${letter}${TEST_SHEET_ROWS + 1}`, {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: warning ? 'warning' : 'stop',
      errorTitle: 'Valor fuera de la lista',
      error: 'Elige un valor de la lista desplegable.',
    });
  };
  list(HEADERS.branch, 'RAMAS');
  if (branch !== null) {
    list(HEADERS.topic, `INDIRECT("SUB_"&VLOOKUP($${branch}2,${layout.branchLookup},2,FALSE))`);
    if (topic !== null) {
      list(
        HEADERS.subtopic,
        `INDIRECT("TEMA_"&VLOOKUP($${branch}2&"|"&$${topic}2,${layout.topicLookup},2,FALSE))`,
      );
    }
  }
  list(HEADERS.difficulty, '"1,2,3,4,5"');
  // Varios tipos van separados por coma, así que la lista solo advierte
  list(HEADERS.kind, 'LISTA_TIPOS', true);
  list(HEADERS.task, 'LISTA_TAREAS');
  list(HEADERS.polarity, 'LISTA_POLARIDAD');
  list(HEADERS.correct, `"${OPTION_LETTERS.slice(0, 6).join(',')}"`);
  for (const letter of OPTION_LETTERS) list(optionHeaders(letter).bias, 'LISTA_SESGOS');
  list(HEADERS.status, 'LISTA_ESTADOS');
  list(SHEET_HEADERS.language, 'LISTA_IDIOMAS');
  list(SHEET_HEADERS.cognitiveLevel, 'LISTA_NIVELES');
  list(SHEET_HEADERS.passageLicense, 'LISTA_LICENCIAS');
  list(SHEET_HEADERS.caseOrder, '"1,2,3,4,5"');
}

/** Arma el libro del Sheet de prueba. Es una función de los datos, sin tocar el disco */
export function buildTestSheetWorkbook(
  fixture: FakeSheetFixture,
  data: ContentTaxonomies,
): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = 'Studiare';
  book.created = new Date(0);

  const intro = book.addWorksheet('Instrucciones');
  intro.columns = [{ width: 110 }];
  for (const line of [
    'Sheet de prueba del banco de Studiare',
    '[Prueba] Todo el contenido es simulado y no es contenido médico.',
    'La sincronización lo lee siempre en solo reporte. Nada de aquí entra al banco.',
    'Sirve para probar la cuenta de servicio, el reporte de renglones y las listas que dependen de la rama.',
    'Las instrucciones del Sheet real están en docs/SHEET_DEL_BANCO.md.',
  ]) {
    intro.addRow([line]);
  }
  intro.getRow(1).font = { bold: true, size: 14 };

  const questions = fixtureValues(fixture, 'Preguntas');
  const [headers = [], ...rows] = questions;
  const sheet = book.addWorksheet('Preguntas');
  sheet.addRow(headers);
  styleHeader(sheet.getRow(1));
  for (const row of rows) sheet.addRow(row);
  headers.forEach((header, index) => {
    const long = /Caso clínico|Pregunta|Opción|Justificación|Explicación|Referencias/.test(header);
    sheet.getColumn(index + 1).width = long ? 40 : 16;
    if (long) sheet.getColumn(index + 1).alignment = { vertical: 'top', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  const topics = book.addWorksheet('Temas');
  for (const row of fixtureValues(fixture, 'Temas')) topics.addRow(row);
  styleHeader(topics.getRow(1));
  for (let column = 1; column <= 3; column += 1) topics.getColumn(column).width = 36;

  const layout = addListsSheet(book, data);
  addValidations(sheet, headers, layout);
  return book;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const root = resolve(import.meta.dirname, '..', '..');
  const output = resolve(
    process.argv[2] ?? resolve(root, 'content-drafts/bank-sheet/Studiare-banco-prueba.xlsx'),
  );
  mkdirSync(dirname(output), { recursive: true });
  await buildTestSheetWorkbook(readFixture('despues'), loadTaxonomies(root)).xlsx.writeFile(output);
  console.log(`Sheet de prueba en ${output}. No lo subas al repo`);
}
