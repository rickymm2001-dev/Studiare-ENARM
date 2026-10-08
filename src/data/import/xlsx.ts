// Importador de hojas de Excel (D-093). Lee la primera hoja con read-excel-file y la trata como una
// tabla, igual que un CSV. Antes de abrirla revisa el zip por dentro con los mismos límites del
// importador de paquetes, así una hoja hecha para reventar la memoria se rechaza con un mensaje.
import { readSheet } from 'read-excel-file/universal';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import { notesFromRows } from './rows';
import { ImportError, type ParsedImport } from './types';
import { listZip } from './zip';

function asText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

export async function parseXlsx(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): Promise<ParsedImport> {
  if (bytes.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  listZip(bytes, { ...limits, maxUnpackedBytes: limits.maxDocumentBytes * 4 });
  let sheet: unknown[][];
  try {
    const buffer = new Uint8Array(bytes).buffer;
    sheet = await readSheet(buffer);
  } catch {
    throw new ImportError('corrupt');
  }
  const rows = sheet.map((row) => row.map(asText));
  if (rows.every((row) => row.every((cell) => cell.trim() === ''))) throw new ImportError('empty');
  const result = notesFromRows(rows, { html: false }, limits);
  return {
    source: 'xlsx',
    format: 'xlsx',
    fileName,
    notes: result.notes,
    warnings: result.warnings,
    errors: result.errors,
  };
}
