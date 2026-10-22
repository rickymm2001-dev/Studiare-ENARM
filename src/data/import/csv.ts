// Importador de CSV y de texto con columnas (D-093). Entiende el CSV de Anki con sus directivas
// al inicio, #separator, #html, #guid column, #notetype column, #deck column, #tags column y
// #columns, y también un CSV común con encabezados o sin ellos. Detecta el separador si no se
// declaró y, si el archivo no es UTF-8, lo lee como Windows-1252, que es lo que guarda Excel.
import Papa from 'papaparse';
import { restoreFormula } from './exportCsv';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import { notesFromRows, type RowsOptions } from './rows';
import { ImportError, type ParsedImport } from './types';

const SEPARATORS: Record<string, string> = {
  tab: '\t',
  comma: ',',
  semicolon: ';',
  pipe: '|',
  space: ' ',
  colon: ':',
};

// La marca de orden de bytes se escribe con su código para que ningún editor ni formateador la
// convierta en un carácter invisible dentro del archivo
const BOM = String.fromCharCode(0xfeff);

/**
 * Texto del archivo. UTF-8, sin la marca de orden de bytes, o Windows-1252 si no es UTF-8. La
 * decodificación estricta es la que dice si lo es, y no buscar un carácter de reemplazo en el
 * resultado, porque un archivo UTF-8 válido puede traer ese carácter escrito a propósito
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded.startsWith(BOM) ? decoded.slice(1) : decoded;
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

interface Directives {
  separator: string | undefined;
  html: boolean;
  columns: NonNullable<RowsOptions['columns']>;
  columnNames: string[] | undefined;
  /** Líneas de directivas que se quitaron del inicio */
  lines: number;
  body: string;
}

function readDirectives(text: string): Directives {
  const result: Directives = {
    separator: undefined,
    html: false,
    columns: {},
    columnNames: undefined,
    lines: 0,
    body: text,
  };
  const lines = text.split(/\r\n|\n|\r/);
  let used = 0;
  let columnsLine: string | undefined;
  for (const line of lines) {
    if (!line.startsWith('#')) break;
    used += 1;
    const match = /^#([^:]+):(.*)$/.exec(line);
    if (!match) continue;
    const key = (match[1] ?? '').trim().toLowerCase();
    const value = (match[2] ?? '').trim();
    if (key === 'separator') {
      result.separator =
        SEPARATORS[value.toLowerCase()] ?? (value.length === 1 ? value : undefined);
    } else if (key === 'html') result.html = value.toLowerCase() === 'true';
    else if (key === 'columns') columnsLine = value;
    else {
      const column = /^(guid|notetype|deck|tags) column$/.exec(key);
      const number = Number(value);
      if (column && Number.isInteger(number) && number > 0) {
        const name = column[1] === 'notetype' ? 'type' : (column[1] as 'guid' | 'deck' | 'tags');
        result.columns[name] = number;
      }
    }
  }
  result.lines = used;
  result.body = lines.slice(used).join('\n');
  if (columnsLine !== undefined) {
    const separator = result.separator ?? (columnsLine.includes('\t') ? '\t' : ',');
    result.columnNames = columnsLine.split(separator).map((name) => name.trim());
  }
  return result;
}

export function parseCsv(
  bytes: Uint8Array,
  fileName: string,
  limits: ImportLimits = IMPORT_LIMITS,
): ParsedImport {
  if (bytes.length > limits.maxDocumentBytes) throw new ImportError('too_large');
  // Un archivo binario, como un .doc o un .xls viejo, no es texto
  if (bytes.subarray(0, 4096).includes(0)) throw new ImportError('unsupported');
  const directives = readDirectives(decodeText(bytes));
  const parsed = Papa.parse<string[]>(directives.body, {
    delimiter: directives.separator ?? '',
    delimitersToGuess: [',', '\t', ';', '|'],
    skipEmptyLines: 'greedy',
    quoteChar: '"',
  });
  if (parsed.data.length === 0) throw new ImportError('empty');
  // El CSV que exporta Studiare antepone un apóstrofo a las celdas que parecen fórmulas
  const result = notesFromRows(
    parsed.data.map((row) => row.map(restoreFormula)),
    {
      html: directives.html,
      columns: directives.columns,
      ...(directives.columnNames ? { columnNames: directives.columnNames } : {}),
      lineOffset: directives.lines,
    },
    limits,
  );
  return {
    source: 'csv',
    format: 'csv',
    fileName,
    notes: result.notes,
    warnings: result.warnings,
    errors: result.errors,
  };
}
