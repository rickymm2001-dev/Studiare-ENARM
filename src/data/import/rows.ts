// De filas de una tabla a notas (D-093). Lo usan el CSV, las hojas de Excel y las tablas de Word.
// Entiende encabezados en español y en inglés, las columnas que declara un CSV de Anki en sus
// directivas, y si no hay nada de eso lee la columna 1 como frente, la 2 como reverso y la 3
// como etiquetas. Una fila con problemas no frena a las demás, queda anotada con su posición.
import { normalizeTags } from '../../engines/tagPath';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import {
  WarningTally,
  type ImportNoteKind,
  type ParsedNote,
  type RowError,
  type ImportWarning,
} from './types';

type Role = 'front' | 'text' | 'back' | 'extra' | 'tags' | 'deck' | 'type' | 'guid';

const HEADER_ROLES: Record<string, Role> = {
  frente: 'front',
  front: 'front',
  pregunta: 'front',
  question: 'front',
  anverso: 'front',
  texto: 'text',
  text: 'text',
  reverso: 'back',
  back: 'back',
  respuesta: 'back',
  answer: 'back',
  extra: 'extra',
  'back extra': 'extra',
  'nota extra': 'extra',
  etiquetas: 'tags',
  etiqueta: 'tags',
  tags: 'tags',
  mazo: 'deck',
  deck: 'deck',
  tipo: 'type',
  type: 'type',
  'tipo de nota': 'type',
  notetype: 'type',
  'note type': 'type',
  id: 'guid',
  guid: 'guid',
  identificador: 'guid',
};

const CLOZE_HOLE = /\{\{c\d+::/;

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();

export interface RowsOptions {
  /** El contenido de las celdas es HTML. Si no, es texto plano */
  html: boolean;
  /** Columnas 1 en adelante que declaró el archivo con directivas de Anki */
  columns?: { guid?: number; type?: number; deck?: number; tags?: number };
  /** Nombres de columna que declaró el archivo. Con ellos no hay fila de encabezado */
  columnNames?: readonly string[];
  /** Líneas antes de la primera fila, para decir la posición real en el archivo */
  lineOffset?: number;
}

export interface RowsResult {
  notes: ParsedNote[];
  errors: RowError[];
  warnings: ImportWarning[];
}

function rolesFromNames(names: readonly string[]): (Role | null)[] {
  return names.map((name) => HEADER_ROLES[fold(name)] ?? null);
}

/** Si la primera fila parece un encabezado. Pide al menos dos nombres conocidos o un frente claro */
function headerRoles(row: readonly string[]): (Role | null)[] | null {
  const roles = rolesFromNames(row);
  const known = roles.filter((role) => role !== null);
  const hasFront = known.includes('front') || known.includes('text');
  const short = row.every((cell) => cell.trim().length <= 30);
  if (short && (known.length >= 2 || (known.length === 1 && hasFront))) return roles;
  return null;
}

function kindOf(typeCell: string, frontCell: string): ImportNoteKind {
  const type = fold(typeCell);
  if (/cloze|hueco/.test(type)) return 'cloze';
  if (/revers|invers|doble|both/.test(type)) return 'basic_reverse';
  if (type !== '') return 'basic';
  return CLOZE_HOLE.test(frontCell) ? 'cloze' : 'basic';
}

export function notesFromRows(
  rows: readonly (readonly string[])[],
  options: RowsOptions,
  limits: ImportLimits = IMPORT_LIMITS,
): RowsResult {
  const notes: ParsedNote[] = [];
  const errors: RowError[] = [];
  const warnings = new WarningTally();
  const offset = options.lineOffset ?? 0;
  let dataRows = rows;
  let roles: (Role | null)[];

  if (options.columnNames) {
    roles = rolesFromNames(options.columnNames);
  } else {
    const header = rows[0] ? headerRoles(rows[0]) : null;
    if (header) {
      roles = header;
      dataRows = rows.slice(1);
    } else {
      const width = Math.max(0, ...rows.map((row) => row.length));
      roles = Array.from({ length: width }, () => null);
      const declared = options.columns ?? {};
      const take = (role: Role, column: number | undefined) => {
        if (column !== undefined && column >= 1 && column <= width) roles[column - 1] = role;
      };
      take('guid', declared.guid);
      take('type', declared.type);
      take('deck', declared.deck);
      take('tags', declared.tags);
      // Sin encabezado, lo que sobra va en orden. Frente, reverso y, si nadie declaró nada, etiquetas
      const free = roles.map((role, index) => (role === null ? index : -1)).filter((i) => i >= 0);
      if (free[0] !== undefined) roles[free[0]] = 'front';
      if (free[1] !== undefined) roles[free[1]] = 'back';
      if (free[2] !== undefined && !Object.keys(declared).length) roles[free[2]] = 'tags';
    }
  }
  // Con encabezado o con nombres, las filas empiezan donde dice el archivo
  const firstRow = dataRows === rows ? 1 : 2;

  const columnOf = (role: Role) => roles.indexOf(role);
  const cell = (row: readonly string[], column: number) =>
    column >= 0 ? (row[column] ?? '').trim() : '';
  const frontColumn = columnOf('front') >= 0 ? columnOf('front') : columnOf('text');
  const backColumn = columnOf('back') >= 0 ? columnOf('back') : columnOf('extra');
  // Las columnas sin papel, que no son de ningún dato conocido, se anotan como columnas de más
  const unused = roles.filter((role) => role === null).length;
  if (unused > 0 && dataRows.length > 0) warnings.add('extra_columns', unused);

  for (const [index, row] of dataRows.entries()) {
    const position = index + firstRow + offset;
    if (row.every((value) => value.trim() === '')) continue;
    if (notes.length >= limits.maxNotes) {
      errors.push({ position, code: 'too_many_notes' });
      break;
    }
    const front = cell(row, frontColumn);
    const back = cell(row, backColumn);
    const kind = kindOf(cell(row, columnOf('type')), front);
    if (front === '') {
      errors.push({ position, code: 'empty_front' });
      continue;
    }
    if (kind === 'cloze') {
      if (!CLOZE_HOLE.test(front)) {
        errors.push({ position, code: 'cloze_without_holes' });
        continue;
      }
    } else if (back === '') {
      errors.push({ position, code: 'empty_back' });
      continue;
    }
    const deckCell = cell(row, columnOf('deck'));
    notes.push({
      guid: cell(row, columnOf('guid')) || null,
      kind,
      front,
      back,
      html: options.html,
      tags: normalizeTags(cell(row, columnOf('tags')).split(/[\s,;]+/)),
      deckPath:
        deckCell === ''
          ? []
          : deckCell
              .split('::')
              .map((part) => part.trim())
              .filter(Boolean),
      position,
    });
  }
  return { notes, errors, warnings: warnings.toList() };
}
