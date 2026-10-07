// Saneado del HTML de tarjetas (14.3). Lista corta de etiquetas, sin estilos, sin enlaces y sin
// atributos salvo src y alt de las imágenes. Las imágenes solo se conservan si su archivo existe
// en el mapa de medios, y su ruta se reescribe. Lo usan el script que convierte los mazos de Paco
// (D-053) y, en la Fase E, el importador de .apkg. Recibe la ventana del DOM para poder correr en el
// navegador y en Node con jsdom.
import createDOMPurify, { type WindowLike } from 'dompurify';

export const CARD_ALLOWED_TAGS = [
  'b',
  'strong',
  'i',
  'em',
  'u',
  'sub',
  'sup',
  'mark',
  'br',
  'div',
  'p',
  'span',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'h3',
  'h4',
  'blockquote',
  'img',
] as const;

export interface CardSanitizer {
  /**
   * Devuelve HTML seguro. resolveMedia recibe el nombre de archivo de una imagen y devuelve su ruta
   * nueva, o null para quitar la imagen
   */
  sanitize(html: string, resolveMedia: (file: string) => string | null): string;
}

export function createCardSanitizer(window: WindowLike): CardSanitizer {
  const purify = createDOMPurify(window);
  let resolver: (file: string) => string | null = () => null;
  // La ruta se reescribe antes de que DOMPurify valide el URI, así solo pasan rutas del mapa
  purify.addHook('uponSanitizeAttribute', (node, data) => {
    if (node.nodeName !== 'IMG' || data.attrName !== 'src') return;
    let file = data.attrValue;
    try {
      file = decodeURIComponent(data.attrValue);
    } catch {
      // Un nombre con % suelto se usa tal cual
    }
    const target = resolver(file);
    if (target === null) data.keepAttr = false;
    else data.attrValue = target;
  });
  // Una imagen sin ruta válida se quita completa
  purify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName !== 'IMG') return;
    const element = node;
    if (!element.getAttribute('src')) {
      element.remove();
      return;
    }
    if (element.getAttribute('alt') === null) element.setAttribute('alt', '');
  });
  return {
    sanitize(html, resolveMedia) {
      resolver = resolveMedia;
      try {
        return purify
          .sanitize(html, {
            ALLOWED_TAGS: [...CARD_ALLOWED_TAGS],
            ALLOWED_ATTR: ['src', 'alt'],
            ALLOW_DATA_ATTR: false,
            ALLOWED_URI_REGEXP: /^[\w./-]+$/,
          })
          .replace(/&nbsp;/g, ' ')
          .trim();
      } finally {
        resolver = () => null;
      }
    },
  };
}
