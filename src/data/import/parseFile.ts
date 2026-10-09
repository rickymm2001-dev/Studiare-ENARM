// Punto de entrada del importador (D-093). Mira el contenido y no la extensión, así un archivo con
// el nombre cambiado se lee bien y uno que no es lo que dice se rechaza. Un zip puede ser un
// paquete de Anki, una hoja de Excel o un documento de Word. Lo que no es zip se lee como texto con
// columnas. El motor de SQLite se pide solo cuando hace falta, porque pesa más de un mega.
import type { SqlJsStatic } from 'sql.js';
import { parseApkg } from './apkg';
import { parseCsv } from './csv';
import { parseDocx } from './docx';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import { ImportError, type ParsedImport } from './types';
import { parseXlsx } from './xlsx';
import { listZip, looksLikeZip } from './zip';

export interface ParseDeps {
  /** Carga sql.js. Solo se llama con un paquete de Anki */
  loadSql: () => Promise<SqlJsStatic>;
}

export async function parseImportFile(
  fileName: string,
  bytes: Uint8Array,
  deps: ParseDeps,
  limits: ImportLimits = IMPORT_LIMITS,
): Promise<ParsedImport> {
  if (bytes.length === 0) throw new ImportError('empty');
  if (!looksLikeZip(bytes)) return parseCsv(bytes, fileName, limits);
  const { names } = listZip(bytes, limits);
  if (names.some((name) => /^collection\.anki(2|21|21b)$/.test(name))) {
    return parseApkg(bytes, await deps.loadSql(), fileName, limits);
  }
  if (names.includes('word/document.xml')) return parseDocx(bytes, fileName, limits);
  if (names.includes('xl/workbook.xml')) return parseXlsx(bytes, fileName, limits);
  throw new ImportError('unsupported');
}
