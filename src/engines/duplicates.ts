/**
 * Duplicados de tarjetas (fila 9 de D-085).
 *
 * Qué hace. Avisa si una tarjeta que se está escribiendo, o que llega de un importador o de la IA,
 * ya existe. Distingue los duplicados exactos de los casi duplicados.
 * Entradas. La tarjeta candidata y las notas guardadas, con la forma mínima de DuplicateNote para no
 * depender del esquema completo de Note. Las notas con deletedAt no cuentan.
 * Salidas. Un índice que se arma una vez (buildDuplicateIndex) y, por cada consulta, los exactos y
 * los casi iguales con su similitud y una vista previa (findDuplicates).
 * Método
 *   - La clave de duplicado es el texto normalizado del primer campo, frente en las básicas y texto
 *     en las cloze, que es lo que compara Anki. Normalizar quita etiquetas HTML y entidades, pasa a
 *     minúsculas, quita acentos, quita puntuación y colapsa espacios. En cloze deja la respuesta de
 *     cada hueco y quita la pista
 *   - Exacto. Misma clave
 *   - Casi igual. Similitud de Jaccard sobre el conjunto de palabras de la clave, 0.85 o más. Para
 *     no comparar contra todas las notas hay un índice invertido de palabra a notas y un filtro de
 *     prefijo. Si dos conjuntos de n palabras tienen Jaccard de t o más, comparten al menos
 *     ceil(t por n) palabras, así que cualquier coincidencia comparte alguna de las primeras
 *     n menos ceil(t por n) más 1 palabras de la candidata. Se ordenan las palabras de la candidata
 *     de la más rara a la más común y solo se leen los listados de ese prefijo, que son los cortos
 *   - Un signo < o > cambia el sentido clínico (FEVI<40 contra FEVI>40), así que no se borra
 *     sino que se vuelve "menor" o "mayor"
 * Costo. Armar el índice es lineal en las palabras de todas las notas. Con 20,000 notas de 8 a 20
 * palabras son unos 200,000 registros y unos 400 ms, casi todo normalizar el texto. Cada consulta
 * lee los listados de las pocas palabras raras del prefijo y verifica solo a esas candidatas, unos
 * 0.1 ms en promedio y menos de 1 ms como máximo en las pruebas. El peor caso es una candidata hecha
 * solo de palabras comunes, que no tiene palabras raras en el prefijo y tardó unos 15 ms
 * (duplicates.performance.test.ts).
 * La memoria es una lista de palabras únicas por nota más los listados invertidos, que guardan
 * referencias y no copias. Se vuelve a armar el índice cuando cambian las notas, no en cada tecla.
 * Lo que se consulta en cada tecla es solo findDuplicates.
 * Limitaciones conocidas. Quitar la puntuación junta "1.5" con "15" y "anti-inflamatorio" con
 * "antiinflamatorio". Lo segundo es deseable y lo primero es raro, y el aviso nunca bloquea guardar.
 * Umbrales. Similitud 0.85 y 5 coincidencias por tipo, en src/config/cardQuality.ts (J).
 */
import { DEFAULT_CARD_QUALITY } from '@/config/cardQuality';
import { clozeFlatten, htmlToPlain, parseCloze } from './cardText';

export type DuplicateKind = 'basic' | 'basic_reverse' | 'cloze';

/** Lo mínimo que se necesita de una nota para compararla, frente en las básicas y texto en cloze */
export type DuplicateSource =
  { kind: 'basic' | 'basic_reverse'; front: string } | { kind: 'cloze'; text: string };

/** Una nota guardada. Con deletedAt distinto de null ya no cuenta como duplicado */
export type DuplicateNote = DuplicateSource & { id: string; deletedAt?: string | null };

/** La tarjeta que se compara. Si trae id, no se compara contra sí misma */
export type DuplicateCandidate = DuplicateSource & { id?: string };

export interface DuplicateMatch {
  id: string;
  kind: DuplicateKind;
  /** 1 en los exactos */
  similarity: number;
  /** Texto del primer campo sin HTML ni marcas de cloze, recortado, para mostrarlo */
  preview: string;
}

export interface DuplicateResult {
  /** Los primeros maxMatches exactos */
  exact: DuplicateMatch[];
  /** Los primeros maxMatches casi iguales, del más parecido al menos */
  near: DuplicateMatch[];
  totalExact: number;
  totalNear: number;
}

export interface FindDuplicatesOptions {
  /** Entre 0 (sin incluir) y 1. Por defecto el de src/config/cardQuality.ts */
  nearSimilarity?: number;
  maxMatches?: number;
  /** Una nota que se está editando, para no contarla contra sí misma */
  excludeId?: string;
}

interface IndexEntry {
  id: string;
  kind: DuplicateKind;
  /** Posición de la nota en la lista original, para desempatar siempre igual */
  order: number;
  key: string;
  /** Palabras únicas de la clave */
  words: readonly string[];
  /** Primer campo tal como se guardó, para la vista previa */
  source: string;
}

export interface DuplicateIndex {
  /** Notas que cuentan, sin las borradas ni las que no tienen texto */
  readonly size: number;
  /** Clave a notas */
  readonly byKey: ReadonlyMap<string, readonly IndexEntry[]>;
  /** Palabra a notas */
  readonly postings: ReadonlyMap<string, readonly IndexEntry[]>;
}

const PREVIEW_LENGTH = 100;
/** Margen para que 0.85 por 20 no se redondee a 17.000000000000004 y deje fuera una coincidencia */
const EPSILON = 1e-9;

/** El primer campo de una tarjeta, que es lo que se compara */
export function firstField(source: DuplicateSource): string {
  return source.kind === 'cloze' ? source.text : source.front;
}

/**
 * Texto comparable. Sin HTML ni entidades, en minúsculas, sin acentos ni puntuación, con espacios
 * colapsados y, en cloze, con {{cN::x::pista}} convertido en x. Aplicarlo dos veces da lo mismo
 */
export function normalizeForDuplicates(text: string): string {
  const unwrapped = clozeFlatten(parseCloze(text).parts);
  // Las imágenes cuentan por su archivo, como en Anki, y así dos tarjetas con el mismo texto y
  // distinta imagen no se toman por iguales
  return htmlToPlain(unwrapped, { keepImageNames: true })
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replaceAll('<', ' menor ')
    .replaceAll('>', ' mayor ')
    .replace(/\p{P}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave de duplicado de una tarjeta, el texto normalizado de su primer campo */
export function duplicateKey(source: DuplicateSource): string {
  return normalizeForDuplicates(firstField(source));
}

function wordsOf(key: string): string[] {
  return key === '' ? [] : [...new Set(key.split(' '))];
}

/** Arma el índice de las notas guardadas. Las borradas y las sin texto no entran */
export function buildDuplicateIndex(notes: Iterable<DuplicateNote>): DuplicateIndex {
  const byKey = new Map<string, IndexEntry[]>();
  const postings = new Map<string, IndexEntry[]>();
  let size = 0;
  for (const note of notes) {
    if (note.deletedAt) continue;
    const key = duplicateKey(note);
    if (key === '') continue;
    const words = wordsOf(key);
    const entry: IndexEntry = {
      id: note.id,
      kind: note.kind,
      order: size,
      key,
      words,
      source: firstField(note),
    };
    size += 1;
    pushTo(byKey, key, entry);
    for (const word of words) pushTo(postings, word, entry);
  }
  return { size, byKey, postings };
}

function pushTo(map: Map<string, IndexEntry[]>, key: string, entry: IndexEntry): void {
  const list = map.get(key);
  if (list) list.push(entry);
  else map.set(key, [entry]);
}

function preview(source: string): string {
  const plain = htmlToPlain(clozeFlatten(parseCloze(source).parts));
  return plain.length > PREVIEW_LENGTH ? `${plain.slice(0, PREVIEW_LENGTH - 1).trimEnd()}…` : plain;
}

function toMatch(entry: IndexEntry, similarity: number): DuplicateMatch {
  return { id: entry.id, kind: entry.kind, similarity, preview: preview(entry.source) };
}

/** Similitud de Jaccard entre dos conjuntos con la intersección ya contada */
function jaccard(intersection: number, a: number, b: number): number {
  return intersection / (a + b - intersection);
}

/**
 * Busca duplicados exactos y casi duplicados de la candidata en el índice. Sin texto no hay nada
 * que comparar y el resultado sale vacío
 */
export function findDuplicates(
  candidate: DuplicateCandidate,
  index: DuplicateIndex,
  options: FindDuplicatesOptions = {},
): DuplicateResult {
  const threshold = options.nearSimilarity ?? DEFAULT_CARD_QUALITY.duplicates.nearSimilarity;
  const maxMatches = options.maxMatches ?? DEFAULT_CARD_QUALITY.duplicates.maxMatches;
  const selfId = options.excludeId ?? candidate.id;
  const key = duplicateKey(candidate);
  const empty: DuplicateResult = { exact: [], near: [], totalExact: 0, totalNear: 0 };
  if (key === '') return empty;

  const exact = (index.byKey.get(key) ?? []).filter((entry) => entry.id !== selfId);

  // Casi iguales. Solo se leen los listados del prefijo de palabras más raras de la candidata
  const words = wordsOf(key);
  const wordSet = new Set(words);
  const size = words.length;
  const needed = Math.ceil(threshold * size - EPSILON);
  const prefixLength = Math.min(size, Math.max(1, size - needed + 1));
  const rarestFirst = words
    .map((word) => ({ word, frequency: index.postings.get(word)?.length ?? 0 }))
    .sort((a, b) => a.frequency - b.frequency || (a.word < b.word ? -1 : 1))
    .slice(0, prefixLength);
  const smallest = threshold * size - EPSILON;
  const largest = size / threshold + EPSILON;

  const checked = new Set<IndexEntry>();
  const near: { entry: IndexEntry; similarity: number }[] = [];
  for (const { word } of rarestFirst) {
    for (const entry of index.postings.get(word) ?? []) {
      if (checked.has(entry)) continue;
      checked.add(entry);
      if (entry.key === key || entry.id === selfId) continue;
      if (entry.words.length < smallest || entry.words.length > largest) continue;
      const shared = entry.words.reduce((sum, w) => sum + (wordSet.has(w) ? 1 : 0), 0);
      const similarity = jaccard(shared, size, entry.words.length);
      if (similarity >= threshold) near.push({ entry, similarity });
    }
  }
  near.sort((a, b) => b.similarity - a.similarity || a.entry.order - b.entry.order);

  return {
    exact: exact.slice(0, maxMatches).map((entry) => toMatch(entry, 1)),
    near: near.slice(0, maxMatches).map(({ entry, similarity }) => toMatch(entry, similarity)),
    totalExact: exact.length,
    totalNear: near.length,
  };
}
