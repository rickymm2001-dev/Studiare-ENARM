import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND } from './brand';

const root = new URL('../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** El valor de un token en el bloque :root del modo claro de tokens.css */
function lightToken(name: string): string | undefined {
  const css = read('src/ui/tokens.css');
  const light = css.slice(0, css.indexOf('@media (prefers-color-scheme: dark)'));
  return new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(light)?.[1];
}

describe('marca Studiare (D-119, respuesta 54)', () => {
  it('se llama Studiare en el manifest y en la pestaña, sin la palabra prototipo', () => {
    expect(BRAND.name).toBe('Studiare');
    expect(BRAND.shortName).toBe('Studiare');
    for (const text of [BRAND.name, BRAND.shortName, BRAND.description]) {
      expect(text.toLowerCase()).not.toContain('prototipo');
    }
  });

  it('el color del tema y el fondo coinciden con los tokens del modo claro', () => {
    expect(BRAND.themeColor.toLowerCase()).toBe(lightToken('--enarm-primary')?.toLowerCase());
    expect(BRAND.backgroundColor.toLowerCase()).toBe(lightToken('--enarm-canvas')?.toLowerCase());
  });

  it('index.html dice lo mismo que la marca, para Google y WhatsApp (4.17 del plan)', () => {
    const html = read('index.html');
    expect(html).toContain(`<title>${BRAND.name}</title>`);
    expect(html).toContain(`<meta name="theme-color" content="${BRAND.themeColor}" />`);
    expect(html).toContain(`content="${BRAND.description}"`);
    expect(html).toContain(`<meta property="og:title" content="${BRAND.name}" />`);
    expect(html.toLowerCase()).not.toContain('prototipo');
  });
});
