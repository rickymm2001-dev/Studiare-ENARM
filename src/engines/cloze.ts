// Huecos de una tarjeta cloze al estilo Anki, {{c1::respuesta}} o {{c1::respuesta::pista}}. Un hueco
// puede llevar otros adentro, {{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}. Un solo
// analizador sirve para validar lo que escribe el alumno y para pintar la tarjeta, así lo que el
// editor acepta es lo que el repaso muestra.
//
// Reglas, las mismas que en Anki.
// - Un hueco se abre con {{cN:: y se cierra con el primer }} que encuentra, y el más reciente que
//   sigue abierto es el que cierra. Una llave suelta, un }} sin hueco abierto o un {{ sin cN:: son
//   texto normal.
// - La pista es lo que sigue al primer :: del último trozo de texto del hueco. Un :: seguido de otro
//   hueco anidado no es pista.
// - Al preguntar la tarjeta cN, todo hueco con ordinal N se oculta y con él todo lo que lleva
//   adentro. Los huecos con otro ordinal se muestran como texto normal, sin las llaves.
// - Al mostrar la respuesta de la tarjeta cN, los huecos con ordinal N se resaltan.
//
// Un hueco que el texto deja sin cerrar se trata como si cerrara al final del texto, así su
// respuesta nunca queda a la vista en la cara de la pregunta. El editor igual lo rechaza.
//
// Es un motor puro y lo comparten la capa de datos, que valida y pinta la tarjeta, y los motores de
// calidad y de duplicados, que leen el mismo texto con las mismas reglas. Antes había dos analizadores
// y se contradecían con huecos raros (D-088).

export interface ClozeTextNode {
  readonly kind: 'text';
  readonly text: string;
}

export interface ClozeHoleNode {
  readonly kind: 'hole';
  readonly ordinal: number;
  /** Lo que lleva adentro, texto y huecos anidados, sin la pista */
  readonly children: readonly ClozeNode[];
  readonly hint: string | undefined;
  /** false si el texto se acabó antes de que el hueco cerrara */
  readonly closed: boolean;
}

export type ClozeNode = ClozeTextNode | ClozeHoleNode;

export interface ClozeTree {
  readonly nodes: readonly ClozeNode[];
  /** Cuántos {{cN:: se abrieron, cierren o no */
  readonly openings: number;
}

/** Sticky: solo busca la apertura justo donde apunta lastIndex */
const OPENING = /\{\{c(\d+)::/y;

/** Arma el hueco y le separa la pista, que es lo que sigue al primer :: del último texto */
function holeOf(ordinal: number, children: readonly ClozeNode[], closed: boolean): ClozeHoleNode {
  const last = children.at(-1);
  if (last?.kind === 'text') {
    const cut = last.text.indexOf('::');
    if (cut !== -1) {
      const answer = last.text.slice(0, cut);
      const hint = last.text.slice(cut + 2);
      const before = children.slice(0, -1);
      return {
        kind: 'hole',
        ordinal,
        closed,
        children: answer === '' ? before : [...before, { kind: 'text', text: answer }],
        hint: hint === '' ? undefined : hint,
      };
    }
  }
  return { kind: 'hole', ordinal, closed, children, hint: undefined };
}

/**
 * Construye el árbol de huecos de un texto. Nunca lanza error, cualquier texto tiene árbol. Va con
 * una pila y no con recursión, así que miles de huecos anidados no desbordan la pila de llamadas
 */
export function parseCloze(source: string): ClozeTree {
  const root: ClozeNode[] = [];
  const open: { ordinal: number; children: ClozeNode[] }[] = [];
  let openings = 0;
  let pending = '';

  const target = () => open.at(-1)?.children ?? root;
  const flush = () => {
    if (pending === '') return;
    target().push({ kind: 'text', text: pending });
    pending = '';
  };
  const close = (closed: boolean) => {
    flush();
    const frame = open.pop();
    if (frame) target().push(holeOf(frame.ordinal, frame.children, closed));
  };

  let index = 0;
  while (index < source.length) {
    if (source.startsWith('{{', index)) {
      OPENING.lastIndex = index;
      const match = OPENING.exec(source);
      if (match) {
        flush();
        open.push({ ordinal: Number(match[1]), children: [] });
        openings += 1;
        index += match[0].length;
        continue;
      }
    } else if (open.length > 0 && source.startsWith('}}', index)) {
      close(true);
      index += 2;
      continue;
    }
    pending += source.charAt(index);
    index += 1;
  }
  flush();
  while (open.length > 0) close(false);
  return { nodes: root, openings };
}

export interface ClozeHole {
  ordinal: number;
  /** Lo que lleva adentro como texto plano, sin las marcas de los huecos anidados */
  answer: string;
  hint: string | undefined;
}

/**
 * Los huecos completos de un texto en el orden en que se abren, con los anidados después del que
 * los contiene. Un hueco que no cerró no cuenta, porque el editor lo rechaza
 */
export function clozeHoles(text: string): ClozeHole[] {
  interface Frame {
    readonly nodes: readonly ClozeNode[];
    index: number;
    /** El hueco que se está recorriendo, o null si es un hueco sin cerrar o la raíz */
    readonly slot: ClozeHole | null;
    /** Dónde empezó su texto dentro del texto plano que se va armando */
    readonly start: number;
  }
  const holes: ClozeHole[] = [];
  const stack: Frame[] = [{ nodes: parseCloze(text).nodes, index: 0, slot: null, start: 0 }];
  let plain = '';
  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const node = frame.nodes[frame.index];
    if (!node) {
      if (frame.slot) frame.slot.answer = plain.slice(frame.start);
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (node.kind === 'text') {
      plain += node.text;
      continue;
    }
    // El hueco se anota al abrirse para guardar el orden y su respuesta se completa al cerrarse
    let slot: ClozeHole | null = null;
    if (node.closed) {
      slot = { ordinal: node.ordinal, answer: '', hint: node.hint };
      holes.push(slot);
    }
    stack.push({ nodes: node.children, index: 0, slot, start: plain.length });
  }
  return holes;
}

/** Cuántos huecos se abrieron con {{cN::, cierren o no */
export function clozeOpenings(text: string): number {
  return parseCloze(text).openings;
}

/** El texto con cada hueco de primer nivel cambiado por […], para nombrar una tarjeta sin su respuesta */
export function maskCloze(text: string): string {
  return parseCloze(text)
    .nodes.map((node) => (node.kind === 'text' ? node.text : '[…]'))
    .join('');
}

/**
 * Una cara de la tarjeta cloze de ordinal N. Recibe HTML ya saneado y solo agrega etiquetas mark.
 * Sin revelar, todo hueco con ordinal N queda como […] o con su pista y lo que lleva adentro no se
 * dibuja. Al revelar, esos huecos se resaltan. Los demás huecos son texto normal en las dos caras
 */
export function renderClozeFace(
  nodes: readonly ClozeNode[],
  ordinal: number,
  reveal: boolean,
): string {
  interface RenderFrame {
    readonly nodes: readonly ClozeNode[];
    index: number;
    /** Lo que se escribe al terminar de recorrer el hueco */
    readonly tail: string;
    readonly marked: boolean;
  }
  let out = '';
  // Cuántos resaltes hay abiertos. Un hueco con ordinal N dentro de otro ya resaltado no se
  // resalta otra vez
  let marks = 0;
  const stack: RenderFrame[] = [{ nodes, index: 0, tail: '', marked: false }];
  for (let frame = stack.at(-1); frame; frame = stack.at(-1)) {
    const node = frame.nodes[frame.index];
    if (!node) {
      out += frame.tail;
      if (frame.marked) marks -= 1;
      stack.pop();
      continue;
    }
    frame.index += 1;
    if (node.kind === 'text') {
      out += node.text;
    } else if (node.ordinal !== ordinal || (reveal && marks > 0)) {
      stack.push({ nodes: node.children, index: 0, tail: '', marked: false });
    } else if (reveal) {
      out += '<mark>';
      marks += 1;
      stack.push({ nodes: node.children, index: 0, tail: '</mark>', marked: true });
    } else {
      out += `<mark>[${node.hint ?? '…'}]</mark>`;
    }
  }
  return out;
}
