// Prepara textos con licencia para los casos de lectura en inglés (B13, 5.3 del plan de B13). Los médicos
// eligen los temas o los artículos, el script baja el texto, lee la licencia de los metadatos, descarta lo
// que no está en la lista aceptada (passageSource.ts) y escribe Studiare-ingles-textos.xlsx con un renglón
// por pregunta por escribir. Los renglones salen con Rama, Subespecialidad, Subtema, Idioma, Caso, Orden,
// el texto en el Orden 1 y su fuente, licencia y enlace ya llenos. La pregunta, las opciones, los sesgos, las
// justificaciones y la explicación quedan vacíos para que los escriban los médicos.
//
// No escribe preguntas, no resume y no traduce. Copia el texto tal cual con su fuente, sin IA. Nunca sube
// nada ni cambia el Sheet. Un texto sin licencia, con una licencia que no permite el uso comercial
// (CC BY-NC o CC BY-ND), sin resumen o de más de 8,000 caracteres no entra, y el script dice por qué.
//
// Fuentes (5.2 del plan de B13)
//   - Temas de MedlinePlus, de dominio público. Salen del mismo XML de temas de salud que usa el vocabulario
//     (https://medlineplus.gov/xml.html, que se baja a mano), con el atributo --medlineplus
//   - Resúmenes de artículos del subconjunto de acceso abierto de PubMed Central. La licencia se lee de los
//     metadatos del propio artículo, nunca se supone, y se guarda el enlace exacto. Se piden por el servicio
//     E-utilities de NLM, uno de los que PubMed Central aprueba para el acceso automático, o se leen de una
//     carpeta con --pmc-dir (un archivo PMC<número>.xml por artículo)
//
// El archivo de entrada es content-drafts/ingles/textos.json, con la lista que eligen los médicos
//   { "texts": [ { "source": "medlineplus", "id": "2846", "subtopic": "english_pediatrics", "questions": 3 },
//                { "source": "pmc", "id": "PMC1234567", "subtopic": "english_internal_medicine" } ] }
// Uso: npm run english:passages -- [--list ruta/textos.json] [--medlineplus temas.xml] [--pmc-dir carpeta]
//                                  [--out ruta/salida.xlsx] [--first-case 1] [--case-prefix EN-C]
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { JSDOM } from 'jsdom';
import {
  LICENSE_LABELS,
  composePassageSource,
  parsePassageSource,
} from '../../src/data/content/passageSource.ts';
import type { PassageLicense } from '../../src/data/content/passageSource.ts';
import { addListsSheet } from './bank-sheet-lists.ts';
import {
  DRAFT_STATE_LABEL,
  HEADERS,
  LANGUAGE_LABELS,
  OPTION_LETTERS,
  SHEET_HEADERS,
  TEXT_LIMITS,
  loadTaxonomies,
  optionHeaders,
  type ContentTaxonomies,
} from './bankColumns.ts';
import { parseTopicsXml, plainText, type MplusTopic } from './english-vocabulary.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** La rama de Inglés médico y el tema de sus casos de lectura en la taxonomía */
const ENGLISH_BRANCH = 'medical_english';
const READING_TOPIC = 'reading_comprehension';
/** Preguntas por texto si la lista no dice. Los casos del ENARM traen dos o tres (ENGLISH_CASE_SIZES) */
const DEFAULT_QUESTIONS = 3;
const MAX_QUESTIONS = 5;

export type PassageSourceKind = 'medlineplus' | 'pmc';

/** Un texto que eligieron los médicos */
export interface PassageRequest {
  source: PassageSourceKind;
  /** El id del tema de MedlinePlus o el PMCID del artículo */
  id: string;
  /** La clave del subtema de Comprensión de lectura, la rama clínica del texto, como english_pediatrics */
  subtopic: string;
  /** Cuántas preguntas se escriben sobre el texto, de 1 a 5. Por omisión 3 */
  questions: number;
}

/** Un texto listo para el Sheet, con su fuente y su licencia ya leídas */
export interface PreparedPassage {
  request: PassageRequest;
  /** El título del texto, sin la fuente */
  title: string;
  /** El texto tal cual, en párrafos */
  text: string;
  license: PassageLicense;
  /** El título de la fuente tal como va en la columna Fuente del texto */
  sourceTitle: string;
  url: string;
}

export type PassageProblemCode =
  | 'invalid_entry'
  | 'unknown_subtopic'
  | 'not_found'
  | 'no_text'
  | 'text_too_long'
  | 'no_license'
  | 'license_not_allowed'
  | 'source_invalid'
  | 'unavailable';

export interface PassageProblem {
  request: Pick<PassageRequest, 'source' | 'id'> | null;
  code: PassageProblemCode;
  message: string;
}

// ===================================================================== La lista de los médicos
/** Valida la lista y devuelve lo que sirve y lo que no, sin lanzar por una entrada mala */
export function parseRequestList(raw: unknown): {
  requests: PassageRequest[];
  problems: PassageProblem[];
} {
  const requests: PassageRequest[] = [];
  const problems: PassageProblem[] = [];
  const invalid = (message: string): void => {
    problems.push({ request: null, code: 'invalid_entry', message });
  };
  const list = (raw as { texts?: unknown } | null)?.texts;
  if (!Array.isArray(list)) {
    invalid('La lista tiene que ser un objeto con la clave texts y un arreglo de textos.');
    return { requests, problems };
  }
  const seen = new Set<string>();
  list.forEach((entry: unknown, index) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    const where = `Texto ${index + 1}`;
    const source = item.source;
    const id =
      typeof item.id === 'string'
        ? item.id.trim()
        : typeof item.id === 'number'
          ? String(item.id)
          : '';
    const subtopic = typeof item.subtopic === 'string' ? item.subtopic.trim() : '';
    if (source !== 'medlineplus' && source !== 'pmc') {
      invalid(`${where}. La fuente tiene que ser medlineplus o pmc.`);
      return;
    }
    if (
      id === '' ||
      (source === 'medlineplus' && !/^\d+$/.test(id)) ||
      (source === 'pmc' && !/^(?:PMC)?\d+$/i.test(id))
    ) {
      invalid(
        `${where}. El id ${id === '' ? 'falta' : `${id} no es válido`}. Usa el número del tema de MedlinePlus o el PMCID, como PMC1234567.`,
      );
      return;
    }
    const questions = item.questions === undefined ? DEFAULT_QUESTIONS : Number(item.questions);
    if (!Number.isInteger(questions) || questions < 1 || questions > MAX_QUESTIONS) {
      invalid(`${where}. Las preguntas van de 1 a ${MAX_QUESTIONS}.`);
      return;
    }
    const normalizedId = source === 'pmc' ? `PMC${id.replace(/^PMC/i, '')}` : id;
    const key = `${source}:${normalizedId}`;
    if (seen.has(key)) {
      invalid(`${where}. ${normalizedId} está repetido en la lista.`);
      return;
    }
    seen.add(key);
    requests.push({ source, id: normalizedId, subtopic, questions });
  });
  return { requests, problems };
}

// ===================================================================== MedlinePlus
/** Convierte el resumen en HTML de un tema en texto plano, con párrafos y listas con guion */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<\s*\/\s*(?:p|div|h[1-6]|ul|ol|table|tr|blockquote)\s*>/gi, '\n\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n');
  const lines = plainTextLines(withBreaks);
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texto plano que conserva los saltos de línea. plainText los junta, aquí se conservan */
function plainTextLines(text: string): string[] {
  return text.split('\n').map((line) => plainText(line));
}

/** El texto de un tema de MedlinePlus. Si el tema no está o no trae resumen, dice por qué */
export function medlineplusPassage(
  topics: readonly MplusTopic[],
  request: PassageRequest,
): PreparedPassage | PassageProblem {
  const topic = topics.find(
    (item) => item.id === request.id && !item.language.toLowerCase().startsWith('spanish'),
  );
  const ref = { source: request.source, id: request.id } as const;
  if (!topic)
    return {
      request: ref,
      code: 'not_found',
      message: `El tema ${request.id} no está en el archivo de MedlinePlus.`,
    };
  const text = htmlToText(topic.summaryHtml ?? '');
  if (text === '')
    return {
      request: ref,
      code: 'no_text',
      message: `El tema ${request.id} (${topic.title}) no trae resumen.`,
    };
  return {
    request,
    title: topic.title,
    text,
    // Los resúmenes de los temas son de dominio público y NLM pide decir que vienen de MedlinePlus.gov
    license: 'public_domain',
    sourceTitle: `${topic.title}, MedlinePlus.gov (NLM)`,
    url: topic.url,
  };
}

// ===================================================================== PubMed Central
/** La licencia aceptada que dice una dirección de Creative Commons. null si no hay dirección */
export function licenseFromCreativeCommons(url: string): PassageLicense | 'not_allowed' | null {
  const text = url.trim();
  if (text === '') return null;
  const match =
    /^https?:\/\/(?:www\.)?creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)(?:\/|$)/i.exec(
      text,
    );
  if (!match) return 'not_allowed';
  const kind = (match[2] ?? '').toLowerCase();
  if (match[1]?.toLowerCase() === 'publicdomain') {
    if (kind === 'zero') return 'cc0';
    return kind === 'mark' ? 'public_domain' : 'not_allowed';
  }
  if (kind === 'by') return 'cc_by';
  return kind === 'by-sa' ? 'cc_by_sa' : 'not_allowed';
}

const textOf = (element: Element | null | undefined): string =>
  plainText(element?.textContent ?? '');

function firstByTag(root: ParentNode, name: string): Element | undefined {
  return Array.from((root as Element).getElementsByTagName(name))[0];
}

/** El atributo href de un elemento, con o sin el prefijo xlink */
function hrefOf(element: Element): string {
  const attribute = Array.from(element.attributes).find(
    (item) => item.localName === 'href' || item.name === 'xlink:href',
  );
  return attribute?.value.trim() ?? '';
}

/** La dirección de la licencia en los metadatos de un artículo, o '' si no la trae */
function licenseUrlOf(article: Element): string {
  const permissions = firstByTag(article, 'permissions');
  if (!permissions) return '';
  for (const license of Array.from(permissions.getElementsByTagName('license'))) {
    const href = hrefOf(license);
    if (href !== '') return href;
    const reference = Array.from(license.getElementsByTagName('*')).find(
      (child) => child.localName === 'license_ref',
    );
    if (reference && textOf(reference) !== '') return textOf(reference);
    const inText = /https?:\/\/(?:www\.)?creativecommons\.org\/[^\s<"')]+/i.exec(
      license.textContent,
    );
    if (inText) return inText[0];
  }
  return '';
}

/** El resumen del artículo en párrafos, con el título de cada sección en su propia línea */
function abstractText(abstract: Element): string {
  const lines: string[] = [];
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (child.tagName === 'title') lines.push(textOf(child));
      else if (child.tagName === 'p') lines.push(textOf(child));
      else if (child.tagName === 'sec') walk(child);
    }
  };
  walk(abstract);
  return lines.filter((line) => line !== '').join('\n\n');
}

function authorsOf(article: Element): string {
  const names = Array.from(article.getElementsByTagName('contrib'))
    .filter((item) => (item.getAttribute('contrib-type') ?? 'author') === 'author')
    .map((item) => {
      const surname = textOf(firstByTag(item, 'surname'));
      const given = textOf(firstByTag(item, 'given-names'));
      return surname === '' ? '' : given === '' ? surname : `${surname} ${given.charAt(0)}`;
    })
    .filter((name) => name !== '');
  const [first] = names;
  if (first === undefined) return '';
  return names.length > 1 ? `${first} et al.` : first;
}

/** Junta autores, título y revista como una cita, con un punto entre las partes que no lo traen */
export function citation(parts: readonly string[]): string {
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part !== '')
    .reduce((joined, part) => {
      if (joined === '') return part;
      return /[.?!]$/.test(joined) ? `${joined} ${part}` : `${joined}. ${part}`;
    }, '');
}

/**
 * El texto de un artículo de PubMed Central a partir de su XML. Lee la licencia del propio artículo.
 * Si el artículo no sirve, dice por qué
 */
export function pmcPassage(
  xml: string | null,
  request: PassageRequest,
): PreparedPassage | PassageProblem {
  const ref = { source: request.source, id: request.id } as const;
  if (xml === null)
    return {
      request: ref,
      code: 'not_found',
      message: `No encontré el artículo ${request.id}.`,
    };
  let article: Element | undefined;
  try {
    article = firstByTag(new JSDOM(xml, { contentType: 'text/xml' }).window.document, 'article');
  } catch {
    article = undefined;
  }
  if (!article)
    return {
      request: ref,
      code: 'not_found',
      message: `El archivo de ${request.id} no es un artículo en XML.`,
    };
  const title = textOf(firstByTag(article, 'article-title'));
  const abstract = Array.from(article.getElementsByTagName('abstract')).find(
    (item) => item.getAttribute('abstract-type') === null,
  );
  const text = abstract ? abstractText(abstract) : '';
  if (text === '')
    return {
      request: ref,
      code: 'no_text',
      message: `El artículo ${request.id} no trae resumen.`,
    };
  const licenseUrl = licenseUrlOf(article);
  const license = licenseFromCreativeCommons(licenseUrl);
  if (license === null)
    return {
      request: ref,
      code: 'no_license',
      message: `El artículo ${request.id} no dice su licencia en sus metadatos. No se supone ninguna.`,
    };
  if (license === 'not_allowed')
    return {
      request: ref,
      code: 'license_not_allowed',
      message: `El artículo ${request.id} tiene la licencia ${licenseUrl}, que no permite el uso comercial o no está en la lista aceptada.`,
    };
  const number = request.id.replace(/^PMC/i, '');
  const journal = textOf(firstByTag(article, 'journal-title'));
  const authors = authorsOf(article);
  const sourceTitle = citation([authors, title, journal === '' ? '' : `${journal} (PMC${number})`]);
  return {
    request,
    title,
    text,
    license,
    sourceTitle: sourceTitle === '' ? `PMC${number}` : sourceTitle,
    url: `https://pmc.ncbi.nlm.nih.gov/articles/PMC${number}/`,
  };
}

// ===================================================================== Preparar todo
export interface PassageSources {
  /** Los temas de MedlinePlus con su resumen. Sin ellos, los temas de MedlinePlus de la lista no entran */
  medlineplus: readonly MplusTopic[] | null;
  /** El XML del artículo de PubMed Central, o null si no se encontró. Lanza si no se puede leer */
  pmc: (pmcid: string) => Promise<string | null>;
}

export async function preparePassages(
  requests: readonly PassageRequest[],
  sources: PassageSources,
  data: ContentTaxonomies,
): Promise<{ passages: PreparedPassage[]; problems: PassageProblem[] }> {
  const passages: PreparedPassage[] = [];
  const problems: PassageProblem[] = [];
  const subtopics = new Set(
    data.branches
      .find((branch) => branch.key === ENGLISH_BRANCH)
      ?.topics.find((topic) => topic.key === READING_TOPIC)
      ?.subtopics.map((subtopic) => subtopic.key) ?? [],
  );
  for (const request of requests) {
    const ref = { source: request.source, id: request.id } as const;
    if (!subtopics.has(request.subtopic)) {
      problems.push({
        request: ref,
        code: 'unknown_subtopic',
        message: `${request.id}. El subtema ${request.subtopic === '' ? '(vacío)' : request.subtopic} no es de Comprensión de lectura. Usa uno como english_pediatrics.`,
      });
      continue;
    }
    let result: PreparedPassage | PassageProblem;
    if (request.source === 'medlineplus') {
      result = sources.medlineplus
        ? medlineplusPassage(sources.medlineplus, request)
        : {
            request: ref,
            code: 'unavailable',
            message: `${request.id}. Falta el archivo de MedlinePlus. Bájalo a mano de https://medlineplus.gov/xml.html y pásalo con --medlineplus.`,
          };
    } else {
      try {
        result = pmcPassage(await sources.pmc(request.id), request);
      } catch (error) {
        result = {
          request: ref,
          code: 'unavailable',
          message: `${request.id}. ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    if (!('text' in result)) {
      problems.push(result);
      continue;
    }
    if (result.text.length > TEXT_LIMITS.vignette) {
      problems.push({
        request: ref,
        code: 'text_too_long',
        message: `${request.id} (${result.title}). El texto mide ${result.text.length} caracteres y el banco acepta ${TEXT_LIMITS.vignette}. Elige un texto más corto, porque no se recorta.`,
      });
      continue;
    }
    // La fuente tiene que caber en una referencia y leerse bien con la misma función que usa el servidor
    const reference = composePassageSource({
      title: result.sourceTitle,
      license: LICENSE_LABELS[result.license],
      url: result.url,
    });
    const parsed = parsePassageSource([{ title: reference ?? '' }]);
    if (!parsed.ok || (reference ?? '').length > TEXT_LIMITS.reference) {
      problems.push({
        request: ref,
        code: 'source_invalid',
        message: `${request.id} (${result.title}). La fuente no cabe o no se lee bien. Revisa su enlace y su título.`,
      });
      continue;
    }
    passages.push(result);
  }
  return { passages, problems };
}

// ===================================================================== El Sheet
export interface SheetOptions {
  casePrefix?: string;
  firstCase?: number;
}

/** Los encabezados de la hoja Preguntas, los mismos que lee el convertidor del Sheet */
export function sheetHeaders(): string[] {
  return [
    HEADERS.id,
    HEADERS.branch,
    HEADERS.topic,
    HEADERS.subtopic,
    HEADERS.difficulty,
    HEADERS.kind,
    HEADERS.task,
    HEADERS.polarity,
    SHEET_HEADERS.caseKey,
    SHEET_HEADERS.caseOrder,
    HEADERS.vignette,
    HEADERS.prompt,
    HEADERS.correct,
    ...OPTION_LETTERS.slice(0, 6).flatMap((letter) => {
      const names = optionHeaders(letter);
      return [names.text, names.rationale, names.bias];
    }),
    HEADERS.canonical,
    HEADERS.explanation,
    HEADERS.refs,
    HEADERS.status,
    SHEET_HEADERS.author,
    SHEET_HEADERS.reviewer,
    SHEET_HEADERS.language,
    SHEET_HEADERS.passageSource,
    SHEET_HEADERS.passageLicense,
    SHEET_HEADERS.passageUrl,
  ];
}

/**
 * Un renglón por pregunta por escribir. El texto, la fuente, la licencia y el enlace van solo en el Orden 1 y
 * los demás renglones del caso los heredan. Un texto con una sola pregunta va como pregunta suelta, sin Caso
 */
export function sheetRows(
  passages: readonly PreparedPassage[],
  data: ContentTaxonomies,
  options: SheetOptions = {},
): string[][] {
  const headers = sheetHeaders();
  const branch = data.branches.find((item) => item.key === ENGLISH_BRANCH);
  const topic = branch?.topics.find((item) => item.key === READING_TOPIC);
  const rows: string[][] = [];
  let caseNumber = options.firstCase ?? 1;
  for (const passage of passages) {
    const subtopic = topic?.subtopics.find((item) => item.key === passage.request.subtopic);
    const caseKey = `${options.casePrefix ?? 'EN-C'}${String(caseNumber).padStart(3, '0')}`;
    if (passage.request.questions > 1) caseNumber += 1;
    for (let order = 1; order <= passage.request.questions; order += 1) {
      const first = order === 1;
      const cells: Record<string, string> = {
        [HEADERS.branch]: branch?.name ?? '',
        [HEADERS.topic]: topic?.name ?? '',
        [HEADERS.subtopic]: subtopic?.name ?? '',
        [SHEET_HEADERS.caseKey]: passage.request.questions > 1 ? caseKey : '',
        [SHEET_HEADERS.caseOrder]: passage.request.questions > 1 ? String(order) : '',
        [HEADERS.vignette]: first ? passage.text : '',
        [HEADERS.status]: DRAFT_STATE_LABEL,
        [SHEET_HEADERS.language]: LANGUAGE_LABELS.en,
        [SHEET_HEADERS.passageSource]: first ? passage.sourceTitle : '',
        [SHEET_HEADERS.passageLicense]: first ? LICENSE_LABELS[passage.license] : '',
        [SHEET_HEADERS.passageUrl]: first ? passage.url : '',
      };
      rows.push(headers.map((header) => cells[header] ?? ''));
    }
  }
  return rows;
}

const HEADER_FILL = 'FF0E5A6B';
const FILLED_FILL = 'FFE7F1F3';

export function buildPassagesWorkbook(
  passages: readonly PreparedPassage[],
  data: ContentTaxonomies,
  options: SheetOptions = {},
): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  book.creator = 'Studiare';
  const intro = book.addWorksheet('Instrucciones');
  intro.columns = [{ width: 110 }];
  for (const line of [
    'Textos con licencia para los casos de lectura en inglés',
    'Cada renglón es una pregunta por escribir. Copia los renglones que quieras a la pestaña Preguntas del Sheet del banco.',
    'Ya vienen llenos la rama, la subespecialidad, el subtema, el idioma, el caso y su orden, el texto y su fuente, su licencia y su enlace. No los cambies.',
    'Falta el ID de cada pregunta, que se escribe a mano con la forma de siempre, la dificultad y todo lo de la pregunta.',
    'La pregunta y las opciones van en inglés. La justificación de cada opción y la explicación van en español. Cada distractor lleva un sesgo de la lista.',
    'El texto está copiado sin cambios de su fuente. No lo resumas ni lo traduzcas. Si una frase del texto no sirve, elige otro texto.',
    'Estas columnas no escriben ninguna pregunta por ti. Las preguntas y su revisión son de los médicos.',
    'Las instrucciones del Sheet están en docs/SHEET_DEL_BANCO.md y las de los casos de lectura en docs/INGLES_MEDICO.md.',
  ])
    intro.addRow([line]);
  intro.getRow(1).font = { bold: true, size: 14 };

  const sheet = book.addWorksheet('Preguntas');
  const headers = sheetHeaders();
  sheet.addRow(headers);
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });
  const filledColumns = new Set<number>(
    [HEADERS.branch, HEADERS.topic, HEADERS.subtopic, SHEET_HEADERS.language].map(
      (name) => headers.indexOf(name) + 1,
    ),
  );
  for (const row of sheetRows(passages, data, options)) {
    const added = sheet.addRow(row);
    for (const column of filledColumns)
      added.getCell(column).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: FILLED_FILL },
      };
  }
  headers.forEach((name, index) => {
    const long = /Caso clínico|Pregunta|Opción|Justificación|Explicación|Referencias|Fuente/.test(
      name,
    );
    sheet.getColumn(index + 1).width = long ? 40 : 16;
    if (long) sheet.getColumn(index + 1).alignment = { vertical: 'top', wrapText: true };
  });
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  addListsSheet(book, data);
  return book;
}

// ===================================================================== Línea de comandos
const HELP = `Textos con licencia para los casos de lectura en inglés

Uso, npm run english:passages -- [opciones]
Opciones
  --list <ruta>        La lista de los médicos, por omisión content-drafts/ingles/textos.json
  --medlineplus <ruta> El XML de temas de salud de MedlinePlus, para los textos de MedlinePlus
  --pmc-dir <carpeta>  Una carpeta con un archivo PMC<número>.xml por artículo, en lugar de pedirlos por red
  --out <ruta>         Dónde escribir el Excel, por omisión content-drafts/ingles/Studiare-ingles-textos.xlsx
  --first-case <n>     Número del primer caso, por omisión 1
  --case-prefix <txt>  Prefijo de la clave de cada caso, por omisión EN-C
`;

const EXAMPLE_LIST = `{
  "texts": [
    { "source": "medlineplus", "id": "2846", "subtopic": "english_pediatrics", "questions": 3 },
    { "source": "pmc", "id": "PMC1234567", "subtopic": "english_internal_medicine", "questions": 2 }
  ]
}`;

const NETWORK_HOSTS = [
  'medlineplus.gov',
  'www.ncbi.nlm.nih.gov',
  'pmc.ncbi.nlm.nih.gov',
  'eutils.ncbi.nlm.nih.gov',
];

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

/** Pide el XML de un artículo a E-utilities. Si la red no abre, dice cómo bajarlo a mano */
async function fetchPmc(pmcid: string): Promise<string | null> {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${encodeURIComponent(pmcid)}&retmode=xml`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error(
      `No pude abrir eutils.ncbi.nlm.nih.gov. Agrega ${NETWORK_HOSTS.join(', ')} a los dominios permitidos de la sesión, o baja el XML a mano de ${url} y guárdalo como ${pmcid}.xml en una carpeta para pasarla con --pmc-dir.`,
    );
  }
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`eutils.ncbi.nlm.nih.gov contestó ${response.status} al pedir ${pmcid}.`);
  return response.text();
}

export async function main(args: string[]): Promise<number> {
  if (args.includes('--ayuda') || args.includes('--help')) {
    console.log(HELP);
    return 0;
  }
  const listPath = resolve(
    option(args, '--list') ?? resolve(ROOT, 'content-drafts/ingles/textos.json'),
  );
  if (!existsSync(listPath)) {
    console.log(
      `No encontré la lista de textos en ${listPath}.\nLos médicos la escriben con esta forma y la guardan en content-drafts/ingles/textos.json.\n${EXAMPLE_LIST}`,
    );
    return 2;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(listPath, 'utf8'));
  } catch {
    console.error(`La lista ${listPath} no es un JSON válido.`);
    return 1;
  }
  const { requests, problems: listProblems } = parseRequestList(raw);
  const medlineplusPath = option(args, '--medlineplus');
  if (medlineplusPath !== undefined && !existsSync(resolve(medlineplusPath))) {
    console.log(
      `No existe ${medlineplusPath}. Bájalo a mano de https://medlineplus.gov/xml.html, porque esta sesión no abre medlineplus.gov.`,
    );
    return 2;
  }
  const pmcDir = option(args, '--pmc-dir');
  const sources: PassageSources = {
    medlineplus:
      medlineplusPath === undefined
        ? null
        : parseTopicsXml(readFileSync(resolve(medlineplusPath), 'utf8'), { summaries: true }),
    pmc: (pmcid) => {
      if (pmcDir === undefined) return fetchPmc(pmcid);
      const file = join(resolve(pmcDir), `${pmcid}.xml`);
      return Promise.resolve(existsSync(file) ? readFileSync(file, 'utf8') : null);
    },
  };
  const data = loadTaxonomies(ROOT);
  const { passages, problems } = await preparePassages(requests, sources, data);
  for (const problem of [...listProblems, ...problems]) console.log(`No entra. ${problem.message}`);
  if (passages.length === 0) {
    console.error('No quedó ningún texto para escribir preguntas.');
    return 1;
  }
  const out = resolve(
    option(args, '--out') ?? resolve(ROOT, 'content-drafts/ingles/Studiare-ingles-textos.xlsx'),
  );
  mkdirSync(dirname(out), { recursive: true });
  const firstCase = Number(option(args, '--first-case') ?? '1');
  await buildPassagesWorkbook(passages, data, {
    casePrefix: option(args, '--case-prefix') ?? 'EN-C',
    firstCase: Number.isInteger(firstCase) && firstCase > 0 ? firstCase : 1,
  }).xlsx.writeFile(out);
  const questions = passages.reduce((sum, passage) => sum + passage.request.questions, 0);
  console.log(
    `${passages.length} textos y ${questions} renglones por escribir en ${out}. No lo subas al repo`,
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}
