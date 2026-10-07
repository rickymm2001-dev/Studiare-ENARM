// Plantilla de Excel del banco y su ida y vuelta. La plantilla se llena por código con 3 preguntas
// sintéticas de 4, 5 y 6 opciones y textos neutros como Opción A, nunca con medicina inventada. Se
// convierte con bank-convert, igual que lo hará el archivo del médico, y se comprueba que el
// resultado valida con el esquema del lote, con las reglas del borrador y con el adaptador del banco.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { strFromU8, unzipSync } from 'fflate';
import { afterAll, describe, expect, it } from 'vitest';
import { DemoQuestionBatchSchema, DemoQuestionSchema } from '@/data/schemas/content';
import { biasTaxonomy, structureDictionary, taggableBiasKeys, topicTaxonomy } from '@/demo/content';
import { buildDemoBank } from '@/demo/content/bank';
import { analyzeStructure } from '@/engines/structure';
import {
  HEADERS,
  KIND_LABELS,
  OPTION_LETTERS,
  TASK_LABELS,
  TEMPLATE_OPTIONS,
  loadTaxonomies,
  optionHeaders,
} from '../../scripts/content/bankColumns';
import {
  cellText,
  convertWorkbook,
  loadWorkbook,
  type ImportContext,
} from '../../scripts/content/bankImport';
import { TEMPLATE_ROWS, buildTemplateWorkbook } from '../../scripts/content/bankTemplate';
import { checkQuestions, type DraftContext } from '../../scripts/content/draftRules';

const ROOT = resolve(import.meta.dirname, '..', '..');
const data = loadTaxonomies(ROOT);
const importContext: ImportContext = {
  data,
  analyze: (question) => analyzeStructure(question, structureDictionary),
};
const draftContext: DraftContext = {
  taggable: taggableBiasKeys,
  allBiases: new Set(biasTaxonomy.biases.map((bias) => bias.key)),
  topics: new Map(
    topicTaxonomy.branches.flatMap((branch) =>
      branch.topics.map(
        (topic) =>
          [
            topic.key,
            { branch: branch.key, subtopics: new Set(topic.subtopics.map((s) => s.key)) },
          ] as const,
      ),
    ),
  ),
  analyze: importContext.analyze,
};

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'studiare-banco-'));
  tempDirs.push(dir);
  return dir;
};

// Nombres que ve el médico en las listas, tomados de la taxonomía real
const branch = data.branches[0];
const topic = branch?.topics[0];
const subtopic = topic?.subtopics[0];
const biasNames = data.biases.filter((bias) => bias.taggable).map((bias) => bias.name);
const words = (count: number) => Array.from({ length: count }, () => 'palabra').join(' ');

type Cells = Record<string, string | number>;

/** Una fila de la hoja Preguntas con la cantidad de opciones pedida y textos neutros */
function syntheticRow(options: {
  id: string;
  total: number;
  correct: string;
  overrides?: Cells;
}): Cells {
  const row: Cells = {
    [HEADERS.id]: options.id,
    [HEADERS.branch]: branch?.name ?? '',
    [HEADERS.topic]: topic?.name ?? '',
    [HEADERS.subtopic]: subtopic?.name ?? '',
    [HEADERS.difficulty]: 3,
    [HEADERS.task]: TASK_LABELS.diagnosis ?? '',
    [HEADERS.vignette]: 'Caso clínico de prueba.',
    [HEADERS.prompt]: `Pregunta de prueba ${options.id}.`,
    [HEADERS.correct]: options.correct,
    [HEADERS.explanation]: words(100),
    [HEADERS.refs]: 'Guía de práctica clínica de prueba',
    [HEADERS.status]: 'Borrador',
  };
  let distractor = 0;
  for (const letter of OPTION_LETTERS.slice(0, options.total)) {
    const names = optionHeaders(letter);
    row[names.text] = `Opción ${letter}`;
    row[names.rationale] = `Justificación ${letter}`;
    if (letter !== options.correct.toUpperCase()) {
      row[names.bias] = biasNames[distractor % biasNames.length] ?? '';
      distractor += 1;
    }
  }
  return { ...row, ...options.overrides };
}

/** La plantilla real, sin su fila de ejemplo, con las filas que pida la prueba */
function filledTemplate(rows: Cells[], keepExample = false) {
  const book = buildTemplateWorkbook(data);
  const sheet = book.getWorksheet('Preguntas') as ExcelJS.Worksheet;
  const columnOf = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => columnOf.set(cellText(cell.value), column));
  if (!keepExample) sheet.spliceRows(2, 1);
  const first = keepExample ? 3 : 2;
  rows.forEach((cells, index) => {
    const row = sheet.getRow(first + index);
    for (const [header, value] of Object.entries(cells)) {
      const column = columnOf.get(header);
      if (column === undefined) throw new Error(`La plantilla no tiene la columna ${header}`);
      row.getCell(column).value = value;
    }
  });
  return book;
}

const convert = (rows: Cells[], keepExample = false) =>
  convertWorkbook(filledTemplate(rows, keepExample), importContext, { prefix: 'banco' });

/** Las tres preguntas de la prueba. 4, 5 y 6 opciones, la última de control */
const threeQuestions = (): Cells[] => [
  syntheticRow({ id: 'b1-q01', total: 4, correct: 'B' }),
  syntheticRow({
    id: 'b1-q02',
    total: 5,
    correct: 'E',
    overrides: { [HEADERS.canonical]: 'A, C, D, E' },
  }),
  syntheticRow({
    id: 'b1-q03',
    total: 6,
    correct: 'C',
    overrides: {
      [HEADERS.kind]: KIND_LABELS.control ?? '',
      [HEADERS.polarity]: 'Negativa',
      [HEADERS.explanation]: 'Explicación breve de prueba.',
    },
  }),
];

describe('plantilla de Excel del banco', () => {
  const book = buildTemplateWorkbook(data);
  const sheet = book.getWorksheet('Preguntas') as ExcelJS.Worksheet;
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String);

  it('trae las hojas de instrucciones, preguntas, sesgos, temas y listas', () => {
    expect(book.worksheets.map((worksheet) => worksheet.name)).toEqual([
      'Instrucciones',
      'Preguntas',
      'Sesgos',
      'Temas',
      'Listas',
    ]);
  });

  it('la hoja Preguntas trae los encabezados que lee la conversión y hasta 6 opciones', () => {
    for (const header of Object.values(HEADERS)) expect(headers).toContain(header);
    for (const letter of OPTION_LETTERS.slice(0, TEMPLATE_OPTIONS))
      for (const header of Object.values(optionHeaders(letter))) expect(headers).toContain(header);
    expect(headers).not.toContain(optionHeaders('G').text);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it('trae una sola fila de ejemplo marcada, con marcadores neutros', () => {
    expect(sheet.rowCount).toBe(2);
    const example = sheet.getRow(2);
    expect(cellText(example.getCell(1).value)).toMatch(/^EJEMPLO/);
    const texts = (example.values as ExcelJS.CellValue[]).filter(
      (value): value is string => typeof value === 'string',
    );
    expect(texts.some((text) => text.startsWith('Escribe aquí el caso clínico'))).toBe(true);
    expect(texts.some((text) => text.startsWith('Escribe aquí la pregunta'))).toBe(true);
  });

  it('la plantilla sin llenar se convierte en cero preguntas y omite el ejemplo', () => {
    const result = convertWorkbook(book, importContext, { prefix: 'banco' });
    expect(result.questions).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.skippedExamples).toBe(1);
  });

  it('las listas desplegables salen de las taxonomías y cubren todas las filas', async () => {
    const files = unzipSync(new Uint8Array(await book.xlsx.writeBuffer()));
    const xml = strFromU8(files['xl/worksheets/sheet2.xml'] as Uint8Array);
    const lastRow = TEMPLATE_ROWS + 1;
    const columnLetter = (header: string) => sheet.getColumn(headers.indexOf(header) + 1).letter;
    const validationFor = (header: string) => {
      const letter = columnLetter(header);
      const match = new RegExp(
        `<dataValidation [^>]*sqref="${letter}2:${letter}${lastRow}"[^>]*><formula1>([^<]*)</formula1>`,
      ).exec(xml);
      return match?.[1]?.replaceAll('&quot;', '"');
    };
    // Rama, tema, subtema, tipo de reactivo, tarea y sesgos apuntan a la hoja Listas
    for (const header of [
      HEADERS.branch,
      HEADERS.topic,
      HEADERS.subtopic,
      HEADERS.kind,
      HEADERS.task,
      ...OPTION_LETTERS.slice(0, TEMPLATE_OPTIONS).map((letter) => optionHeaders(letter).bias),
    ])
      expect(validationFor(header), header).toMatch(/^Listas!\$[A-F]\$2:\$[A-F]\$\d+$/);
    expect(validationFor(HEADERS.difficulty)).toBe('"1,2,3,4,5"');
    expect(validationFor(HEADERS.polarity)).toBe('"Afirmativa,Negativa"');
    expect(validationFor(HEADERS.correct)).toBe('"A,B,C,D,E,F"');

    const lists = book.getWorksheet('Listas') as ExcelJS.Worksheet;
    const column = (index: number) => {
      const values: string[] = [];
      lists.getColumn(index).eachCell((cell, rowNumber) => {
        if (rowNumber > 1 && cell.value !== null) values.push(cellText(cell.value));
      });
      return values;
    };
    expect(column(1)).toEqual(data.branches.map((item) => item.name));
    expect(column(2)).toHaveLength(
      new Set(data.branches.flatMap((item) => item.topics.map((entry) => entry.name))).size,
    );
    expect(column(4)).toEqual(Object.values(KIND_LABELS));
    expect(column(6)).toEqual(biasNames);
  });

  it('el texto de las instrucciones no usa el signo de dos puntos', () => {
    const instructions = book.getWorksheet('Instrucciones') as ExcelJS.Worksheet;
    const texts: string[] = [];
    instructions.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'string') texts.push(cell.value);
      });
    });
    expect(texts.length).toBeGreaterThan(30);
    for (const text of texts) expect(text, text).not.toContain(':');
  });
});

describe('ida y vuelta de la plantilla con 4, 5 y 6 opciones', () => {
  const result = convert(threeQuestions());

  it('convierte las tres preguntas sin problemas', () => {
    expect(result.problems).toEqual([]);
    expect(result.questions.map((question) => question.options.length)).toEqual([4, 5, 6]);
    expect(result.questions.map((question) => question.key)).toEqual([
      'b1-q01',
      'b1-q02',
      'b1-q03',
    ]);
  });

  it('cada pregunta trae una correcta sin sesgo y sesgo en cada incorrecta', () => {
    const correctKeys = result.questions.map(
      (question) => question.options.find((option) => option.correct)?.key,
    );
    expect(correctKeys).toEqual(['b', 'e', 'c']);
    for (const question of result.questions) {
      expect(question.options.filter((option) => option.correct)).toHaveLength(1);
      for (const option of question.options)
        expect(option.bias === undefined, `${question.key}${option.key}`).toBe(option.correct);
      expect(question.options.map((option) => option.key)).toEqual(
        'abcdef'.split('').slice(0, question.options.length),
      );
    }
  });

  it('el set canónico es el del médico, o la correcta con las tres primeras incorrectas', () => {
    expect(result.questions.map((question) => question.canonical)).toEqual([
      ['a', 'b', 'c', 'd'],
      ['a', 'c', 'd', 'e'],
      ['a', 'b', 'c', 'd'],
    ]);
  });

  it('la de control entra como tal y su polaridad declarada gana sobre la del motor', () => {
    const control = result.questions[2];
    expect(control?.kinds).toEqual(['control']);
    expect(control?.polarity).toBe('negative');
    expect(result.questions[0]?.kinds).toBeUndefined();
    expect(result.questions[0]?.polarity).toBe('affirmative');
  });

  it('el resultado valida con el esquema de la pregunta y del lote', () => {
    for (const question of result.questions) {
      const parsed = DemoQuestionSchema.safeParse(question);
      expect(parsed.error?.issues, question.key).toBeUndefined();
    }
    const batch = DemoQuestionBatchSchema.safeParse({
      batch: 1,
      status: 'pending_physician_review',
      cases: [],
      questions: result.questions,
    });
    expect(batch.error?.issues).toBeUndefined();
  });

  it('pasa las reglas del borrador y solo avisa lo que se aparta', () => {
    const report = checkQuestions(result.questions, draftContext);
    expect(report.problems).toEqual([]);
    expect(report.notes).toEqual([
      'b1-q01 tiene 4 opciones y los lotes demo traen 10',
      'b1-q02 tiene 5 opciones y los lotes demo traen 10',
      'b1-q03 polaridad negative, el motor dice affirmative',
    ]);
  });

  it('entra al banco de la base con IDs, opciones y set canónico de 4', () => {
    const bank = buildDemoBank([
      DemoQuestionBatchSchema.parse({
        batch: 1,
        status: 'pending_physician_review',
        cases: [],
        questions: result.questions,
      }),
    ]);
    expect(bank.questions.map((entry) => entry.options.length)).toEqual([4, 5, 6]);
    expect(bank.questions.map((entry) => entry.question.itemKinds)).toEqual([
      undefined,
      undefined,
      ['control'],
    ]);
    for (const entry of bank.questions) {
      expect(entry.question.canonicalOptionIds).toHaveLength(4);
      expect(entry.question.editorialStatus).toBe('draft');
    }
  });

  it('el comando bank-convert lee el archivo y su salida pasa check-draft', async () => {
    const dir = tempDir();
    const file = join(dir, 'Banco de prueba.xlsx');
    await filledTemplate(threeQuestions(), true).xlsx.writeFile(file);
    const run = (script: string, ...args: string[]) =>
      spawnSync(process.execPath, [resolve(ROOT, 'scripts/content', script), ...args], {
        cwd: ROOT,
        encoding: 'utf8',
      });
    const converted = run('bank-convert.ts', file);
    expect(converted.stderr).toBe('');
    expect(converted.status).toBe(0);
    expect(converted.stdout).toContain('banco-de-prueba. 3 preguntas de 3 filas con datos');
    expect(converted.stdout).toContain('omitida');
    const output = join(dir, 'json', 'banco-de-prueba.json');
    const saved = JSON.parse(readFileSync(output, 'utf8')) as {
      cases: unknown[];
      questions: { key: string; options: unknown[] }[];
    };
    expect(saved.cases).toEqual([]);
    expect(saved.questions.map((question) => question.options.length)).toEqual([4, 5, 6]);

    const checked = run('check-draft.ts', output);
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain("Opciones por pregunta { '4': 1, '5': 1, '6': 1 }");
    expect(checked.stdout).toContain('Sin problemas');
  });

  it('el comando termina con error si una fila trae problemas, y la deja fuera de la salida', async () => {
    const dir = tempDir();
    const file = join(dir, 'malo.xlsx');
    await filledTemplate([
      syntheticRow({ id: 'b1-q01', total: 4, correct: 'A' }),
      syntheticRow({ id: 'b1-q02', total: 4, correct: 'A', overrides: { [HEADERS.correct]: 'F' } }),
    ]).xlsx.writeFile(file);
    const run = spawnSync(
      process.execPath,
      [resolve(ROOT, 'scripts/content/bank-convert.ts'), file, '--out', join(dir, 'salida')],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(run.status).toBe(1);
    expect(run.stdout).toContain('Fila 3 (b1-q02) la opción correcta "F"');
    const saved = JSON.parse(readFileSync(join(dir, 'salida', 'malo.json'), 'utf8')) as {
      questions: { key: string }[];
    };
    expect(saved.questions.map((question) => question.key)).toEqual(['b1-q01']);
  });
});

describe('lectura de la plantilla llena', () => {
  it('lee el archivo desde el disco, con la fila de ejemplo en su lugar', async () => {
    const dir = tempDir();
    const file = join(dir, 'banco.xlsx');
    await filledTemplate(threeQuestions(), true).xlsx.writeFile(file);
    const result = convertWorkbook(await loadWorkbook(file), importContext, { prefix: 'banco' });
    expect(result.problems).toEqual([]);
    expect(result.questions).toHaveLength(3);
    expect(result.skippedExamples).toBe(1);
  });

  it('asigna un ID con el prefijo del archivo si la fila no trae uno', () => {
    const result = convert([
      syntheticRow({ id: '', total: 4, correct: 'A' }),
      syntheticRow({ id: '', total: 6, correct: 'F' }),
    ]);
    expect(result.questions.map((question) => question.key)).toEqual([
      'banco-q0001',
      'banco-q0002',
    ]);
  });

  it('detecta la polaridad y la tarea con el motor cuando el médico las deja vacías', () => {
    const result = convert([
      syntheticRow({
        id: 'b1-q01',
        total: 4,
        correct: 'A',
        overrides: {
          [HEADERS.task]: '',
          [HEADERS.prompt]: '¿Cuál es el diagnóstico más probable?',
        },
      }),
      syntheticRow({
        id: 'b1-q02',
        total: 4,
        correct: 'A',
        overrides: { [HEADERS.prompt]: 'Todas las siguientes son opciones de prueba, EXCEPTO' },
      }),
      syntheticRow({ id: 'b1-q03', total: 4, correct: 'A', overrides: { [HEADERS.task]: '' } }),
    ]);
    expect(result.questions[0]).toMatchObject({ task: 'diagnosis', polarity: 'affirmative' });
    expect(result.questions[1]).toMatchObject({ task: 'diagnosis', polarity: 'negative' });
    // Sin tarea declarada y sin que el motor la detecte, la fila se señala y no entra
    expect(result.problems.join()).toContain('Fila 4 (b1-q03) no se pudo detectar la tarea');
    expect(result.questions).toHaveLength(2);
  });

  it('acepta Tema en lugar de Subespecialidad y las letras en minúscula', () => {
    const book = filledTemplate([syntheticRow({ id: 'b1-q01', total: 4, correct: 'a' })]);
    const sheet = book.getWorksheet('Preguntas') as ExcelJS.Worksheet;
    sheet.getRow(1).eachCell((cell) => {
      if (cell.value === HEADERS.topic) cell.value = 'Tema';
    });
    const result = convertWorkbook(book, importContext, { prefix: 'banco' });
    expect(result.problems).toEqual([]);
    expect(result.questions[0]?.options.find((option) => option.correct)?.key).toBe('a');
  });
});

describe('problemas que se señalan con el número de fila', () => {
  const problemsOf = (...rows: Cells[]) => convert(rows).problems.join('\n');
  const base = (overrides: Cells, total = 4, correct = 'A') =>
    syntheticRow({ id: 'b1-q01', total, correct, overrides });

  it('menos de 4 opciones', () => {
    expect(problemsOf(syntheticRow({ id: 'b1-q01', total: 3, correct: 'A' }))).toContain(
      'Fila 2 (b1-q01) tiene 3 opciones y se necesitan al menos 4',
    );
  });

  it('una letra saltada', () => {
    const row = syntheticRow({ id: 'b1-q01', total: 5, correct: 'A' });
    row[optionHeaders('C').text] = '';
    row[optionHeaders('C').rationale] = '';
    row[optionHeaders('C').bias] = '';
    expect(problemsOf(row)).toContain('salta la opción C');
  });

  it('una opción sin justificación, una incorrecta sin sesgo y la correcta con sesgo', () => {
    expect(problemsOf(base({ [optionHeaders('B').rationale]: '' }))).toContain(
      'la opción B no tiene justificación',
    );
    expect(problemsOf(base({ [optionHeaders('B').bias]: '' }))).toContain(
      'la opción incorrecta B no tiene sesgo',
    );
    expect(problemsOf(base({ [optionHeaders('A').bias]: biasNames[0] ?? '' }))).toContain(
      'la opción correcta A no lleva sesgo',
    );
  });

  it('un sesgo, un tipo, una tarea o una dificultad que no están en la lista', () => {
    expect(problemsOf(base({ [optionHeaders('B').bias]: 'Sesgo inventado' }))).toContain(
      'el sesgo "Sesgo inventado" de la opción B no está en la lista',
    );
    expect(problemsOf(base({ [HEADERS.kind]: 'Rarísimo' }))).toContain(
      'el tipo de reactivo "Rarísimo" no está en la lista',
    );
    expect(problemsOf(base({ [HEADERS.task]: 'Tarea inventada' }))).toContain(
      'la tarea "Tarea inventada" no está en la lista',
    );
    expect(problemsOf(base({ [HEADERS.difficulty]: 7 }))).toContain('la dificultad debe ser');
  });

  it('un tema que no es de la rama o un subtema que no es del tema', () => {
    const otherBranch = data.branches[1];
    expect(problemsOf(base({ [HEADERS.topic]: otherBranch?.topics[0]?.name ?? '' }))).toContain(
      'no pertenece a la rama',
    );
    const otherSubtopic = branch?.topics[1]?.subtopics[0]?.name ?? '';
    expect(problemsOf(base({ [HEADERS.subtopic]: otherSubtopic }))).toContain(
      'no pertenece a la subespecialidad',
    );
  });

  it('la correcta fuera de las opciones y un set canónico que no sirve', () => {
    expect(problemsOf(base({ [HEADERS.correct]: 'F' }))).toContain('la opción correcta "F"');
    // Tres letras, sin la correcta, o con una letra que no es una opción
    for (const canonical of ['A, B, C', 'B, C, D, E', 'A, B, C, G'])
      expect(problemsOf(base({ [HEADERS.canonical]: canonical }, 6, 'A')), canonical).toContain(
        'el set canónico',
      );
  });

  it('texto de la plantilla sin reemplazar, ID repetido, estado distinto y sin explicación', () => {
    expect(problemsOf(base({ [HEADERS.vignette]: 'Escribe aquí el caso clínico' }))).toContain(
      'todavía tiene texto de la plantilla sin reemplazar',
    );
    expect(problemsOf(base({ [HEADERS.topic]: 'Elige de la lista' }))).toContain(
      'todavía tiene texto de la plantilla sin reemplazar',
    );
    expect(problemsOf(base({}), base({}))).toContain('Fila 3 (b1-q01) repite un ID');
    expect(problemsOf(base({ [HEADERS.status]: 'Validada' }))).toContain(
      'el estado debe ser Borrador',
    );
    expect(problemsOf(base({ [HEADERS.explanation]: '' }))).toContain('no tiene explicación');
    expect(problemsOf(base({ [HEADERS.refs]: '' }))).toContain('no tiene referencias');
  });

  it('una fila con problemas no frena a las demás', () => {
    const result = convert([
      base({ [HEADERS.difficulty]: 9 }),
      syntheticRow({ id: 'b1-q02', total: 6, correct: 'D' }),
    ]);
    expect(result.questions.map((question) => question.key)).toEqual(['b1-q02']);
    expect(result.problems).toHaveLength(1);
  });

  it('un libro sin las columnas de la plantilla dice cuáles faltan', () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet('Preguntas').addRow(['Otra cosa']);
    const result = convertWorkbook(book, importContext, { prefix: 'banco' });
    expect(result.questions).toEqual([]);
    expect(result.problems.join()).toContain('Falta la columna Rama troncal');
  });
});
