// Texto plano a HTML de tarjeta y de vuelta. Lo usan las tarjetas de preguntas falladas, que salen del
// banco, y las que escribe el alumno a mano. Todo se escapa antes de entrar a una tarjeta, que es
// HTML, y solo se usan las etiquetas p y br de la lista corta del saneador (14.3). La única otra es el
// span con lang="en" de los fragmentos en inglés que se piden (B13), para que el lector de pantalla los
// diga en inglés.

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/**
 * Deja el texto como lo guarda una tarjeta. Las líneas en blanco separan párrafos, los extremos de
 * cada párrafo se recortan y los párrafos vacíos se quitan. Los saltos simples se conservan
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n[^\S\n]*(?:\n[^\S\n]*)+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Los fragmentos en inglés listos para buscarse en un párrafo. Cada uno se parte en sus propios párrafos, sin
 * espacios de más, y los de menos de 3 caracteres se dejan fuera para no marcar una letra suelta. Los más
 * largos van primero, así un fragmento que contiene a otro gana
 */
function englishPieces(english: readonly string[]): string[] {
  const pieces = english.flatMap((part) => normalizeText(part).split('\n\n'));
  return [
    ...new Set(pieces.map((piece) => piece.trim()).filter((piece) => piece.length >= 3)),
  ].sort((a, b) => b.length - a.length);
}

/** Un párrafo escapado, con cada fragmento en inglés que aparece tal cual dentro de un span con lang */
function paragraphHtml(paragraph: string, pieces: readonly string[]): string {
  let html = '';
  let from = 0;
  while (from < paragraph.length) {
    // La aparición más temprana desde donde va, y a igual lugar la del fragmento más largo
    let at = -1;
    let found = '';
    for (const piece of pieces) {
      const index = paragraph.indexOf(piece, from);
      if (index >= 0 && (at < 0 || index < at || (index === at && piece.length > found.length))) {
        at = index;
        found = piece;
      }
    }
    if (at < 0) break;
    html += `${escapeHtml(paragraph.slice(from, at))}<span lang="en">${escapeHtml(found)}</span>`;
    from = at + found.length;
  }
  return `${html}${escapeHtml(paragraph.slice(from))}`.replace(/\n/g, '<br>');
}

/**
 * Texto plano a párrafos. Una línea en blanco separa párrafos y un salto simple es un br. Los fragmentos de
 * english que están tal cual en el texto van en un span con lang="en" (B13). Lo que el alumno cambió ya no
 * es el fragmento y queda sin marca, que es lo conservador: nunca se marca como inglés lo que escribió él
 */
export function textToHtml(text: string, english: readonly string[] = []): string {
  const normalized = normalizeText(text);
  if (normalized === '') return '';
  const pieces = englishPieces(english);
  return normalized
    .split('\n\n')
    .map((paragraph) => `<p>${paragraphHtml(paragraph, pieces)}</p>`)
    .join('');
}

const UNESCAPES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

/**
 * Lo contrario de textToHtml, para volver a editar una tarjeta que se escribió a mano. Los span con lang del
 * inglés se quitan y quedan sus palabras, así el editor no muestra etiquetas
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/?span(?: lang="[a-z]{2}(?:-[a-z]{2})?")?>/gi, '')
    .replace(/<\/p>\s*<p>/g, '\n\n')
    .replace(/<\/?p>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/&(?:lt|gt|quot|#39|amp);/g, (entity) => UNESCAPES[entity] ?? entity);
}
