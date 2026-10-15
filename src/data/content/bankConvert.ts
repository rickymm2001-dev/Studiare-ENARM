// Convierte una tabla de texto con las columnas de la plantilla del banco (bankColumns.ts) a
// preguntas en el formato de borrador. La usan el importador de la app (pantalla 22) y el script de
// Node que lee el Excel, así los dos aceptan lo mismo y dicen lo mismo. No decide nada de medicina.
// Solo traduce los nombres de la lista a las claves de las taxonomías, arma las opciones (de 4 a 10,
// con las demás en blanco) y avisa con el número de fila lo que no se pueda representar. Una fila con
// problemas no pasa a la salida. Funciones puras, sin Node ni React.
import {
  ENGLISH_CASE_SIZES,
  ENGLISH_DEFAULT_TASK_KEY,
  EXAMPLE_PREFIX,
  HEADER_ALIASES,
  HEADERS,
  KIND_LABELS,
  LANGUAGE_LABELS,
  MAX_CASE_ORDER,
  MIN_BANK_OPTIONS,
  NO_BIAS_LABEL,
  OPTION_LETTERS,
  PHYSICIAN_CODE_PATTERN,
  PLACEHOLDER,
  PLACEHOLDER_PICK,
  POLARITY_LABELS,
  SHEET_APPROVED_LABELS,
  SHEET_HEADERS,
  SHEET_STATUS_LABELS,
  TASK_LABELS,
  TEXT_LIMITS,
  firstHeaderLine,
  normalizeText,
  optionHeaders,
  type BiasInfo,
  type ContentTaxonomies,
  type TaxonomyBranch,
  type TaxonomyTopic,
} from './bankColumns.ts';
import {
  LICENSE_LABELS,
  composePassageSource,
  licenseFromSheet,
  parsePassageSource,
} from './passageSource.ts';
import type {
  SyncNoticeCode,
  SyncProblem,
  SyncProblemCode,
  SyncQuestion,
  SyncQuestionOption,
  SyncRowPayload,
} from '../bank/contracts.ts';

export interface ConvertedOption {
  key: string;
  text: string;
  correct: boolean;
  bias?: string | undefined;
  rationale: string;
}

export interface ConvertedQuestion {
  key: string;
  caseKey: null;
  caseOrder: null;
  branch: string;
  topic: string;
  subtopic: string;
  vignette: string;
  prompt: string;
  polarity: 'affirmative' | 'negative';
  task: string;
  difficulty: number;
  options: ConvertedOption[];
  canonical: string[];
  explanation: string;
  gpcRefs: string[];
  kinds?: string[];
}

export interface BankTable {
  /** Nombre de la hoja o del archivo, para los mensajes */
  name: string;
  /** Los encabezados de la fila 1 */
  headers: readonly string[];
  /** Las filas de datos. El número es el de la fila en el archivo, con la 2 como primera de datos */
  rows: readonly { rowNumber: number; cells: readonly string[] }[];
}

export interface ConvertContext {
  data: ContentTaxonomies;
  /**
   * Polaridad y tarea que detecta el motor de estructura, para lo que el médico deja vacío. language
   * solo viene en las preguntas en inglés (B13), que se analizan con sus negaciones en inglés
   */
  analyze: (question: {
    vignette: string;
    prompt: string;
    serialCase: boolean;
    language?: 'es' | 'en';
  }) => {
    polarity: string;
    task: string | null;
  };
}

export interface ConvertResult {
  /** Solo las filas sin problemas */
  questions: ConvertedQuestion[];
  /** Filas que no se pudieron convertir, cada una con su número de fila y su mensaje */
  problems: string[];
  /** Lo mismo que problems, separado por fila para mostrarlo en una tabla */
  rowProblems: { rowNumber: number; id: string; message: string }[];
  /** Cosas que conviene saber y no impiden la conversión */
  notes: string[];
  /** Filas con datos que se leyeron, convertidas o no */
  rows: number;
  /** La fila de ejemplo de la plantilla, que se omite */
  skippedExamples: number;
  /** De cada pregunta convertida, su fila y si el médico declaró la polaridad y la tarea */
  meta: Record<string, { rowNumber: number; polarityDeclared: boolean; taskDeclared: boolean }>;
}

interface OptionColumns {
  letter: string;
  text: number;
  rationale: number;
  bias: number;
}

interface TableLayout {
  fields: Partial<Record<keyof typeof HEADERS, number>>;
  options: OptionColumns[];
  problems: string[];
}

const REQUIRED_FIELDS: (keyof typeof HEADERS)[] = [
  'branch',
  'topic',
  'subtopic',
  'difficulty',
  'prompt',
  'correct',
  'explanation',
  'refs',
];

/** Busca las columnas por el texto del encabezado, sin importar acentos ni mayúsculas */
function readLayout(headers: readonly string[]): TableLayout {
  const byHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    byHeader.set(normalizeText(header), index + 1);
  });
  const fields: TableLayout['fields'] = {};
  for (const field of Object.keys(HEADERS) as (keyof typeof HEADERS)[]) {
    const column = byHeader.get(normalizeText(HEADERS[field]));
    if (column !== undefined) fields[field] = column;
  }
  for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
    const column = byHeader.get(alias);
    if (column !== undefined && fields[field] === undefined) fields[field] = column;
  }
  const problems: string[] = [];
  for (const field of REQUIRED_FIELDS)
    if (fields[field] === undefined) problems.push(`Falta la columna ${HEADERS[field]}`);
  const options: OptionColumns[] = [];
  for (const letter of OPTION_LETTERS) {
    const names = optionHeaders(letter);
    const text = byHeader.get(normalizeText(names.text));
    if (text === undefined) continue;
    const rationale = byHeader.get(normalizeText(names.rationale));
    const bias = byHeader.get(normalizeText(names.bias));
    if (rationale === undefined) problems.push(`Falta la columna ${names.rationale}`);
    if (bias === undefined) problems.push(`Falta la columna ${names.bias}`);
    if (rationale !== undefined && bias !== undefined)
      options.push({ letter, text, rationale, bias });
  }
  if (options.length < MIN_BANK_OPTIONS)
    problems.push(`Faltan columnas de opciones, la plantilla trae de la A a la D como mínimo`);
  return { fields, options, problems };
}

/** Encuentra por el nombre que ve el médico o por la clave, sin acentos ni mayúsculas */
function findNamed<T extends { key: string; name: string }>(
  items: readonly T[],
  text: string,
): T | undefined {
  const wanted = normalizeText(text);
  return items.find((item) => normalizeText(item.name) === wanted || item.key === wanted);
}

/** Etiqueta en español o clave interna. Devuelve la clave, o undefined si no existe */
function findLabeled(labels: Readonly<Record<string, string>>, text: string): string | undefined {
  const wanted = normalizeText(text);
  return Object.entries(labels).find(
    ([key, label]) => key === wanted || normalizeText(label) === wanted,
  )?.[0];
}

function findBias(biases: readonly BiasInfo[], text: string): BiasInfo | undefined {
  const wanted = normalizeText(text);
  return biases.find(
    (bias) =>
      bias.key === wanted ||
      normalizeText(bias.name) === wanted ||
      normalizeText(bias.englishName) === wanted,
  );
}

const sequence = (position: number) => String(position).padStart(4, '0');

/** Convierte las filas de la tabla. Cada fila con problemas se queda fuera de la salida */
export function convertTable(
  table: BankTable,
  context: ConvertContext,
  options: { prefix: string },
): ConvertResult {
  const result: ConvertResult = {
    questions: [],
    problems: [],
    rowProblems: [],
    notes: [],
    rows: 0,
    skippedExamples: 0,
    meta: {},
  };
  const layout = readLayout(table.headers);
  if (layout.problems.length > 0) {
    result.problems.push(...layout.problems.map((problem) => `${problem} en ${table.name}`));
    return result;
  }
  const { branches, biases } = context.data;
  const usedKeys = new Set<string>();

  for (const row of table.rows) {
    const { rowNumber, cells } = row;
    if (cells.every((cell) => cell === '')) continue;
    const text = (column: number | undefined) =>
      column === undefined ? '' : (cells[column - 1] ?? '');
    const idText = text(layout.fields.id);
    if (normalizeText(idText).startsWith(EXAMPLE_PREFIX)) {
      result.skippedExamples += 1;
      result.notes.push(`Fila ${rowNumber} omitida, es la fila de ejemplo de la plantilla`);
      continue;
    }
    result.rows += 1;
    const key = idText === '' ? `${options.prefix}-q${sequence(result.rows)}` : idText;
    const where = idText === '' ? `Fila ${rowNumber}` : `Fila ${rowNumber} (${idText})`;
    const problems: string[] = [];
    const problem = (message: string) => problems.push(`${where} ${message}`);
    const rawProblems: string[] = [];
    const raw = (message: string) => {
      problem(message);
      rawProblems.push(message);
    };

    const leftover = [PLACEHOLDER, PLACEHOLDER_PICK].map(normalizeText);
    if (cells.some((cell) => leftover.some((mark) => normalizeText(cell).includes(mark))))
      raw(
        `todavía tiene texto de la plantilla sin reemplazar (${PLACEHOLDER}... o ${PLACEHOLDER_PICK})`,
      );
    if (usedKeys.has(key)) raw('repite un ID que ya usó otra fila');
    usedKeys.add(key);

    // Rama, subespecialidad y subtema, cada uno dentro del anterior
    const branchText = text(layout.fields.branch);
    const topicText = text(layout.fields.topic);
    const subtopicText = text(layout.fields.subtopic);
    const branch = findNamed(branches, branchText);
    if (!branch) raw(`la rama "${branchText}" no está en la lista`);
    const topic = branch ? findNamed(branch.topics, topicText) : undefined;
    if (branch && !topic) {
      const elsewhere = branches.some((other) => findNamed(other.topics, topicText));
      raw(
        elsewhere
          ? `la subespecialidad "${topicText}" no pertenece a la rama "${branch.name}"`
          : `la subespecialidad "${topicText}" no está en la lista`,
      );
    }
    const subtopic = topic ? findNamed(topic.subtopics, subtopicText) : undefined;
    if (topic && !subtopic) {
      const elsewhere = branches.some((other) =>
        other.topics.some((candidate) => findNamed(candidate.subtopics, subtopicText)),
      );
      raw(
        elsewhere
          ? `el subtema "${subtopicText}" no pertenece a la subespecialidad "${topic.name}"`
          : `el subtema "${subtopicText}" no está en la lista`,
      );
    }

    const difficulty = Number(text(layout.fields.difficulty));
    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5)
      raw(
        `la dificultad debe ser un número del 1 al 5 y llegó "${text(layout.fields.difficulty)}"`,
      );

    const kinds: string[] = [];
    for (const kindText of text(layout.fields.kind)
      .split(/[;,\n]/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      const kind = findLabeled(KIND_LABELS, kindText);
      if (kind === undefined) raw(`el tipo de reactivo "${kindText}" no está en la lista`);
      else if (!kinds.includes(kind)) kinds.push(kind);
    }

    const vignette = text(layout.fields.vignette);
    const prompt = text(layout.fields.prompt);
    if (prompt === '') raw('no tiene la pregunta');
    const auto = context.analyze({ vignette, prompt, serialCase: false });
    const taskText = text(layout.fields.task);
    let task: string | null = auto.task;
    if (taskText !== '') {
      task = findLabeled(TASK_LABELS, taskText) ?? null;
      if (task === null) raw(`la tarea "${taskText}" no está en la lista`);
    } else if (task === null) raw('no se pudo detectar la tarea, elígela en la columna Tarea');
    const polarityText = text(layout.fields.polarity);
    let polarity = auto.polarity === 'negative' ? 'negative' : 'affirmative';
    if (polarityText !== '') {
      const declared = findLabeled(POLARITY_LABELS, polarityText);
      if (declared === undefined)
        raw(`la polaridad "${polarityText}" debe ser Afirmativa o Negativa`);
      else polarity = declared;
    }

    // Opciones, de la A en adelante sin saltar letras. Las columnas que sobran quedan en blanco
    const filled: { letter: string; text: string; rationale: string; bias: string }[] = [];
    let blankBefore: string | null = null;
    let skipped = false;
    for (const column of layout.options) {
      const optionText = text(column.text);
      const rationale = text(column.rationale);
      const bias = text(column.bias);
      if (optionText === '') {
        if (rationale !== '' || bias !== '')
          raw(`la opción ${column.letter} tiene justificación o sesgo pero no tiene texto`);
        blankBefore ??= column.letter;
        continue;
      }
      if (blankBefore !== null && !skipped) {
        skipped = true;
        raw(`salta la opción ${blankBefore}. Las opciones van seguidas desde la A`);
      }
      filled.push({ letter: column.letter, text: optionText, rationale, bias });
    }
    if (filled.length < MIN_BANK_OPTIONS)
      raw(`tiene ${filled.length} opciones y se necesitan al menos ${MIN_BANK_OPTIONS}`);

    const correctText = /^(?:opcion\s*)?([a-j])$/.exec(normalizeText(text(layout.fields.correct)));
    const correctLetter = correctText?.[1]?.toUpperCase();
    if (correctLetter === undefined || !filled.some((option) => option.letter === correctLetter))
      raw(
        `la opción correcta "${text(layout.fields.correct)}" no es una de las opciones que escribiste`,
      );

    const draftOptions: ConvertedOption[] = [];
    filled.forEach((option, index) => {
      const isCorrect = option.letter === correctLetter;
      if (option.rationale === '') raw(`la opción ${option.letter} no tiene justificación`);
      let biasKey: string | undefined;
      if (isCorrect) {
        if (option.bias !== '') raw(`la opción correcta ${option.letter} no lleva sesgo`);
      } else if (option.bias === '') {
        raw(`la opción incorrecta ${option.letter} no tiene sesgo`);
      } else {
        biasKey = findBias(biases, option.bias)?.key;
        if (biasKey === undefined)
          raw(`el sesgo "${option.bias}" de la opción ${option.letter} no está en la lista`);
      }
      draftOptions.push({
        key: OPTION_LETTERS[index]?.toLowerCase() ?? option.letter.toLowerCase(),
        text: option.text,
        correct: isCorrect,
        ...(biasKey === undefined ? {} : { bias: biasKey }),
        rationale: option.rationale,
      });
    });

    // Set canónico. El del médico, o la correcta con las tres primeras incorrectas
    const canonicalText = text(layout.fields.canonical).toUpperCase();
    const chosen = [...new Set(canonicalText.match(/[A-J]/g) ?? [])];
    let canonical: string[];
    if (chosen.length === 0) {
      const correct = draftOptions.filter((option) => option.correct);
      const others = draftOptions.filter((option) => !option.correct).slice(0, 3);
      canonical = draftOptions
        .filter((option) => [...correct, ...others].includes(option))
        .map((option) => option.key);
    } else {
      canonical = draftOptions
        .filter((option) => chosen.includes(option.key.toUpperCase()))
        .map((option) => option.key);
      const valid =
        canonical.length === 4 &&
        chosen.length === 4 &&
        draftOptions.some((option) => option.correct && canonical.includes(option.key));
      if (!valid)
        raw(
          `el set canónico "${text(layout.fields.canonical)}" debe tener 4 letras de opciones que escribiste e incluir la correcta`,
        );
    }

    const explanation = text(layout.fields.explanation);
    if (explanation === '') raw('no tiene explicación');
    const gpcRefs = text(layout.fields.refs)
      .split(/\r?\n|;;/)
      .map((reference) => reference.trim())
      .filter(Boolean);
    if (gpcRefs.length === 0) raw('no tiene referencias');
    const status = text(layout.fields.status);
    if (status !== '' && !normalizeText(status).startsWith('borrador'))
      raw(`el estado debe ser Borrador y llegó "${status}"`);

    if (problems.length > 0 || !branch || !topic || !subtopic || task === null) {
      result.problems.push(...problems);
      result.rowProblems.push(
        ...rawProblems.map((message) => ({ rowNumber, id: idText, message })),
      );
      continue;
    }
    result.questions.push({
      key,
      caseKey: null,
      caseOrder: null,
      branch: branch.key,
      topic: topic.key,
      subtopic: subtopic.key,
      vignette,
      prompt,
      polarity: polarity === 'negative' ? 'negative' : 'affirmative',
      task,
      difficulty,
      options: draftOptions,
      canonical,
      explanation,
      gpcRefs,
      ...(kinds.length > 0 ? { kinds } : {}),
    });
    result.meta[key] = {
      rowNumber,
      polarityDeclared: polarityText !== '',
      taskDeclared: taskText !== '',
    };
  }
  return result;
}

// ===================================================================== Convertidor del Sheet (B11)
// El convertidor tolerante del Google Sheet del banco y de la importación del admin a la nube (3.3 y
// 3.4 del plan de B11). A diferencia de convertTable, que no deja pasar nada incompleto, este separa
// tres cosas por renglón
//   - Rechazo. Solo lo que no se puede representar como pregunta del banco. El renglón no entra
//   - Incompleto. Entra como borrador y no se puede aprobar hasta completarlo
//   - Aviso. Entra normal y el reporte lo dice
// Nunca rechaza ni marca como pendiente un reactivo por imperfecto (D-080). Los motivos son códigos
// (SyncProblemCode y SyncNoticeCode) y los valores que repite son solo de listas cerradas, recortados
// a 60 caracteres, para que el reporte nunca copie texto de una pregunta (PC 7.3). Lo comparte la
// función bank-sync con una copia generada (scripts/content/sync-bank-shared.ts).
//
// Inglés médico (B13, 1.5 del plan de B13). Idioma vacío en Inglés médico se toma como inglés con un aviso,
// e Inglés fuera de esa rama o Español dentro de ella rechaza el renglón. Un renglón en inglés lee además
// Fuente del texto, Licencia del texto y Enlace del texto, y los guarda como la primera referencia con la
// forma de passageSource.ts. Los demás renglones de un caso heredan la fuente. Una fuente que falta o una
// licencia fuera de la lista no rechazan, dejan el pendiente que dice parsePassageSource, el mismo que
// calcula la base. En español las tres columnas se ignoran.

export interface SheetConvertContext {
  data: ContentTaxonomies;
  analyze: ConvertContext['analyze'];
  /** Patrón del ID fijo, el de platform_settings.bank_sync.idPattern */
  idPattern: string;
}

export interface SheetRowResult {
  rowNumber: number;
  /** El ID del renglón sin espacios en las orillas. null si viene vacío */
  key: string | null;
  problems: SyncProblem[];
  incomplete: string[];
  notices: SyncNoticeCode[];
  /** El contenido ya convertido. null si el renglón se rechaza */
  question: SyncQuestion | null;
  meta: SyncRowPayload['meta'];
}

export interface SheetConvertResult {
  /** Columnas obligatorias que no están. Con alguna, ningún renglón se convierte */
  missingColumns: string[];
  /** Un resultado por renglón con contenido, en el orden del Sheet */
  rows: SheetRowResult[];
  counts: {
    /** Renglones con contenido, aceptados o rechazados */
    read: number;
    /** Renglones vacíos o que solo traen ID, como los de la fórmula de hoy (PC 7.2) */
    empty: number;
    /** La fila de ejemplo de la plantilla */
    example: number;
  };
}

type SheetField = keyof typeof HEADERS | keyof typeof SHEET_HEADERS;

const SHEET_REQUIRED: readonly SheetField[] = [
  'id',
  'branch',
  'topic',
  'subtopic',
  'difficulty',
  'prompt',
  'correct',
];

/** Un valor de lista cerrada, recortado a 60 caracteres para el reporte */
export function reportValue(text: string): string {
  return Array.from(text.trim()).slice(0, 60).join('');
}

/** Texto de una celda, sin espacios en las orillas y con saltos de línea \n */
const cleanCell = (text: string) => text.replace(/\r\n?/g, '\n').trim();

interface SheetLayout {
  fields: Partial<Record<SheetField, number>>;
  options: { letter: string; text: number; rationale?: number; bias?: number }[];
  missing: string[];
}

function readSheetLayout(headers: readonly string[]): SheetLayout {
  const byHeader = new Map<string, number>();
  headers.forEach((header, index) => {
    const name = normalizeText(firstHeaderLine(header));
    if (name !== '' && !byHeader.has(name)) byHeader.set(name, index + 1);
  });
  const names: Record<SheetField, string> = { ...HEADERS, ...SHEET_HEADERS };
  const fields: SheetLayout['fields'] = {};
  for (const field of Object.keys(names) as SheetField[]) {
    const column = byHeader.get(normalizeText(names[field]));
    if (column !== undefined) fields[field] = column;
  }
  for (const [alias, field] of Object.entries(HEADER_ALIASES)) {
    const column = byHeader.get(alias);
    if (column !== undefined && fields[field] === undefined) fields[field] = column;
  }
  const missing = SHEET_REQUIRED.filter((field) => fields[field] === undefined).map(
    (field) => names[field],
  );
  const options: SheetLayout['options'] = [];
  for (const letter of OPTION_LETTERS) {
    const header = optionHeaders(letter);
    const text = byHeader.get(normalizeText(header.text));
    if (text === undefined) continue;
    const rationale = byHeader.get(normalizeText(header.rationale));
    const bias = byHeader.get(normalizeText(header.bias));
    options.push({
      letter,
      text,
      ...(rationale === undefined ? {} : { rationale }),
      ...(bias === undefined ? {} : { bias }),
    });
  }
  for (const letter of OPTION_LETTERS.slice(0, MIN_BANK_OPTIONS)) {
    if (!options.some((option) => option.letter === letter))
      missing.push(optionHeaders(letter).text);
  }
  return { fields, options, missing };
}

/** La subespecialidad que contiene ese subtema, si es una sola en la rama (8.2) */
function inferTopic(branch: TaxonomyBranch, subtopicText: string): TaxonomyTopic | undefined {
  const owners = branch.topics.filter((topic) => findNamed(topic.subtopics, subtopicText));
  return owners.length === 1 ? owners[0] : undefined;
}

function parseSheetStatus(
  text: string,
  notices: SyncNoticeCode[],
): SyncRowPayload['meta']['sheetStatus'] {
  const value = normalizeText(text);
  if (value === '') return null;
  if (value.startsWith(normalizeText(SHEET_STATUS_LABELS.draft))) return 'draft';
  if (value.startsWith('lista')) return 'ready';
  if (value.startsWith('retir')) return 'retire';
  if (SHEET_APPROVED_LABELS.some((label) => value.startsWith(normalizeText(label)))) {
    notices.push('status_approved_ignored');
    return null;
  }
  notices.push('status_unknown');
  return null;
}

/**
 * Lo que dice la celda Idioma. given es false si viene vacía, y unknown si trae algo que no es Español ni
 * Inglés, que se toma como español. No avisa nada, porque el aviso va en su lugar del reporte
 */
function readLanguage(text: string): { language: 'es' | 'en'; given: boolean; unknown: boolean } {
  const value = normalizeText(text);
  if (value === '') return { language: 'es', given: false, unknown: false };
  if (['es', 'espanol', 'spanish'].includes(value))
    return { language: 'es', given: true, unknown: false };
  if (['en', 'ingles', 'english'].includes(value))
    return { language: 'en', given: true, unknown: false };
  return { language: 'es', given: true, unknown: true };
}

/** Las tres columnas de la fuente del texto, tal como las escribió el médico */
interface PassageCells {
  title: string;
  license: string;
  url: string;
}

const hasPassage = (cells: PassageCells | null): cells is PassageCells =>
  cells !== null && (cells.title !== '' || cells.license !== '' || cells.url !== '');

/** Con qué se compara la fuente de dos renglones de un caso. La licencia por su clave y el título sin acentos */
function passageKey(cells: PassageCells): string {
  const license = licenseFromSheet(cells.license);
  return JSON.stringify([
    normalizeText(cells.title),
    license ?? normalizeText(cells.license),
    cells.url.trim(),
  ]);
}

/**
 * La referencia que arma el Sheet con las tres columnas. Si la licencia es de la lista, usa su nombre
 * exacto. Si no, deja lo que escribió el médico, para que el pendiente salga de leer la referencia y sea
 * el mismo que calcula la base
 */
function composeFromCells(cells: PassageCells): string | null {
  const license = licenseFromSheet(cells.license);
  return composePassageSource({
    title: cells.title,
    license:
      license === null || license === 'not_allowed' ? cells.license : LICENSE_LABELS[license],
    url: cells.url,
  });
}

/** Los pendientes que van antes de los de las opciones, en el orden de bank_version_issues */
const HEAD_PENDING = ['task_undetected', 'explanation_missing', 'references_missing'];

function parseCode(text: string): string | null | undefined {
  const value = text.trim().toUpperCase();
  if (value === '') return null;
  return PHYSICIAN_CODE_PATTERN.test(value) ? value : undefined;
}

interface PendingRow extends SheetRowResult {
  caseKey: string | null;
  caseOrderText: string;
  caseOrder: number | null;
  /** El Caso clínico tal cual, que en el Orden 1 es la viñeta del caso */
  rawVignette: string;
  language: 'es' | 'en';
  /** Las columnas de la fuente del texto. null en español, donde se ignoran */
  passage: PassageCells | null;
}

/**
 * Le pone a una pregunta en inglés su fuente del texto como primera referencia y calcula sus pendientes
 * de fuente con parsePassageSource, el espejo de bank_passage_source_issue. Una fuente que falta, que
 * no trae enlace o con una licencia fuera de la lista no rechaza, es un pendiente. Si la referencia
 * pasa del largo del esquema, el renglón se rechaza. Cuando hay fuente, ella ya cuenta como referencia
 */
function applyPassage(row: PendingRow, cells: PassageCells | null): void {
  const question = row.question;
  if (question?.language !== 'en') return;
  const composed = hasPassage(cells) ? composeFromCells(cells) : null;
  if (composed !== null) {
    question.refs = [composed, ...question.refs];
    row.incomplete = row.incomplete.filter((code) => code !== 'references_missing');
    if (question.refs.length > TEXT_LIMITS.references || composed.length > TEXT_LIMITS.reference)
      row.problems.push({ code: 'text_too_long', column: SHEET_HEADERS.passageSource });
  }
  const source = parsePassageSource(question.refs.map((title) => ({ title })));
  if (source.ok) return;
  let at = 0;
  while (at < row.incomplete.length && HEAD_PENDING.includes(row.incomplete[at] ?? '')) at += 1;
  row.incomplete.splice(at, 0, source.issue);
}

/** Convierte el Sheet renglón por renglón. Un renglón con problemas no frena a los demás */
export function convertSheetTable(
  table: BankTable,
  context: SheetConvertContext,
): SheetConvertResult {
  const result: SheetConvertResult = {
    missingColumns: [],
    rows: [],
    counts: { read: 0, empty: 0, example: 0 },
  };
  const layout = readSheetLayout(table.headers);
  if (layout.missing.length > 0) {
    result.missingColumns = layout.missing;
    return result;
  }
  const { branches, biases } = context.data;
  const idPattern = new RegExp(context.idPattern);
  const leftovers = [PLACEHOLDER, PLACEHOLDER_PICK].map(normalizeText);
  const pending: PendingRow[] = [];

  for (const row of table.rows) {
    const cell = (field: SheetField) => {
      const column = layout.fields[field];
      return column === undefined ? '' : cleanCell(row.cells[column - 1] ?? '');
    };
    const at = (column: number | undefined) =>
      column === undefined ? '' : cleanCell(row.cells[column - 1] ?? '');
    const idText = cell('id');
    const idColumn = layout.fields.id ?? 0;
    const filled = row.cells.filter(
      (value, index) => index + 1 !== idColumn && cleanCell(value) !== '',
    );
    if (filled.length === 0) {
      result.counts.empty += 1;
      continue;
    }
    if (normalizeText(idText).startsWith(EXAMPLE_PREFIX)) {
      result.counts.example += 1;
      continue;
    }
    result.counts.read += 1;
    const problems: SyncProblem[] = [];
    const incomplete: string[] = [];
    const notices: SyncNoticeCode[] = [];
    const problem = (code: SyncProblemCode, column: string, value?: string) => {
      problems.push(
        value === undefined ? { code, column } : { code, column, value: reportValue(value) },
      );
    };
    const notice = (code: SyncNoticeCode) => {
      if (!notices.includes(code)) notices.push(code);
    };

    if (idText === '') problem('id_missing', HEADERS.id);
    else if (!idPattern.test(idText)) problem('id_format', HEADERS.id);
    if (row.cells.some((value) => leftovers.some((mark) => normalizeText(value).includes(mark))))
      problem('template_placeholder', HEADERS.id);

    // Rama, subespecialidad y subtema. La subespecialidad se deduce del subtema si es una sola (8.2)
    const branchText = cell('branch');
    const topicText = cell('topic');
    const subtopicText = cell('subtopic');
    const branch = findNamed(branches, branchText);
    let topic: TaxonomyTopic | undefined;
    let subtopic: { key: string; name: string } | undefined;
    if (!branch) problem('branch_unknown', HEADERS.branch, branchText);
    else {
      const isTopicName = branch.topics.some(
        (candidate) => normalizeText(candidate.name) === normalizeText(subtopicText),
      );
      topic = findNamed(branch.topics, topicText);
      if (!topic) {
        topic = inferTopic(branch, subtopicText);
        if (topic) notice('topic_inferred');
        else {
          problem('topic_unknown', HEADERS.topic, topicText);
          if (isTopicName) problem('subtopic_is_topic', HEADERS.subtopic, subtopicText);
          else if (!branch.topics.some((candidate) => findNamed(candidate.subtopics, subtopicText)))
            problem('subtopic_unknown', HEADERS.subtopic, subtopicText);
        }
      }
      if (topic) {
        subtopic = findNamed(topic.subtopics, subtopicText);
        if (!subtopic) {
          if (isTopicName) problem('subtopic_is_topic', HEADERS.subtopic, subtopicText);
          else problem('subtopic_unknown', HEADERS.subtopic, subtopicText);
        }
      }
    }

    // Idioma (B13). Inglés médico es inglés aunque la celda venga vacía, y el idioma tiene que ir con la
    // rama. La rama de Inglés médico es la de la sección english de la taxonomía
    const languageRead = readLanguage(cell('language'));
    let language = languageRead.language;
    let languageInferred = false;
    if (branch) {
      const englishBranch = branch.section === 'english';
      if (englishBranch && !languageRead.given) {
        language = 'en';
        languageInferred = true;
      } else if ((language === 'en') !== englishBranch) {
        problem('language_branch_mismatch', SHEET_HEADERS.language, LANGUAGE_LABELS[language]);
      }
    }

    const difficultyText = cell('difficulty');
    const difficulty = Number(difficultyText);
    if (difficultyText === '' || !Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5)
      problem('difficulty_invalid', HEADERS.difficulty, difficultyText);

    const itemKinds: string[] = [];
    for (const kindText of cell('kind')
      .split(/[;,\n]/)
      .map((part) => part.trim())
      .filter(Boolean)) {
      const kind = findLabeled(KIND_LABELS, kindText);
      if (kind === undefined) problem('kind_unknown', HEADERS.kind, kindText);
      else if (!itemKinds.includes(kind)) itemKinds.push(kind);
    }
    if (itemKinds.includes('control')) notice('kind_control_check');

    const caseKeyText = cell('caseKey');
    const caseKey = caseKeyText === '' ? null : caseKeyText.toUpperCase();
    const vignette = cell('vignette');
    const prompt = cell('prompt');
    if (prompt === '') problem('prompt_missing', HEADERS.prompt);
    if (prompt.length > TEXT_LIMITS.prompt) problem('text_too_long', HEADERS.prompt);
    if (vignette.length > TEXT_LIMITS.vignette) problem('text_too_long', HEADERS.vignette);

    const auto = context.analyze({
      vignette,
      prompt,
      serialCase: caseKey !== null,
      ...(language === 'en' ? { language } : {}),
    });
    const taskText = cell('task');
    let task: string | null = auto.task;
    // Una pregunta en inglés sin tarea toma data_interpretation (8.10), con el aviso structure_auto de abajo
    if (language === 'en' && task === null && taskText === '') task = ENGLISH_DEFAULT_TASK_KEY;
    if (taskText !== '') {
      task = findLabeled(TASK_LABELS, taskText) ?? null;
      if (task === null) problem('task_unknown', HEADERS.task, taskText);
    }
    // Sin tarea que detectar, el renglón entra con el pendiente task_undetected y el médico la elige en
    // el Sheet o en el editor (decisión de Ricardo en la revisión de B11). Una tarea escrita que no está
    // en la lista sí rechaza el renglón
    const polarityText = cell('polarity');
    let polarity: 'affirmative' | 'negative' =
      auto.polarity === 'negative' ? 'negative' : 'affirmative';
    if (polarityText !== '') {
      const declared = findLabeled(POLARITY_LABELS, polarityText);
      if (declared === undefined) problem('polarity_invalid', HEADERS.polarity, polarityText);
      else polarity = declared === 'negative' ? 'negative' : 'affirmative';
    }
    if (taskText === '' || polarityText === '') notice('structure_auto');

    // Opciones de la A en adelante, sin saltar letras
    const options: SyncQuestionOption[] = [];
    let blankBefore: string | null = null;
    for (const column of layout.options) {
      const optionText = at(column.text);
      const rationale = at(column.rationale);
      const biasText = at(column.bias);
      const header = optionHeaders(column.letter);
      if (optionText === '') {
        if (rationale !== '' || biasText !== '') problem('option_orphan', header.text);
        blankBefore ??= column.letter;
        continue;
      }
      if (blankBefore !== null) {
        if (!problems.some((item) => item.code === 'option_gap'))
          problem('option_gap', optionHeaders(blankBefore).text);
      }
      if (optionText.length > TEXT_LIMITS.optionText) problem('text_too_long', header.text);
      if (rationale.length > TEXT_LIMITS.rationale) problem('text_too_long', header.rationale);
      options.push({
        letter: column.letter,
        text: optionText,
        correct: false,
        bias: biasText,
        rationale,
      });
    }
    if (options.length < MIN_BANK_OPTIONS) problem('options_few', optionHeaders('A').text);

    const correctCell = cell('correct');
    const correctMatch = /^(?:opcion\s*)?([a-j])$/.exec(normalizeText(correctCell));
    const correctLetter = correctMatch?.[1]?.toUpperCase();
    if (correctLetter === undefined || !options.some((option) => option.letter === correctLetter))
      problem('correct_invalid', HEADERS.correct, correctCell);

    for (const option of options) {
      option.correct = option.letter === correctLetter;
      const biasText = option.bias ?? '';
      option.bias = null;
      if (option.rationale === '') incomplete.push(`rationale_missing:${option.letter}`);
      const none = normalizeText(biasText) === normalizeText(NO_BIAS_LABEL);
      if (option.correct) {
        if (biasText !== '') notice('bias_none_on_correct');
        continue;
      }
      if (biasText === '' || none) {
        incomplete.push(`bias_missing:${option.letter}`);
        continue;
      }
      const bias = findBias(biases, biasText);
      if (!bias?.taggable) incomplete.push(`bias_unknown:${option.letter}`);
      else option.bias = bias.key;
    }

    // Set canónico. El del médico, o la correcta con las tres primeras incorrectas
    const canonicalCell = cell('canonical');
    let canonical: string[];
    const chosen = [...new Set(canonicalCell.toUpperCase().match(/[A-J]/g) ?? [])];
    if (canonicalCell === '') {
      const keep = new Set([
        ...options.filter((option) => option.correct).map((option) => option.letter),
        ...options
          .filter((option) => !option.correct)
          .slice(0, 3)
          .map((option) => option.letter),
      ]);
      canonical = options
        .filter((option) => keep.has(option.letter))
        .map((option) => option.letter);
    } else {
      canonical = options
        .filter((option) => chosen.includes(option.letter))
        .map((option) => option.letter);
      const valid =
        chosen.length === 4 &&
        canonical.length === 4 &&
        options.some((option) => option.correct && canonical.includes(option.letter));
      if (!valid) problem('canonical_invalid', HEADERS.canonical, canonicalCell);
    }

    const explanation = cell('explanation');
    if (explanation === '') incomplete.unshift('explanation_missing');
    if (explanation.length > TEXT_LIMITS.explanation) problem('text_too_long', HEADERS.explanation);
    const refs = cell('refs')
      .split(/\n|;;/)
      .map((reference) => reference.trim())
      .filter(Boolean);
    if (refs.length === 0) incomplete.splice(explanation === '' ? 1 : 0, 0, 'references_missing');
    if (task === null && taskText === '' && prompt !== '') incomplete.unshift('task_undetected');
    if (
      refs.length > TEXT_LIMITS.references ||
      refs.some((reference) => reference.length > TEXT_LIMITS.reference)
    )
      problem('text_too_long', HEADERS.refs);

    const sheetStatus = parseSheetStatus(cell('status'), notices);
    if (languageRead.unknown) notices.push('language_unknown');
    if (languageInferred) notices.push('language_inferred');
    const authorCode = parseCode(cell('author'));
    let reviewerCode = parseCode(cell('reviewer'));
    if (authorCode === undefined) notice('author_unknown');
    if (reviewerCode === undefined) notice('reviewer_unknown');
    if (authorCode && reviewerCode && authorCode === reviewerCode) {
      notice('author_is_reviewer');
      reviewerCode = null;
    }

    const caseOrderText = cell('caseOrder');
    const caseOrder = /^\d+$/.test(caseOrderText) ? Number(caseOrderText) : null;
    const accepted = problems.length === 0 && branch && topic && subtopic ? true : false;
    pending.push({
      rowNumber: row.rowNumber,
      key: idText === '' ? null : idText,
      problems,
      incomplete,
      notices,
      question:
        accepted && branch && topic && subtopic
          ? {
              branch: branch.key,
              topic: topic.key,
              subtopic: subtopic.key,
              difficulty,
              itemKinds,
              // Vacía si no se detectó. Queda pendiente task_undetected
              task: task ?? '',
              polarity,
              structureDeclared: taskText !== '' && polarityText !== '',
              language,
              vignette,
              prompt,
              explanation,
              refs,
              options,
              canonical,
              caseKey: null,
              caseOrder: null,
              caseVignette: null,
            }
          : null,
      meta: {
        authorCode: authorCode ?? null,
        reviewerCode: reviewerCode ?? null,
        sheetStatus,
      },
      caseKey,
      caseOrderText,
      caseOrder,
      rawVignette: vignette,
      language,
      // Solo las preguntas en inglés leen la fuente del texto. En español se ignora (B13)
      passage:
        language === 'en'
          ? {
              title: cell('passageSource'),
              license: cell('passageLicense'),
              url: cell('passageUrl'),
            }
          : null,
    });
  }

  // ID repetidos. Ninguno de los renglones entra, para no mezclar la historia de dos preguntas
  const keyCount = new Map<string, number>();
  for (const row of pending) if (row.key) keyCount.set(row.key, (keyCount.get(row.key) ?? 0) + 1);
  for (const row of pending) {
    if (row.key && (keyCount.get(row.key) ?? 0) > 1) {
      row.problems.unshift({ code: 'id_duplicate', column: HEADERS.id });
      row.question = null;
    }
  }

  // Casos clínicos. Los renglones con el mismo Caso forman un caso aunque no estén juntos (3.6)
  const cases = new Map<string, PendingRow[]>();
  for (const row of pending) {
    if (row.caseKey === null) {
      if (row.caseOrderText !== '') {
        row.problems.push({ code: 'case_inconsistent', column: SHEET_HEADERS.caseOrder });
        row.question = null;
      }
      // Una pregunta suelta en inglés es válida y su fuente es la de su propio renglón
      applyPassage(row, row.passage);
      continue;
    }
    const members = cases.get(row.caseKey) ?? [];
    members.push(row);
    cases.set(row.caseKey, members);
  }
  for (const members of cases.values()) {
    const orders = members.map((row) => row.caseOrder);
    const sorted = [...orders].sort((a, b) => (a ?? 0) - (b ?? 0));
    const first = members.find((row) => row.caseOrder === 1);
    const orderingOk =
      orders.every((order) => order !== null) &&
      members.length <= MAX_CASE_ORDER &&
      sorted.every((order, index) => order === index + 1) &&
      first !== undefined &&
      first.rawVignette !== '' &&
      first.rawVignette.length <= TEXT_LIMITS.vignette;
    // Un caso lleva un solo idioma y una sola fuente del texto. Los renglones que no la repiten la
    // heredan del primero, por su Orden, que la trae (B13)
    const languageConflict = new Set(members.map((row) => row.language)).size > 1;
    const sources = [...members]
      .sort((a, b) => (a.caseOrder ?? MAX_CASE_ORDER + 1) - (b.caseOrder ?? MAX_CASE_ORDER + 1))
      .map((row) => row.passage)
      .filter(hasPassage);
    const sourceConflict = new Set(sources.map(passageKey)).size > 1;
    const coherent = orderingOk && !languageConflict && !sourceConflict;
    // La fuente compartida se aplica antes de contar los rechazos, porque una referencia que pasa del
    // largo rechaza el renglón y entonces el caso no entra partido
    if (coherent) for (const row of members) applyPassage(row, sources[0] ?? null);
    const anyRejected = members.some((row) => row.problems.length > 0);
    if (!coherent || anyRejected) {
      const column =
        !orderingOk || coherent
          ? SHEET_HEADERS.caseKey
          : languageConflict
            ? SHEET_HEADERS.language
            : SHEET_HEADERS.passageSource;
      for (const row of members) {
        if (!coherent || row.problems.length === 0)
          row.problems.push({ code: 'case_inconsistent', column });
        row.question = null;
      }
      continue;
    }
    const numbers = members.map((row) => row.rowNumber).sort((a, b) => a - b);
    const apart = numbers.some(
      (number, index) => index > 0 && number !== (numbers[index - 1] ?? 0) + 1,
    );
    const oddEnglishSize =
      first.language === 'en' &&
      (members.length < ENGLISH_CASE_SIZES.min || members.length > ENGLISH_CASE_SIZES.max);
    for (const row of members) {
      if (apart && !row.notices.includes('case_rows_apart')) row.notices.push('case_rows_apart');
      // Un caso de lectura con una pregunta, o con más de tres, entra igual y solo se avisa (D-080)
      if (oddEnglishSize) row.notices.push('english_case_size');
      if (!row.question) continue;
      row.question.caseKey = row.caseKey;
      row.question.caseOrder = row.caseOrder;
      row.question.caseVignette = first.rawVignette;
      // La viñeta del caso es la del Orden 1. Los demás renglones traen lo que se agrega en su paso
      if (row.caseOrder === 1) row.question.vignette = '';
    }
  }

  result.rows = pending.map((row) => ({
    rowNumber: row.rowNumber,
    key: row.key,
    problems: row.problems,
    incomplete: row.incomplete,
    notices: row.notices,
    question: row.problems.length === 0 ? row.question : null,
    meta: row.meta,
  }));
  return result;
}

/** El formato de una pregunta convertida del Sheet */
export function sheetQuestionFormat(
  question: Pick<SyncQuestion, 'caseKey' | 'vignette'>,
): 'clinical_case' | 'direct' | 'serial_case' {
  if (question.caseKey !== null) return 'serial_case';
  return question.vignette.trim() === '' ? 'direct' : 'clinical_case';
}
