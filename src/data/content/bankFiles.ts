// Lee el archivo del banco que sube el médico (pantalla 22) y lo deja como la tabla de texto que
// entiende el convertidor (bankConvert.ts). Excel y CSV traen las columnas de la plantilla. El JSON
// trae una lista de objetos cuyas llaves son los mismos encabezados. Nada de esto toca la base.
import Papa from 'papaparse';
import { readSheet, SheetNotFoundError } from 'read-excel-file/universal';
import { decodeText } from '../import/csv';
import { IMPORT_LIMITS } from '../import/limits';
import { listZip } from '../import/zip';
import type { BankTable } from './bankConvert.ts';

/** Filas que se leen de un archivo. Más que eso es otro banco, no una importación */
export const MAX_BANK_ROWS = 20_000;

export type BankFileErrorCode = 'unsupported' | 'too_large' | 'corrupt' | 'empty' | 'too_many_rows';

export class BankFileError extends Error {
  readonly code: BankFileErrorCode;
  constructor(code: BankFileErrorCode) {
    super(code);
    this.name = 'BankFileError';
    this.code = code;
  }
}

const SHEET_NAME = 'Preguntas';

function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join('\n');
  return '';
}

/** Filas de texto, la primera con los encabezados, como tabla. Las filas vacías se saltan */
function tableFromRows(rows: readonly (readonly string[])[], name: string): BankTable {
  const [headers, ...body] = rows;
  if (!headers || headers.every((cell) => cell === '')) throw new BankFileError('empty');
  if (body.length > MAX_BANK_ROWS) throw new BankFileError('too_many_rows');
  return {
    name,
    headers,
    rows: body.map((cells, index) => ({ rowNumber: index + 2, cells })),
  };
}

export function bankTableFromCsv(text: string, name: string): BankTable {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
  if (parsed.data.length === 0) throw new BankFileError('empty');
  return tableFromRows(
    parsed.data.map((row) => row.map((cell) => cell.trim())),
    name,
  );
}

/** Lista de objetos con los encabezados de la plantilla como llaves. También acepta { preguntas: [...] } */
export function bankTableFromJson(text: string, name: string): BankTable {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BankFileError('corrupt');
  }
  const list =
    Array.isArray(value) || value === null || typeof value !== 'object'
      ? value
      : (value as Record<string, unknown>).preguntas;
  if (!Array.isArray(list)) throw new BankFileError('corrupt');
  if (list.length === 0) throw new BankFileError('empty');
  if (list.length > MAX_BANK_ROWS) throw new BankFileError('too_many_rows');
  const objects = list.map((item) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : null,
  );
  if (objects.some((item) => item === null)) throw new BankFileError('corrupt');
  const headers: string[] = [];
  for (const item of objects) {
    for (const key of Object.keys(item ?? {})) if (!headers.includes(key)) headers.push(key);
  }
  return {
    name,
    headers,
    // En JSON no hay fila de encabezados, así que la primera pregunta es la fila 1
    rows: objects.map((item, index) => ({
      rowNumber: index + 1,
      cells: headers.map((header) => asText(item?.[header])),
    })),
  };
}

/** La hoja Preguntas, o la primera si el médico la renombró */
export async function bankTableFromXlsx(bytes: Uint8Array, name: string): Promise<BankTable> {
  if (bytes.length > IMPORT_LIMITS.maxDocumentBytes) throw new BankFileError('too_large');
  try {
    listZip(bytes, {
      ...IMPORT_LIMITS,
      maxUnpackedBytes: IMPORT_LIMITS.maxDocumentBytes * 4,
    });
  } catch {
    throw new BankFileError('corrupt');
  }
  const buffer = new Uint8Array(bytes).buffer;
  let sheet: unknown[][];
  try {
    sheet = await readSheet(buffer, SHEET_NAME);
  } catch (error) {
    if (!(error instanceof SheetNotFoundError)) throw new BankFileError('corrupt');
    try {
      sheet = await readSheet(buffer);
    } catch {
      throw new BankFileError('corrupt');
    }
  }
  return tableFromRows(
    sheet.map((row) => row.map(asText)),
    name,
  );
}

export async function readBankFile(
  file: Pick<File, 'name' | 'size' | 'arrayBuffer'>,
): Promise<BankTable> {
  if (file.size > IMPORT_LIMITS.maxDocumentBytes) throw new BankFileError('too_large');
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = `el archivo ${file.name}`;
  switch (extension) {
    case 'xlsx':
      return bankTableFromXlsx(bytes, name);
    case 'csv':
    case 'txt':
      return bankTableFromCsv(decodeText(bytes), name);
    case 'json':
      return bankTableFromJson(decodeText(bytes), name);
    default:
      throw new BankFileError('unsupported');
  }
}
