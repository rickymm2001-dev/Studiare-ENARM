// Convierte una tabla de texto con las columnas de la plantilla del banco (bankColumns.ts) a
// preguntas en el formato de borrador. La usan el importador de la app (pantalla 22) y el script de
// Node que lee el Excel, así los dos aceptan lo mismo y dicen lo mismo. No decide nada de medicina.
// Solo traduce los nombres de la lista a las claves de las taxonomías, arma las opciones (de 4 a 10,
// con las demás en blanco) y avisa con el número de fila lo que no se pueda representar. Una fila con
// problemas no pasa a la salida. Funciones puras, sin Node ni React.
import {
  EXAMPLE_PREFIX,
  HEADER_ALIASES,
  HEADERS,
  KIND_LABELS,
  MIN_BANK_OPTIONS,
  OPTION_LETTERS,
  PLACEHOLDER,
  PLACEHOLDER_PICK,
  POLARITY_LABELS,
  TASK_LABELS,
  normalizeText,
  optionHeaders,
  type BiasInfo,
  type ContentTaxonomies,
} from './bankColumns.ts';

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
  /** Polaridad y tarea que detecta el motor de estructura, para lo que el médico deja vacío */
  analyze: (question: { vignette: string; prompt: string; serialCase: boolean }) => {
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
