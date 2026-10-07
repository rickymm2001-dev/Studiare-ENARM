// Plantilla de Excel para que el médico entregue el banco de preguntas (4,000 a 5,000, de 4 a 6
// opciones). Arma el libro con exceljs sin escribir nada de medicina. Los encabezados son los mismos
// que lee bankImport.ts, así que la plantilla llenada entra sin cambios. Las listas desplegables
// salen de las taxonomías de src/demo/content, no de textos escritos aquí.
// Hojas. Instrucciones, Preguntas (con una fila de ejemplo para borrar), Sesgos, Temas y Listas.
import ExcelJS from 'exceljs';
import {
  DRAFT_STATE_LABEL,
  EXAMPLE_ID,
  HEADERS,
  KIND_LABELS,
  MIN_BANK_OPTIONS,
  OPTION_LETTERS,
  PLACEHOLDER,
  PLACEHOLDER_PICK,
  POLARITY_LABELS,
  TASK_LABELS,
  TEMPLATE_OPTIONS,
  optionHeaders,
  type ContentTaxonomies,
} from './bankColumns.ts';

/** Filas de Preguntas con listas desplegables. Alcanza de sobra para 5,000 preguntas */
export const TEMPLATE_ROWS = 6000;

const HEADER_REQUIRED = 'FF0E5A6B';
const HEADER_OPTIONAL = 'FF5B7B85';
const EXAMPLE_FILL = 'FFFFF2CC';
const SECTION_FILL = 'FFD9ECEF';

const unique = (values: string[]) => [...new Set(values)];

interface ColumnSpec {
  header: string;
  width: number;
  required: boolean;
  /** Texto largo que se acomoda en varias líneas */
  wrap?: boolean;
}

/** Columnas de la hoja Preguntas, en el orden en que se llenan */
function questionColumns(): ColumnSpec[] {
  const options = OPTION_LETTERS.slice(0, TEMPLATE_OPTIONS).flatMap((letter, index) => {
    const names = optionHeaders(letter);
    const required = index < MIN_BANK_OPTIONS;
    return [
      { header: names.text, width: 34, required, wrap: true },
      { header: names.rationale, width: 40, required, wrap: true },
      { header: names.bias, width: 30, required: false },
    ];
  });
  return [
    { header: HEADERS.id, width: 24, required: false },
    { header: HEADERS.branch, width: 24, required: true },
    { header: HEADERS.topic, width: 28, required: true },
    { header: HEADERS.subtopic, width: 30, required: true },
    { header: HEADERS.difficulty, width: 12, required: true },
    { header: HEADERS.kind, width: 22, required: false },
    { header: HEADERS.task, width: 24, required: false },
    { header: HEADERS.polarity, width: 13, required: false },
    { header: HEADERS.vignette, width: 60, required: false, wrap: true },
    { header: HEADERS.prompt, width: 45, required: true, wrap: true },
    ...options,
    { header: HEADERS.correct, width: 11, required: true },
    { header: HEADERS.canonical, width: 15, required: false },
    { header: HEADERS.explanation, width: 70, required: true, wrap: true },
    { header: HEADERS.refs, width: 45, required: true, wrap: true },
    { header: HEADERS.status, width: 14, required: false },
  ];
}

/** Las listas desplegables viven en la hoja Listas, una por columna, desde la fila 2 */
function buildLists(data: ContentTaxonomies) {
  const lists = {
    branches: data.branches.map((branch) => branch.name),
    topics: unique(data.branches.flatMap((branch) => branch.topics.map((topic) => topic.name))),
    subtopics: unique(
      data.branches.flatMap((branch) =>
        branch.topics.flatMap((topic) => topic.subtopics.map((subtopic) => subtopic.name)),
      ),
    ),
    kinds: Object.values(KIND_LABELS),
    tasks: Object.values(TASK_LABELS),
    biases: data.biases.filter((bias) => bias.taggable).map((bias) => bias.name),
  };
  const order = ['branches', 'topics', 'subtopics', 'kinds', 'tasks', 'biases'] as const;
  const headers: Record<(typeof order)[number], string> = {
    branches: HEADERS.branch,
    topics: HEADERS.topic,
    subtopics: HEADERS.subtopic,
    kinds: HEADERS.kind,
    tasks: HEADERS.task,
    biases: 'Sesgo',
  };
  const column = (name: (typeof order)[number]) => String.fromCharCode(65 + order.indexOf(name));
  const range = (name: (typeof order)[number]) =>
    `Listas!$${column(name)}$2:$${column(name)}$${lists[name].length + 1}`;
  return { lists, order, headers, range };
}

function styleHeader(row: ExcelJS.Row, fill: (columnNumber: number) => string) {
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
  row.eachCell((cell, columnNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill(columnNumber) } };
  });
}

interface ValidationHost {
  dataValidations: { add: (address: string, validation: ExcelJS.DataValidation) => void };
}

function addValidations(sheet: ExcelJS.Worksheet, data: ContentTaxonomies) {
  // exceljs no declara dataValidations en el tipo de la hoja, pero lo escribe como rangos
  const host = sheet as unknown as ValidationHost;
  const { range } = buildLists(data);
  const headerRow = sheet.getRow(1);
  const columnOf = (header: string): string => {
    let found = '';
    headerRow.eachCell((cell, columnNumber) => {
      if (cell.value === header) found = sheet.getColumn(columnNumber).letter;
    });
    if (found === '') throw new Error(`Falta la columna ${header} en la plantilla`);
    return found;
  };
  const list = (
    header: string,
    formula: string,
    extra: Partial<ExcelJS.DataValidation> = {},
  ): void => {
    const letter = columnOf(header);
    host.dataValidations.add(`${letter}2:${letter}${TEMPLATE_ROWS + 1}`, {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Valor fuera de la lista',
      error: 'Elige un valor de la lista desplegable.',
      ...extra,
    });
  };

  list(HEADERS.branch, range('branches'));
  list(HEADERS.topic, range('topics'), {
    showInputMessage: true,
    promptTitle: 'Subespecialidad',
    prompt: 'Debe pertenecer a la rama elegida. La hoja Temas muestra cuáles van con cada rama.',
  });
  list(HEADERS.subtopic, range('subtopics'), {
    showInputMessage: true,
    promptTitle: 'Subtema',
    prompt: 'Debe pertenecer a la subespecialidad elegida. La hoja Temas lo muestra.',
  });
  list(HEADERS.difficulty, '"1,2,3,4,5"', {
    showInputMessage: true,
    promptTitle: 'Dificultad',
    prompt: 'De 1 (muy fácil) a 5 (muy difícil).',
  });
  list(HEADERS.kind, range('kinds'), {
    errorStyle: 'warning',
    error:
      'Si la pregunta tiene más de un tipo, sepáralos con punto y coma. ¿Conservas lo que escribiste?',
    showInputMessage: true,
    promptTitle: 'Tipo de reactivo',
    prompt: 'Déjalo vacío en una pregunta normal. Si hay varios tipos, sepáralos con punto y coma.',
  });
  list(HEADERS.task, range('tasks'), {
    showInputMessage: true,
    promptTitle: 'Tarea',
    prompt: 'Opcional. Si la dejas vacía, la plataforma la detecta por la frase de la pregunta.',
  });
  list(HEADERS.polarity, `"${Object.values(POLARITY_LABELS).join(',')}"`, {
    showInputMessage: true,
    promptTitle: 'Polaridad',
    prompt: 'Opcional. Si la dejas vacía, la plataforma la detecta por la frase de la pregunta.',
  });
  for (const letter of OPTION_LETTERS.slice(0, TEMPLATE_OPTIONS)) {
    list(optionHeaders(letter).bias, range('biases'), {
      showInputMessage: true,
      promptTitle: `Sesgo de la opción ${letter}`,
      prompt: 'Solo en las opciones incorrectas. La correcta no lleva sesgo. Ver la hoja Sesgos.',
    });
  }
  list(HEADERS.correct, `"${OPTION_LETTERS.slice(0, TEMPLATE_OPTIONS).join(',')}"`, {
    showInputMessage: true,
    promptTitle: 'Correcta',
    prompt: 'La letra de la única opción correcta.',
  });
  list(HEADERS.status, `"${DRAFT_STATE_LABEL}"`);
}

function addQuestionsSheet(book: ExcelJS.Workbook, data: ContentTaxonomies) {
  const sheet = book.addWorksheet('Preguntas');
  const specs = questionColumns();
  sheet.columns = specs.map((spec) => ({ header: spec.header, width: spec.width }));
  styleHeader(sheet.getRow(1), (columnNumber) =>
    specs[columnNumber - 1]?.required ? HEADER_REQUIRED : HEADER_OPTIONAL,
  );
  specs.forEach((spec, index) => {
    if (spec.wrap) sheet.getColumn(index + 1).alignment = { vertical: 'top', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  // Una sola fila de ejemplo con marcadores neutros. La plataforma la omite por su ID
  const example: Record<string, string | number> = {
    [HEADERS.id]: EXAMPLE_ID,
    [HEADERS.branch]: PLACEHOLDER_PICK,
    [HEADERS.topic]: PLACEHOLDER_PICK,
    [HEADERS.subtopic]: PLACEHOLDER_PICK,
    [HEADERS.difficulty]: 'Elige de 1 a 5',
    [HEADERS.vignette]: `${PLACEHOLDER} el caso clínico`,
    [HEADERS.prompt]: `${PLACEHOLDER} la pregunta`,
    [HEADERS.correct]: 'A',
    [HEADERS.explanation]: `${PLACEHOLDER} la explicación de la respuesta`,
    [HEADERS.refs]: `${PLACEHOLDER} el título de la guía de práctica clínica o de la norma`,
    [HEADERS.status]: DRAFT_STATE_LABEL,
  };
  OPTION_LETTERS.slice(0, MIN_BANK_OPTIONS).forEach((letter, index) => {
    const names = optionHeaders(letter);
    example[names.text] = `${PLACEHOLDER} la opción ${letter}`;
    example[names.rationale] =
      index === 0
        ? `${PLACEHOLDER} por qué la opción ${letter} es la correcta`
        : `${PLACEHOLDER} por qué la opción ${letter} atrae`;
    if (index > 0) example[names.bias] = PLACEHOLDER_PICK;
  });
  const row = sheet.addRow(specs.map((spec) => example[spec.header] ?? ''));
  row.font = { italic: true, color: { argb: 'FF595959' } };
  row.alignment = { vertical: 'top', wrapText: true };
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXAMPLE_FILL } };
  });
  addValidations(sheet, data);
}

function addBiasSheet(book: ExcelJS.Workbook, data: ContentTaxonomies) {
  const sheet = book.addWorksheet('Sesgos');
  sheet.columns = [
    { header: 'Sesgo', width: 46 },
    { header: 'Cómo luce una opción incorrecta con este sesgo', width: 110 },
  ];
  styleHeader(sheet.getRow(1), () => HEADER_REQUIRED);
  for (const bias of data.biases.filter((entry) => entry.taggable))
    sheet.addRow([bias.name, bias.distractorDefinition]);
  sheet.eachRow((row, index) => {
    if (index > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function addTopicsSheet(book: ExcelJS.Workbook, data: ContentTaxonomies) {
  const sheet = book.addWorksheet('Temas');
  sheet.columns = [
    { header: HEADERS.branch, width: 28 },
    { header: HEADERS.topic, width: 32 },
    { header: HEADERS.subtopic, width: 40 },
  ];
  styleHeader(sheet.getRow(1), () => HEADER_REQUIRED);
  for (const branch of data.branches)
    for (const topic of branch.topics)
      for (const subtopic of topic.subtopics)
        sheet.addRow([branch.name, topic.name, subtopic.name]);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 3 } };
}

function addListsSheet(book: ExcelJS.Workbook, data: ContentTaxonomies) {
  const sheet = book.addWorksheet('Listas');
  const { lists, order, headers } = buildLists(data);
  sheet.columns = order.map((name) => ({ header: headers[name], width: 34 }));
  styleHeader(sheet.getRow(1), () => HEADER_OPTIONAL);
  order.forEach((name, index) => {
    lists[name].forEach((value, position) => {
      sheet.getCell(position + 2, index + 1).value = value;
    });
  });
}

type InstructionRow = readonly [string, string, string?];

function instructionRows(): { title: string; rows: InstructionRow[]; table?: true }[] {
  const lastLetter = OPTION_LETTERS[TEMPLATE_OPTIONS - 1] ?? 'F';
  const fourth = OPTION_LETTERS[MIN_BANK_OPTIONS - 1] ?? 'D';
  return [
    {
      title: 'Cómo usar esta plantilla',
      rows: [
        ['Paso 1', 'Abre la hoja Preguntas. Cada fila es una pregunta.'],
        [
          'Paso 2',
          'Borra la fila amarilla de ejemplo antes de entregar. Si se queda, la plataforma la omite, pero es mejor quitarla.',
        ],
        ['Paso 3', 'Escribe una pregunta por fila, empezando justo debajo de los encabezados.'],
        [
          'Paso 4',
          'Usa las listas desplegables en las columnas que las tienen. Si escribes un valor que la plataforma no reconoce, te lo va a señalar con el número de fila.',
        ],
        [
          'Paso 5',
          'No cambies, muevas ni borres los encabezados de la fila 1, y no agregues columnas en medio.',
        ],
        ['Paso 6', 'Guarda el archivo como Excel (.xlsx) y entrégalo con el nombre que quieras.'],
      ],
    },
    {
      title: 'Reglas del banco',
      rows: [
        [
          'Una sola opción correcta',
          'Cada pregunta tiene exactamente una opción correcta. Márcala en la columna Correcta con su letra.',
        ],
        [
          'Un sesgo por opción incorrecta',
          'Cada opción incorrecta lleva el sesgo cognitivo que explica por qué tienta, elegido de la lista de la columna Sesgo. La opción correcta no lleva sesgo. La hoja Sesgos define cada uno.',
        ],
        [
          'Justificación en cada opción',
          'Cada opción lleva su justificación. En la correcta explica por qué lo es y en las incorrectas explica por qué atraen.',
        ],
        [
          `De ${MIN_BANK_OPTIONS} a ${TEMPLATE_OPTIONS} opciones`,
          `Escribe de ${MIN_BANK_OPTIONS} a ${TEMPLATE_OPTIONS} opciones, siempre empezando por la A y sin saltarte letras. Deja en blanco las que no uses, con su justificación y su sesgo. El examen real muestra 4 opciones y la plataforma puede mostrar más para subir la dificultad. Con 4 opciones se muestran todas.`,
        ],
        ['Opciones distintas', 'Los textos de las opciones de una misma pregunta no se repiten.'],
        [
          'Tipo de reactivo',
          'Déjalo vacío en una pregunta normal. Elige uno si la pregunta es especial. De control mide la atención y tiene una respuesta clara si se lee con cuidado. Con incoherencias trae datos que no cuadran a propósito. Resolución inversa son casos casi iguales que solo se separan por el tratamiento. Datos oscuros pregunta un dato muy específico. Desde el paciente está escrita como la contaría el paciente. Si son varios, sepáralos con punto y coma.',
        ],
        [
          'Una pregunta especial no se rechaza por imperfecta',
          'El examen real tiene preguntas raras y la plataforma las quiere. Una pregunta de cualquier tipo puede tener una explicación corta o redacción incómoda a propósito. Lo que sí necesita siempre es una sola correcta, un sesgo en cada incorrecta y una explicación que no esté vacía.',
        ],
        ['Dificultad', 'Un número del 1 (muy fácil) al 5 (muy difícil), según tu criterio.'],
        [
          'Estado',
          'Todo entra como borrador y queda pendiente de revisión médica. Nada se publica como validado hasta que alguien lo apruebe.',
        ],
        [
          'El contenido es tuyo',
          'La plataforma no corrige ni reescribe lo que escribes. Solo revisa que la estructura esté completa y te avisa lo que falte.',
        ],
      ],
    },
    {
      title: 'Columnas de la hoja Preguntas',
      table: true,
      rows: [
        [
          HEADERS.id,
          'Un código propio de la pregunta. Si lo dejas vacío, la plataforma le asigna uno. No lo repitas. Un ID que empieza con Ejemplo se omite.',
          'No',
        ],
        [HEADERS.branch, 'Elige de la lista.', 'Sí'],
        [
          HEADERS.topic,
          'Elige de la lista el tema de la pregunta. Debe pertenecer a la rama elegida. La hoja Temas muestra qué subespecialidades y subtemas van con cada rama.',
          'Sí',
        ],
        [
          HEADERS.subtopic,
          'Elige de la lista. Debe pertenecer a la subespecialidad elegida.',
          'Sí',
        ],
        [HEADERS.difficulty, 'Del 1 al 5.', 'Sí'],
        [HEADERS.kind, 'Vacío en una pregunta normal. Ver las reglas del banco.', 'No'],
        [
          HEADERS.task,
          'Lo que pide la pregunta, por ejemplo un diagnóstico o el siguiente paso. Si la dejas vacía, la plataforma la detecta por la frase de la pregunta. Si no puede detectarla, te la va a pedir.',
          'Solo si hace falta',
        ],
        [
          HEADERS.polarity,
          'Afirmativa o Negativa. Una pregunta de excepción, con la palabra EXCEPTO, es negativa. Si la dejas vacía, la plataforma la detecta sola.',
          'No',
        ],
        [
          HEADERS.vignette,
          'El caso o la viñeta. Puede quedar vacío en una pregunta directa.',
          'No',
        ],
        [
          HEADERS.prompt,
          'La frase que se contesta, completa. Ahí se detecta si la pregunta es afirmativa o negativa.',
          'Sí',
        ],
        [
          `Opción A a ${lastLetter}`,
          `El texto de cada opción. De la A a la ${fourth} son obligatorias y las demás son opcionales.`,
          `A a ${fourth}`,
        ],
        [
          `Justificación A a ${lastLetter}`,
          'Por qué la opción es correcta, o por qué tienta si es incorrecta. Va en cada opción que escribiste.',
          `En cada opción`,
        ],
        [
          `Sesgo A a ${lastLetter}`,
          'El sesgo de la opción incorrecta, de la lista. Vacío en la correcta.',
          'En cada incorrecta',
        ],
        [HEADERS.correct, 'La letra de la opción correcta.', 'Sí'],
        [
          HEADERS.canonical,
          'Cuatro letras separadas por comas, que incluyan la correcta. Son las opciones que se muestran por defecto en el examen. Si lo dejas vacío, la plataforma toma la correcta y las tres primeras incorrectas.',
          'No',
        ],
        [
          HEADERS.explanation,
          'La explicación de la respuesta. En una pregunta normal, de 80 a 150 palabras. En una pregunta de tipo especial puede ser más corta, pero no vacía.',
          'Sí',
        ],
        [
          HEADERS.refs,
          'De una a tres guías de práctica clínica o normas, una por línea dentro de la celda con Alt y Enter. Solo el título, sin año ni clave de catálogo.',
          'Sí',
        ],
        [HEADERS.status, 'Deja Borrador.', 'No'],
      ],
    },
  ];
}

function addInstructionsSheet(book: ExcelJS.Workbook) {
  const sheet = book.addWorksheet('Instrucciones');
  sheet.columns = [{ width: 34 }, { width: 110 }, { width: 20 }];
  // Para imprimirla en una hoja de ancho, sin cortar la columna de texto
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  const title = sheet.addRow(['Plantilla del banco de preguntas de Studiare']);
  title.font = { bold: true, size: 16 };
  const intro = sheet.addRow([
    'Aquí vas a escribir las preguntas del banco. Todo lo que entregues entra como borrador y queda pendiente de revisión médica hasta que alguien lo apruebe.',
  ]);
  intro.getCell(1).alignment = { wrapText: false };
  sheet.addRow([]);
  for (const section of instructionRows()) {
    const heading = sheet.addRow(
      section.table ? [section.title, 'Qué escribir', '¿Es obligatoria?'] : [section.title],
    );
    heading.font = { bold: true, size: 12 };
    for (let column = 1; column <= 3; column += 1)
      heading.getCell(column).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: SECTION_FILL },
      };
    for (const [label, text, required] of section.rows) {
      const row = sheet.addRow(required === undefined ? [label, text] : [label, text, required]);
      row.alignment = { vertical: 'top', wrapText: true };
      row.getCell(1).font = { bold: true };
    }
    sheet.addRow([]);
  }
}

/** Arma el libro de la plantilla. Es una función pura de las taxonomías, sin tocar el disco */
export function buildTemplateWorkbook(data: ContentTaxonomies): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = 'Studiare';
  book.created = new Date();
  addInstructionsSheet(book);
  addQuestionsSheet(book, data);
  addBiasSheet(book, data);
  addTopicsSheet(book, data);
  addListsSheet(book, data);
  return book;
}
