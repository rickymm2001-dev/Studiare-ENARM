// Texto plano a HTML de tarjeta y de vuelta. Lo usan las tarjetas de preguntas falladas, que salen del
// banco, y las que escribe el alumno a mano. Todo se escapa antes de entrar a una tarjeta, que es
// HTML, y solo se usan las etiquetas p y br de la lista corta del saneador (14.3).

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

/** Texto plano a párrafos. Una línea en blanco separa párrafos y un salto simple es un br */
export function textToHtml(text: string): string {
  const normalized = normalizeText(text);
  if (normalized === '') return '';
  return normalized
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const UNESCAPES: Readonly<Record<string, string>> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&amp;': '&',
};

/** Lo contrario de textToHtml, para volver a editar una tarjeta que se escribió a mano */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/p>\s*<p>/g, '\n\n')
    .replace(/<\/?p>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/&(?:lt|gt|quot|#39|amp);/g, (entity) => UNESCAPES[entity] ?? entity);
}
