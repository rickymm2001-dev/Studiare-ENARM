/**
 * Lectura de texto de tarjetas (fila 9 de D-085).
 *
 * Qué hace. Convierte el texto de una tarjeta, que puede ser HTML saneado o texto plano, en bloques
 * de texto limpio, y lee los huecos de un cloze con la sintaxis {{c1::texto::pista}}, también
 * anidados {{c1::A {{c2::B}} C}}. Lo usan la revisión de calidad (cardQuality.ts) y los duplicados
 * (duplicates.ts).
 * Entradas. Un texto.
 * Salidas. Bloques con su texto y si son un elemento de lista, el árbol de huecos de un cloze y el
 * texto que ve el alumno cuando uno de los huecos está tapado.
 * Método
 *   - Las etiquetas se quitan con una lista corta de las que separan bloques (br, p, div, li y las
 *     de tablas). Las demás, como b o sup, no parten palabras, así que H<sub>2</sub>O queda H2O
 *   - En texto plano un salto de línea separa bloques. En HTML es un espacio, como en el navegador
 *   - Las entidades se decodifican después de quitar las etiquetas, así un texto escapado como
 *     &lt;b&gt; sigue siendo texto
 *   - Los huecos los lee el mismo analizador que usa el repaso, src/engines/cloze.ts. Aquí solo se
 *     convierte su árbol a la forma que necesitan la calidad y los duplicados
 * Umbrales. Ninguno.
 */
import { parseCloze as parseClozeTree, type ClozeNode as ClozeTreeNode } from './cloze';

export interface TextBlock {
  text: string;
  /** Primer bloque de un li, un elemento de lista de HTML */
  listItem: boolean;
}

/** Etiquetas que separan un bloque de otro. Las demás no cortan el texto */
const BLOCK_TAGS: ReadonlySet<string> = new Set([
  'br',
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'caption',
  'blockquote',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'section',
  'article',
]);

/** Comentarios o etiquetas reales. "a < b" o "pH<7" no lo son porque no empiezan con una letra */
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^<>]*>/g;
const RAW_TEXT_ELEMENT = /<(script|style)\b[^<>]*>[\s\S]*?<\/\1\s*>/gi;
const HAS_BLOCK_TAG = /<\/?(?:br|p|div|li|ul|ol|table|tr|td|th|blockquote|h[1-6])\b[^<>]*>/i;
const IMAGE_SOURCE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  iexcl: '¡',
  iquest: '¿',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  uuml: 'ü',
  Uuml: 'Ü',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  deg: '°',
  plusmn: '±',
  micro: 'µ',
  times: '×',
  ge: '≥',
  le: '≤',
  rarr: '→',
  larr: '←',
};

const ENTITY = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/** Decodifica entidades. Una desconocida o inválida se vuelve un espacio y no deja basura */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (_match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const valid = code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
      return valid ? String.fromCodePoint(code) : ' ';
    }
    return NAMED_ENTITIES[body] ?? ' ';
  });
}

export interface BlockOptions {
  /** Deja el nombre de archivo de las imágenes como texto, para comparar tarjetas de imagen */
  keepImageNames?: boolean;
}

/** Parte el texto de una tarjeta en bloques de texto limpio, sin etiquetas ni entidades */
export function htmlToBlocks(source: string, options: BlockOptions = {}): TextBlock[] {
  const html = source.replace(RAW_TEXT_ELEMENT, ' ');
  // Sin etiquetas de bloque es texto plano, y entonces el salto de línea separa
  const newlineBreaks = !HAS_BLOCK_TAG.test(html);
  const blocks: TextBlock[] = [];
  let buffer = '';
  let pendingItem = false;

  const flush = () => {
    const text = decodeEntities(buffer).replace(/\s+/g, ' ').trim();
    buffer = '';
    if (text === '') return;
    blocks.push({ text, listItem: pendingItem });
    pendingItem = false;
  };
  const append = (text: string) => {
    if (!newlineBreaks) {
      buffer += text;
      return;
    }
    text.split(/\r\n?|\n/).forEach((line, index) => {
      if (index > 0) flush();
      buffer += line;
    });
  };

  let last = 0;
  for (const match of html.matchAll(TAG)) {
    append(html.slice(last, match.index));
    last = match.index + match[0].length;
    const name = match[2]?.toLowerCase();
    if (name === undefined) continue;
    if (name === 'img') {
      const found = IMAGE_SOURCE.exec(match[0]);
      const file = found?.[1] ?? found?.[2] ?? found?.[3] ?? '';
      buffer += options.keepImageNames ? ` ${file} ` : ' ';
    } else if (BLOCK_TAGS.has(name)) {
      flush();
      const closing = match[1] === '/';
      if (name === 'li') pendingItem = !closing;
    }
  }
  append(html.slice(last));
  flush();
  return blocks;
}

/** Todo el texto visible en una sola línea */
export function htmlToPlain(source: string, options: BlockOptions = {}): string {
  return htmlToBlocks(source, options)
    .map((block) => block.text)
    .join(' ');
}

/** Palabras visibles, sin contar signos sueltos como una flecha o un guion */
export function countWords(plain: string): number {
  return plain.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

// Cloze

/** Un hueco, con lo que esconde (que puede traer otros huecos adentro) y su pista */
export interface ClozeNode {
  kind: 'hole';
  ordinal: number;
  content: ClozePart[];
  hint: string | null;
}

export type ClozePart = string | ClozeNode;

export interface ClozeParse {
  parts: ClozePart[];
  /** Todos los huecos cerrados, en el orden en que se abren, también los anidados */
  holes: ClozeNode[];
}

/** Une las partes como texto, con cada hueco reemplazado por lo que esconde y sin pistas */
export function clozeFlatten(parts: readonly ClozePart[]): string {
  let out = '';
  // Una pila y no recursión, así miles de huecos uno dentro de otro no desbordan la pila de llamadas
  const stack: { parts: readonly ClozePart[]; index: number }[] = [{ parts, index: 0 }];
  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const part = frame.parts[frame.index];
    if (part === undefined) {
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (typeof part === 'string') out += part;
    else stack.push({ parts: part.content, index: 0 });
  }
  return out;
}

/**
 * El texto que ve el alumno cuando se le pregunta el hueco con ese número. Ese hueco queda como
 * […] o con su pista, y los demás se ven con su respuesta. Un hueco dentro de otro que se pregunta
 * queda tapado junto con él
 */
export function clozeRender(
  parts: readonly ClozePart[],
  ordinal: number,
  options: { hints: boolean },
): string {
  let out = '';
  const stack: { parts: readonly ClozePart[]; index: number }[] = [{ parts, index: 0 }];
  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const part = frame.parts[frame.index];
    if (part === undefined) {
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (typeof part === 'string') out += part;
    else if (part.ordinal !== ordinal) stack.push({ parts: part.content, index: 0 });
    else out += options.hints && part.hint !== null ? ` […${part.hint}] ` : ' […] ';
  }
  return out;
}

/**
 * Lee los huecos de un texto con el mismo analizador que usa el repaso (src/engines/cloze.ts), así
 * un aviso de calidad habla de lo mismo que ve el alumno. Un hueco sin su }} de cierre no es un
 * hueco para este motor, queda como texto con su contenido en el mismo lugar
 */
export function parseCloze(source: string): ClozeParse {
  const tree = parseClozeTree(source);
  const parts: ClozePart[] = [];
  const holes: ClozeNode[] = [];
  interface Frame {
    nodes: readonly ClozeTreeNode[];
    index: number;
    out: ClozePart[];
    /** Lo que falta hacer al terminar de recorrer los hijos de un hueco sin cerrar */
    after: (() => void) | null;
  }
  const stack: Frame[] = [{ nodes: tree.nodes, index: 0, out: parts, after: null }];
  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const node = frame.nodes[frame.index];
    if (!node) {
      frame.after?.();
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (node.kind === 'text') {
      frame.out.push(node.text);
    } else if (node.closed) {
      const hint = node.hint !== undefined && node.hint.trim() !== '' ? node.hint : null;
      const hole: ClozeNode = { kind: 'hole', ordinal: node.ordinal, content: [], hint };
      holes.push(hole);
      frame.out.push(hole);
      stack.push({ nodes: node.children, index: 0, out: hole.content, after: null });
    } else {
      const content: ClozePart[] = [];
      const target = frame.out;
      stack.push({
        nodes: node.children,
        index: 0,
        out: content,
        after: () => {
          const hint = node.hint === undefined ? [] : [`::${node.hint}`];
          target.push(`{{c${node.ordinal}::`, ...content, ...hint);
        },
      });
    }
  }
  return { parts, holes };
}
