// Mazo de vocabulario médico en inglés con los temas de salud de MedlinePlus (B13, sección 4 del plan de
// B13). MedlinePlus es de la Biblioteca Nacional de Medicina de EE. UU. (NLM). Cada tema de salud trae su
// nombre en inglés, su par en español, sus otros nombres y su grupo, y NLM pide decir que viene de
// MedlinePlus.gov. No usa IA y no traduce nada. El par en español es el que publica NLM.
//
// Lee el XML de temas de salud que se baja a mano de https://medlineplus.gov/xml.html (hasta ahora la
// red de las sesiones no abre ese sitio) y escribe
//   - src/demo/content/decks/vocabulario-ingles.json, el mazo de la demo con DemoDeckFileSchema. Una nota
//     por tema con el id estable mplus-<id del tema>, así una versión nueva del archivo conserva los repasos
//   - content-drafts/ingles/Vocabulario-ingles.apkg, el paquete que Ricardo sube en Administración,
//     Catálogo de mazos, con la nota Dominio público, MedlinePlus.gov. No lo subas al repo
// Nunca sube nada ni abre la red. Solo lee archivos de la carpeta que le dices.
//
// Cada nota es solo de inglés a español, porque el ENARM pide leer en inglés y no escribir. Al frente va el
// nombre en inglés con lang="en". Atrás, el nombre en español, los otros nombres y Fuente MedlinePlus.gov.
// El submazo es el grupo de MedlinePlus en español, y si el archivo no trae el nombre de un grupo en
// español, se usa el de inglés y se avisa. Un tema sin par en español no entra.
//
// Uso: npm run english:vocabulary -- ruta/al/archivo.xml [otro-archivo-en-español.xml]
//      Opciones. --json <ruta>  --apkg <ruta>  --sin-json  --sin-apkg
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { JSDOM } from 'jsdom';
import * as prettier from 'prettier';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { sanitizeTag } from '../../src/engines/tagPath.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');

/** Los datos del mazo. La clave es la del archivo y la que lleva el mazo al subirlo al catálogo */
export const VOCABULARY_DECK = {
  key: 'vocabulario-ingles',
  name: 'Vocabulario médico en inglés',
  author: 'MedlinePlus.gov (NLM)',
  description:
    'Temas de salud de MedlinePlus.gov, de la Biblioteca Nacional de Medicina de EE. UU. (NLM), con su nombre en inglés y en español. Información de dominio público. Pendiente de revisión médica.',
  branch: 'medical_english',
  topic: 'medical_vocabulary',
  /** Primer nivel de la etiqueta de cada nota, que es el nombre de la rama */
  rootTag: 'Inglés médico',
  /** Submazo de los temas que no traen grupo */
  noGroup: 'Otros temas',
  source: 'Fuente MedlinePlus.gov (NLM)',
} as const;

/** Cómo se avisa un archivo que no sirve. El código dice qué pasó, el mensaje es para Ricardo */
export class VocabularyError extends Error {
  readonly code: 'not_xml' | 'no_topics';
  constructor(code: VocabularyError['code'], message: string) {
    super(message);
    this.name = 'VocabularyError';
    this.code = code;
  }
}

// ===================================================================== Leer el XML
export interface MplusGroup {
  id: string;
  /** El último pedazo de la dirección, sin extensión. Une el grupo en inglés con el de español */
  slug: string;
  name: string;
}

export interface MplusTopic {
  id: string;
  /** English o Spanish. Sin el atributo, English */
  language: string;
  title: string;
  url: string;
  alsoCalled: string[];
  groups: MplusGroup[];
  /** El mismo tema en el otro idioma, como lo declara el archivo */
  mapped: { id: string; language: string; title: string }[];
  /** El resumen del tema, en HTML tal como viene. Solo si se pidió, porque pesa y el vocabulario no lo usa */
  summaryHtml?: string;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decodifica entidades de HTML que quedan en el texto, como &amp;, &#39; y &#x27; */
function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (match: string, dec?: string, hex?: string, name?: string) => {
      if (dec !== undefined) return String.fromCodePoint(Number(dec));
      if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
      return NAMED_ENTITIES[(name ?? '').toLowerCase()] ?? match;
    },
  );
}

/** Texto plano. Sin etiquetas, con las entidades decodificadas y con los espacios simples */
export function plainText(text: string): string {
  return decodeEntities(decodeEntities(text.replace(/<[^>]*>/g, ' ')))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugOf(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    return last.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  } catch {
    return '';
  }
}

const childrenNamed = (parent: Element, name: string): Element[] =>
  Array.from(parent.children).filter((child) => child.tagName === name);

/**
 * Los temas de salud de un XML de MedlinePlus, en el orden del archivo. Lanza VocabularyError si no sirve.
 * Con summaries trae también el resumen de cada tema, que usa el script de textos con licencia
 */
export function parseTopicsXml(xml: string, options: { summaries?: boolean } = {}): MplusTopic[] {
  let document: Document;
  try {
    document = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  } catch {
    throw new VocabularyError('not_xml', 'El archivo no es un XML válido.');
  }
  const elements = Array.from(document.getElementsByTagName('health-topic'));
  if (elements.length === 0) {
    throw new VocabularyError(
      'no_topics',
      'El archivo no trae temas de salud (health-topic). Revisa que sea el XML de temas de salud de MedlinePlus.',
    );
  }
  return elements.map((element): MplusTopic => {
    const url = element.getAttribute('url') ?? '';
    return {
      id: (element.getAttribute('id') ?? '').trim(),
      language: (element.getAttribute('language') ?? 'English').trim() || 'English',
      title: plainText(element.getAttribute('title') ?? ''),
      url,
      alsoCalled: childrenNamed(element, 'also-called')
        .map((item) => plainText(item.textContent))
        .filter((name) => name !== ''),
      groups: childrenNamed(element, 'group').map((group) => ({
        id: (group.getAttribute('id') ?? '').trim(),
        slug: slugOf(group.getAttribute('url') ?? ''),
        name: plainText(group.textContent),
      })),
      mapped: childrenNamed(element, 'language-mapped-topic').map((item) => ({
        id: (item.getAttribute('id') ?? '').trim(),
        language: (item.getAttribute('language') ?? '').trim(),
        title: plainText(item.getAttribute('title') ?? item.textContent),
      })),
      ...(options.summaries
        ? { summaryHtml: childrenNamed(element, 'full-summary')[0]?.textContent ?? '' }
        : {}),
    };
  });
}

// ===================================================================== Armar las notas
export interface VocabularyNote {
  /** El id del tema de MedlinePlus */
  id: string;
  english: string;
  spanish: string;
  otherEnglish: string[];
  otherSpanish: string[];
  /** El nombre del grupo, que es el submazo */
  group: string;
}

export interface VocabularyReport {
  /** Temas en inglés que trae el archivo, sin contar los repetidos */
  englishTopics: number;
  notes: number;
  /** Sin par en español, que no entran */
  withoutSpanishPair: number;
  duplicates: number;
  emptyTitles: number;
  noGroup: number;
  /** Nombres de grupo que no se encontraron en español y quedaron en inglés */
  groupsWithoutSpanishName: string[];
  /** Notas cuyo nombre en español es igual que el de inglés, como los nombres propios */
  sameInBothLanguages: number;
  groups: number;
}

const isSpanish = (language: string) => language.trim().toLowerCase().startsWith('spanish');

/** El primer texto que no viene vacío */
const firstFilled = (...values: (string | undefined)[]): string =>
  values.find((value) => value !== undefined && value !== '') ?? '';

/** Une cada tema en inglés con su par en español y su grupo. Sin pares no hay nota */
export function buildVocabulary(topics: readonly MplusTopic[]): {
  notes: VocabularyNote[];
  report: VocabularyReport;
} {
  const english = topics.filter((topic) => !isSpanish(topic.language));
  const spanish = topics.filter((topic) => isSpanish(topic.language));
  const spanishById = new Map<string, MplusTopic>();
  const spanishByEnglishId = new Map<string, MplusTopic>();
  const groupBySlug = new Map<string, string>();
  const groupById = new Map<string, string>();
  for (const topic of spanish) {
    if (topic.id !== '' && !spanishById.has(topic.id)) spanishById.set(topic.id, topic);
    for (const link of topic.mapped)
      if (!isSpanish(link.language) && link.id !== '' && !spanishByEnglishId.has(link.id))
        spanishByEnglishId.set(link.id, topic);
    for (const group of topic.groups) {
      if (group.name === '') continue;
      if (group.slug !== '' && !groupBySlug.has(group.slug))
        groupBySlug.set(group.slug, group.name);
      if (group.id !== '' && !groupById.has(group.id)) groupById.set(group.id, group.name);
    }
  }

  const report: VocabularyReport = {
    englishTopics: 0,
    notes: 0,
    withoutSpanishPair: 0,
    duplicates: 0,
    emptyTitles: 0,
    noGroup: 0,
    groupsWithoutSpanishName: [],
    sameInBothLanguages: 0,
    groups: 0,
  };
  const seen = new Set<string>();
  const missing = new Set<string>();
  const notes: VocabularyNote[] = [];
  for (const topic of english) {
    if (topic.id === '' || topic.title === '') {
      report.emptyTitles += 1;
      continue;
    }
    if (seen.has(topic.id)) {
      report.duplicates += 1;
      continue;
    }
    seen.add(topic.id);
    report.englishTopics += 1;

    const link = topic.mapped.find((item) => isSpanish(item.language));
    const pair = (link ? spanishById.get(link.id) : undefined) ?? spanishByEnglishId.get(topic.id);
    const spanishTitle = firstFilled(pair?.title, link?.title);
    if (spanishTitle === '') {
      report.withoutSpanishPair += 1;
      continue;
    }

    const first = topic.groups.find((group) => group.name !== '');
    let group: string = VOCABULARY_DECK.noGroup;
    if (first) {
      const inSpanish = groupBySlug.get(first.slug) ?? groupById.get(first.id);
      group = inSpanish ?? first.name;
      if (inSpanish === undefined) missing.add(first.name);
    } else {
      report.noGroup += 1;
    }
    if (spanishTitle.toLowerCase() === topic.title.toLowerCase()) report.sameInBothLanguages += 1;
    notes.push({
      id: topic.id,
      english: topic.title,
      spanish: spanishTitle,
      otherEnglish: [...new Set(topic.alsoCalled)],
      otherSpanish: [...new Set(pair?.alsoCalled ?? [])],
      group,
    });
  }
  // Orden fijo, así el archivo sale igual aunque el XML cambie de orden
  notes.sort(
    (a, b) =>
      a.group.localeCompare(b.group, 'es') ||
      a.english.localeCompare(b.english, 'en') ||
      a.id.localeCompare(b.id),
  );
  report.notes = notes.length;
  report.groups = new Set(notes.map((note) => note.group)).size;
  report.groupsWithoutSpanishName = [...missing].sort();
  return { notes, report };
}

// ===================================================================== Las tarjetas
const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Al frente, el nombre en inglés con lang="en" para que el lector de pantalla lo diga en inglés */
export function frontOf(note: VocabularyNote): string {
  return `<span lang="en">${escapeHtml(note.english)}</span>`;
}

/** Atrás, el nombre en español, los otros nombres y la fuente que pide NLM */
export function backOf(note: VocabularyNote): string {
  const lines = [`<b>${escapeHtml(note.spanish)}</b>`];
  if (note.otherSpanish.length > 0)
    lines.push(`<i>En español también</i> ${escapeHtml(note.otherSpanish.join('; '))}`);
  if (note.otherEnglish.length > 0)
    lines.push(
      `<i>En inglés también</i> <span lang="en">${escapeHtml(note.otherEnglish.join('; '))}</span>`,
    );
  lines.push(`<i>${VOCABULARY_DECK.source}</i>`);
  return lines.join('<br>');
}

/** La etiqueta de origen de una nota, la ruta Inglés_médico::Grupo que forma el submazo */
export function sourceTagOf(note: Pick<VocabularyNote, 'group'>): string {
  return sanitizeTag(`${VOCABULARY_DECK.rootTag}::${note.group}`);
}

export const noteKeyOf = (note: Pick<VocabularyNote, 'id'>) => `mplus-${note.id}`;

// ===================================================================== El mazo de la demo
export interface DeckFileJson {
  version: 1;
  key: string;
  name: string;
  description: string;
  author: string;
  status: 'pending_physician_review';
  media: [];
  notes: {
    kind: 'basic';
    key: string;
    sourceTag: string;
    tags: string[];
    branch: string;
    topic: string;
    front: string;
    back: string;
  }[];
}

/** El archivo del mazo, con la forma de DemoDeckFileSchema. La prueba lo valida con el esquema */
export function buildDeckFile(notes: readonly VocabularyNote[]): DeckFileJson {
  return {
    version: 1,
    key: VOCABULARY_DECK.key,
    name: VOCABULARY_DECK.name,
    description: VOCABULARY_DECK.description,
    author: VOCABULARY_DECK.author,
    status: 'pending_physician_review',
    media: [],
    notes: notes.map((note) => {
      const sourceTag = sourceTagOf(note);
      return {
        kind: 'basic',
        key: noteKeyOf(note),
        sourceTag,
        // La ruta va primero, porque de ahí sale el submazo, y el tema de la taxonomía después
        tags: [sourceTag.slice(0, 80), `topic:${VOCABULARY_DECK.topic}`],
        branch: VOCABULARY_DECK.branch,
        topic: VOCABULARY_DECK.topic,
        front: frontOf(note),
        back: backOf(note),
      };
    }),
  };
}

// ===================================================================== El paquete .apkg
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex');

/** Un paquete de Anki en el formato viejo (collection.anki2), que es el que lee el importador de la app */
export function buildApkg(
  notes: readonly VocabularyNote[],
  sql: SqlJsStatic,
  nowSeconds = 1_790_000_000,
): Uint8Array {
  const db = new sql.Database();
  db.run(
    'create table col (id integer primary key, crt integer not null, mod integer not null, scm integer not null, ver integer not null, dty integer not null, usn integer not null, ls integer not null, conf text not null, models text not null, decks text not null, dconf text not null, tags text not null)',
  );
  db.run(
    'create table notes (id integer primary key, guid text not null, mid integer not null, mod integer not null, usn integer not null, tags text not null, flds text not null, sfld integer not null, csum integer not null, flags integer not null, data text not null)',
  );
  db.run(
    'create table cards (id integer primary key, nid integer not null, did integer not null, ord integer not null, mod integer not null, usn integer not null, type integer not null, queue integer not null, due integer not null, ivl integer not null, factor integer not null, reps integer not null, lapses integer not null, left integer not null, odue integer not null, odid integer not null, flags integer not null, data text not null)',
  );
  db.run(
    'create table revlog (id integer primary key, cid integer not null, usn integer not null, ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null)',
  );
  db.run('create table graves (usn integer not null, oid integer not null, type integer not null)');
  db.run('create index ix_notes_usn on notes (usn)');
  db.run('create index ix_cards_usn on cards (usn)');
  db.run('create index ix_cards_nid on cards (nid)');
  db.run('create index ix_cards_sched on cards (did, queue, due)');
  db.run('create index ix_notes_csum on notes (csum)');

  const modelId = 1_700_000_000_001;
  const parentId = 1_700_000_000_100;
  const groups = [...new Set(notes.map((note) => note.group))];
  const deckIdOf = new Map(groups.map((group, index) => [group, parentId + 1 + index]));
  const deckBase = {
    mod: nowSeconds,
    usn: -1,
    lrnToday: [0, 0],
    revToday: [0, 0],
    newToday: [0, 0],
    timeToday: [0, 0],
    collapsed: false,
    browserCollapsed: false,
    desc: '',
    dyn: 0,
    conf: 1,
    extendNew: 10,
    extendRev: 50,
  };
  const decks: Record<string, unknown> = {
    '1': { ...deckBase, id: 1, name: 'Default' },
    [String(parentId)]: { ...deckBase, id: parentId, name: VOCABULARY_DECK.rootTag },
  };
  for (const [group, id] of deckIdOf)
    decks[String(id)] = { ...deckBase, id, name: `${VOCABULARY_DECK.rootTag}::${group}` };
  const field = (name: string, ord: number) => ({
    name,
    ord,
    sticky: false,
    rtl: false,
    font: 'Arial',
    size: 20,
    media: [],
  });
  const models = {
    [String(modelId)]: {
      id: modelId,
      name: 'Basic',
      type: 0,
      mod: nowSeconds,
      usn: -1,
      sortf: 0,
      did: parentId,
      tags: [],
      vers: [],
      req: [[0, 'all', [0]]],
      css: '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }',
      latexPre:
        '\\documentclass[12pt]{article}\n\\special{papersize=3in,5in}\n\\usepackage[utf8]{inputenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\setlength{\\parindent}{0in}\n\\begin{document}\n',
      latexPost: '\\end{document}',
      latexsvg: false,
      flds: [field('Front', 0), field('Back', 1)],
      tmpls: [
        {
          name: 'Card 1',
          ord: 0,
          qfmt: '{{Front}}',
          afmt: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}',
          bqfmt: '',
          bafmt: '',
          did: null,
          bfont: '',
          bsize: 0,
        },
      ],
    },
  };
  const dconf = {
    '1': {
      id: 1,
      mod: 0,
      name: 'Default',
      usn: 0,
      maxTaken: 60,
      autoplay: true,
      timer: 0,
      replayq: true,
      new: {
        bury: true,
        delays: [1, 10],
        initialFactor: 2500,
        ints: [1, 4, 7],
        order: 1,
        perDay: 20,
        separate: true,
      },
      rev: {
        bury: true,
        ease4: 1.3,
        fuzz: 0.05,
        ivlFct: 1,
        maxIvl: 36500,
        minSpace: 1,
        perDay: 100,
      },
      lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0 },
    },
  };
  const conf = {
    nextPos: notes.length + 1,
    estTimes: true,
    activeDecks: [1],
    sortType: 'noteFld',
    timeLim: 0,
    sortBackwards: false,
    addToCur: true,
    curDeck: 1,
    newBury: true,
    newSpread: 0,
    dueCounts: true,
    curModel: String(modelId),
    collapseTime: 1200,
  };
  db.run('insert into col values (1, ?, ?, ?, 11, 0, 0, 0, ?, ?, ?, ?, ?)', [
    nowSeconds,
    nowSeconds * 1000,
    nowSeconds * 1000,
    JSON.stringify(conf),
    JSON.stringify(models),
    JSON.stringify(decks),
    JSON.stringify(dconf),
    '{}',
  ]);

  notes.forEach((note, index) => {
    const noteId = 1_800_000_000_000 + index;
    const front = frontOf(note);
    const sortField = plainText(front);
    // La etiqueta de ruta primero, porque de ahí sale el submazo del catálogo, y el tema después
    const tags = ` ${sourceTagOf(note)} topic:${VOCABULARY_DECK.topic} `;
    db.run('insert into notes values (?,?,?,?,?,?,?,?,?,?,?)', [
      noteId,
      noteKeyOf(note),
      modelId,
      nowSeconds,
      -1,
      tags,
      `${front}\x1f${backOf(note)}`,
      sortField,
      parseInt(sha1(sortField).slice(0, 8), 16),
      0,
      '',
    ]);
    db.run('insert into cards values (?,?,?,0,?,-1,0,0,?,0,0,0,0,0,0,0,0,?)', [
      1_900_000_000_000 + index,
      noteId,
      deckIdOf.get(note.group) ?? parentId,
      nowSeconds,
      index + 1,
      '',
    ]);
  });
  const collection = db.export();
  db.close();
  return zipSync({ 'collection.anki2': collection, media: strToU8('{}') });
}

// ===================================================================== Línea de comandos
const HELP = `Mazo de vocabulario médico en inglés con los temas de salud de MedlinePlus

Uso, npm run english:vocabulary -- ruta/al/archivo.xml [otro-archivo.xml]
Opciones
  --json <ruta>  Dónde escribir el mazo de la demo, por omisión src/demo/content/decks/vocabulario-ingles.json
  --apkg <ruta>  Dónde escribir el paquete para el catálogo, por omisión content-drafts/ingles/Vocabulario-ingles.apkg
  --sin-json     No escribe el mazo de la demo
  --sin-apkg     No escribe el paquete .apkg
`;

const MISSING = `No encontré el archivo de temas de salud de MedlinePlus.
Bájalo a mano, porque esta sesión no abre medlineplus.gov, y pásalo al comando.
  1. Abre https://medlineplus.gov/xml.html y baja el XML de temas de salud, con los temas en inglés y en español
  2. Si viene en un .zip, descomprímelo
  3. Corre npm run english:vocabulary -- ruta/al/archivo.xml
Si el archivo trae solo los temas en inglés, pasa también el de español, o los grupos quedan en inglés.`;

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function main(args: string[]): Promise<number> {
  if (args.includes('--ayuda') || args.includes('--help')) {
    console.log(HELP);
    return 0;
  }
  const flagValues = new Set(['--json', '--apkg']);
  const inputs = args.filter(
    (arg, index) => !arg.startsWith('--') && !flagValues.has(args[index - 1] ?? ''),
  );
  if (inputs.length === 0 || inputs.some((path) => !existsSync(resolve(path)))) {
    console.log(MISSING);
    if (inputs.length > 0)
      console.log(`\nNo existe ${inputs.find((path) => !existsSync(resolve(path)))}`);
    return 2;
  }
  let topics: MplusTopic[];
  try {
    topics = inputs.flatMap((path) => parseTopicsXml(readFileSync(resolve(path), 'utf8')));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const { notes, report } = buildVocabulary(topics);
  if (notes.length === 0) {
    console.error(
      'No salió ninguna nota. Ningún tema en inglés trae su par en español en este archivo.',
    );
    return 1;
  }
  if (!args.includes('--sin-json')) {
    const target = resolve(
      option(args, '--json') ?? resolve(ROOT, 'src/demo/content/decks/vocabulario-ingles.json'),
    );
    mkdirSync(dirname(target), { recursive: true });
    // Con el formato del repo, para que el archivo pase npm run format:check tal como sale
    const config = (await prettier.resolveConfig(resolve(ROOT, 'package.json'))) ?? {};
    const formatted = await prettier.format(JSON.stringify(buildDeckFile(notes)), {
      ...config,
      filepath: target,
    });
    writeFileSync(target, formatted);
    console.log(`Mazo de la demo en ${target}`);
  }
  if (!args.includes('--sin-apkg')) {
    const target = resolve(
      option(args, '--apkg') ?? resolve(ROOT, 'content-drafts/ingles/Vocabulario-ingles.apkg'),
    );
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buildApkg(notes, await initSqlJs()));
    console.log(`Paquete para el catálogo en ${target}. No lo subas al repo`);
  }
  console.log(
    [
      `Temas en inglés ${report.englishTopics}. Notas ${report.notes} en ${report.groups} grupos.`,
      `Sin par en español ${report.withoutSpanishPair}. Repetidos ${report.duplicates}. Sin título ${report.emptyTitles}. Sin grupo ${report.noGroup}.`,
      `Nombre igual en los dos idiomas ${report.sameInBothLanguages}.`,
    ].join('\n'),
  );
  if (report.groupsWithoutSpanishName.length > 0)
    console.log(
      `Grupos que quedaron en inglés por no traer su nombre en español, ${report.groupsWithoutSpanishName.length}. Pasa también el archivo de temas en español.`,
    );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  process.exitCode = await main(process.argv.slice(2));
}
