/**
 * El apunte como texto para la IA y la cita de vuelta a su línea (B6 del plan del cambio, D-085).
 *
 * Qué hace. Arma el texto que se le manda al generador de tarjetas con las líneas del apunte que
 * todavía no son tarjeta, y después ancla cada tarjeta propuesta a la línea de donde sale su cita.
 * Una propuesta cuya cita no está tal cual en una línea del apunte se descarta, así todo lo que ve el
 * alumno se apoya en lo que él escribió.
 * Entradas. El árbol de líneas del apunte y las citas de las tarjetas propuestas.
 * Salidas. El texto, las líneas que lo forman y, por cita, la línea y el trozo literal de esa línea.
 * Método
 *   - Las líneas con marca ya son tarjeta y no se mandan. Las que cuelgan de una con >>> son su
 *     respuesta y tampoco
 *   - Una línea corta con líneas debajo va como título de sección. Las demás van como párrafos, con
 *     un punto al final si no traen signo, para que el divisor de secciones no las tome por títulos
 *   - La cita se busca sin mayúsculas, acentos ni espacios de sobra, y se devuelve el trozo exacto de
 *     la línea, sin el punto que se agregó. Así la frase que se guarda es la del alumno
 * Umbrales. Un título de sección tiene hasta 80 caracteres, como en el divisor de secciones.
 */
import { containsQuote, normalizeForMatch } from './grounding';
import { parseLine, type OutlineNode } from './outline';

/** Largo máximo de una línea que va como título de sección. Igual que en cardSim.ts */
const HEADING_MAX_CHARS = 80;

export interface SourceLine {
  nodeId: string;
  /** La línea como la escribió el alumno, sin etiquetas */
  original: string;
  /** La línea como se mandó, con el punto final si hizo falta */
  sent: string;
}

export interface OutlineSource {
  text: string;
  lines: SourceLine[];
}

const ENDS_WITH_SIGN = /[.!?;:…]$/u;

const hasText = (nodes: readonly OutlineNode[]): boolean =>
  nodes.some((node) => parseLine(node.text).plain !== '' || hasText(node.children));

/** El texto del apunte para el generador, con una línea por párrafo */
export function outlineSource(nodes: readonly OutlineNode[]): OutlineSource {
  const paragraphs: string[] = [];
  const lines: SourceLine[] = [];
  const walk = (list: readonly OutlineNode[]) => {
    for (const node of list) {
      const { mark, plain } = parseLine(node.text);
      // Una línea con >>> y sus respuestas ya son una tarjeta completa
      if (mark.type === 'multiline') continue;
      if (mark.type === 'none' && plain !== '') {
        const heading = plain.length <= HEADING_MAX_CHARS && hasText(node.children);
        const sent = heading || ENDS_WITH_SIGN.test(plain) ? plain : `${plain}.`;
        paragraphs.push(sent);
        lines.push({ nodeId: node.id, original: plain, sent });
      }
      walk(node.children);
    }
  };
  walk(nodes);
  return { text: paragraphs.join('\n\n'), lines };
}

/** El texto comparable con, para cada carácter, de qué posición del original salió */
function normalizedMap(text: string): { normal: string; from: number[] } {
  let normal = '';
  const from: number[] = [];
  let lastSpace = true;
  let index = 0;
  for (const char of text) {
    const piece = normalizeForMatch(char);
    if (/^\s*$/.test(char)) {
      if (!lastSpace) {
        normal += ' ';
        from.push(index);
        lastSpace = true;
      }
    } else {
      for (const part of piece) {
        normal += part;
        from.push(index);
      }
      if (piece !== '') lastSpace = false;
    }
    index += char.length;
  }
  if (normal.endsWith(' ')) {
    normal = normal.slice(0, -1);
    from.pop();
  }
  return { normal, from };
}

/**
 * El trozo exacto del original que corresponde a la cita, sin importar mayúsculas, acentos ni
 * espacios. null si la cita no está en el original
 */
export function literalSlice(original: string, quote: string): string | null {
  const needle = normalizeForMatch(quote);
  if (needle === '') return null;
  const { normal, from } = normalizedMap(original);
  const at = normal.indexOf(needle);
  if (at === -1) return null;
  const start = from[at] ?? 0;
  const lastIndex = from[at + needle.length - 1] ?? start;
  const lastChar = String.fromCodePoint(original.codePointAt(lastIndex) ?? 0);
  return original.slice(start, lastIndex + lastChar.length);
}

export interface AnchoredQuote {
  nodeId: string;
  /** La frase tal como está en la línea del alumno */
  quote: string;
}

/**
 * La línea de donde sale una cita y su trozo literal. Sirve la cita completa o sin el punto final
 * que se agregó al mandar la línea. null si ninguna línea la tiene
 */
export function anchorQuote(source: OutlineSource, quote: string): AnchoredQuote | null {
  const clean = quote.trim();
  if (clean === '') return null;
  for (const line of source.lines) {
    if (!containsQuote(line.sent, clean)) continue;
    const literal =
      literalSlice(line.original, clean) ?? literalSlice(line.original, clean.replace(/\.$/, ''));
    if (literal !== null && literal.trim() !== '') return { nodeId: line.nodeId, quote: literal };
  }
  return null;
}
