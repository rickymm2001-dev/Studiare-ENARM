// Del Sheet a la tabla de texto que entiende el convertidor (B11, 3.2 del plan de B11). Tres
// peticiones por corrida, lejos de la cuota. Las propiedades de las pestañas, los valores con formato de
// Preguntas y de Temas en un batchGet, y la columna ID con sus fórmulas, para saber si el ID todavía es
// una fórmula que cambia al ordenar renglones (PC 7.2). Nunca registra el texto de una celda.
import type { BankTable } from './generated/bankConvert.ts';
import {
  firstHeaderLine,
  HEADERS,
  normalizeText,
  type TaxonomyBranch,
} from './generated/bankColumns.ts';
import { columnLetter, GoogleError, sheetRange, type GoogleClient } from './google.ts';

export interface SheetSettings {
  /** Pestaña de las preguntas, Preguntas por omisión */
  tab: string;
  /** Renglones de datos que se leen como máximo */
  maxRows: number;
}

export interface SheetRead {
  table: BankTable;
  /** La columna ID trae fórmulas. Con ellas la corrida queda en solo reporte (8.1) */
  idFormula: boolean;
  /** El Sheet tiene más renglones que maxRows. Se procesaron los primeros */
  truncated: boolean;
  /** Renglones de Temas que no coinciden con la taxonomía. null si no hay pestaña Temas */
  topicMismatches: number | null;
}

/** Texto de una celda de la API. Los números y booleanos llegan como texto con FORMATTED_VALUE */
export function cellText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

/** Los renglones de la API a la tabla del convertidor. El renglón 1 son los encabezados */
export function tableFromValues(name: string, values: readonly (readonly unknown[])[]): BankTable {
  const [headerRow = [], ...rows] = values;
  return {
    name,
    headers: headerRow.map(cellText),
    rows: rows.map((cells, index) => ({ rowNumber: index + 2, cells: cells.map(cellText) })),
  };
}

/** La columna del ID, por su encabezado y solo con la primera línea. null si no está */
export function idColumnOf(headers: readonly string[]): number | null {
  const index = headers.findIndex(
    (header) => normalizeText(firstHeaderLine(header)) === normalizeText(HEADERS.id),
  );
  return index === -1 ? null : index + 1;
}

/** Si alguna celda de la columna ID es una fórmula */
export function hasFormulas(values: readonly (readonly unknown[])[]): boolean {
  return values.some((row) => row.some((cell) => typeof cell === 'string' && cell.startsWith('=')));
}

/**
 * Cuántos renglones de la pestaña Temas no coinciden con la taxonomía de la app. La pestaña lleva Rama
 * troncal, Subespecialidad y Subtema por nombre. Solo se cuenta, no se cambia nada (3.2)
 */
export function topicMismatches(
  values: readonly (readonly unknown[])[],
  branches: readonly TaxonomyBranch[],
): number {
  const [headerRow = [], ...rows] = values;
  const headers = headerRow.map((cell) => normalizeText(firstHeaderLine(cellText(cell))));
  const column = (name: string) => headers.indexOf(normalizeText(name));
  const branchColumn = column(HEADERS.branch);
  const topicColumn = column(HEADERS.topic);
  const subtopicColumn = column(HEADERS.subtopic);
  if (branchColumn === -1 || topicColumn === -1 || subtopicColumn === -1) return rows.length;
  const known = new Set(
    branches.flatMap((branch) =>
      branch.topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) =>
          [branch.name, topic.name, subtopic.name].map(normalizeText).join('|'),
        ),
      ),
    ),
  );
  let mismatches = 0;
  for (const row of rows) {
    const key = [branchColumn, topicColumn, subtopicColumn]
      .map((index) => normalizeText(cellText(row[index])))
      .join('|');
    if (key.replace(/\|/g, '') === '') continue;
    if (!known.has(key)) mismatches += 1;
  }
  return mismatches;
}

/** Lee el Sheet del banco. Lanza GoogleError con el paso y el código si algo falla */
export async function readBankSheet(
  client: GoogleClient,
  spreadsheetId: string,
  settings: SheetSettings,
  branches: readonly TaxonomyBranch[],
): Promise<SheetRead> {
  const sheets = await client.sheets(spreadsheetId);
  const wanted = normalizeText(settings.tab);
  const tab =
    sheets.find((sheet) => sheet.title === settings.tab) ??
    sheets.find((sheet) => normalizeText(sheet.title) === wanted);
  if (!tab) throw new GoogleError('tab_missing', 404);
  const topicsTab = sheets.find((sheet) => normalizeText(sheet.title) === 'temas');
  const ranges = [sheetRange(tab.title, `1:${settings.maxRows + 1}`)];
  if (topicsTab) ranges.push(sheetRange(topicsTab.title, 'A:Z'));
  const [questionValues = [], topicValues] = await client.batchGet(
    spreadsheetId,
    ranges,
    'FORMATTED_VALUE',
  );
  const table = tableFromValues(tab.title, questionValues);
  const idColumn = idColumnOf(table.headers);
  let idFormula = false;
  if (idColumn !== null) {
    const letter = columnLetter(idColumn);
    const formulas = await client.values(
      spreadsheetId,
      sheetRange(tab.title, `${letter}2:${letter}${settings.maxRows + 1}`),
      'FORMULA',
    );
    idFormula = hasFormulas(formulas);
  }
  return {
    table,
    idFormula,
    truncated: tab.rowCount > settings.maxRows + 1 && questionValues.length >= settings.maxRows + 1,
    topicMismatches: topicsTab && topicValues ? topicMismatches(topicValues, branches) : null,
  };
}
