import { describe, expect, it } from 'vitest';
import { englishText } from './english';

/**
 * Los textos de Inglés médico ya no cuelgan de t en es-MX.ts, así que el estilo de la interfaz se vigila
 * aquí. Se recorren todos, los de función con varios argumentos de prueba, y se revisa que sean español
 * de México con trato de tú, sin signos de dos puntos ni de exclamación (los relojes como 4:30 sí valen).
 */
function collect(node: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof node === 'string') {
    out.push({ path, text: node });
  } else if (typeof node === 'function') {
    for (const args of [
      [1, 2, 3, 4],
      [0, 0, 0, 0],
      [30, 90, 250, 12],
      [2, 1, 5, 3],
    ]) {
      const text = (node as (...values: unknown[]) => unknown)(...args);
      if (typeof text === 'string') out.push({ path: `${path}(${args.join(', ')})`, text });
    }
  } else if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) collect(value, `${path}.${key}`, out);
  }
}

const all: { path: string; text: string }[] = [];
collect(englishText, 'englishText', all);

describe('textos de Inglés médico (estilo)', () => {
  it('recorre todos los textos y ninguno está vacío', () => {
    expect(all.length).toBeGreaterThan(60);
    for (const { path, text } of all) {
      expect(text.trim(), path).not.toBe('');
    }
  });

  it('no usa signos de dos puntos ni de exclamación, salvo los relojes como 4:30', () => {
    for (const { path, text } of all) {
      expect(text.replace(/\d+:\d{2}/g, ''), path).not.toContain(':');
      expect(text, path).not.toMatch(/[¡!]/);
    }
  });

  it('habla de tú y no de usted', () => {
    for (const { path, text } of all) {
      expect(text, path).not.toMatch(/\b(usted|ustedes|su cuenta|sus respuestas)\b/i);
    }
  });

  it('no deja marcadores a medias de una plantilla', () => {
    for (const { path, text } of all) {
      expect(text, path).not.toMatch(/undefined|NaN|\[object|\$\{/);
    }
  });
});
