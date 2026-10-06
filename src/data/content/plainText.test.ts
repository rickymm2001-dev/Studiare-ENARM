// @vitest-environment jsdom
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createCardSanitizer } from './cardHtml';
import { escapeHtml, htmlToText, normalizeText, textToHtml } from './plainText';

describe('texto plano de tarjeta', () => {
  it('escapa lo que podría ser HTML', () => {
    expect(escapeHtml(`<b>"a" & 'b'</b>`)).toBe(
      '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;',
    );
  });

  it('las líneas en blanco separan párrafos y un salto simple es un br', () => {
    expect(textToHtml('Uno\ndos\n\nTres')).toBe('<p>Uno<br>dos</p><p>Tres</p>');
    expect(textToHtml('  \n\n')).toBe('');
    expect(textToHtml('A\r\n\r\nB')).toBe('<p>A</p><p>B</p>');
  });

  it('los huecos cloze pasan sin cambios', () => {
    expect(textToHtml('El {{c1::DIU de cobre}} es el más {{c2::eficaz::calidad}}')).toBe(
      '<p>El {{c1::DIU de cobre}} es el más {{c2::eficaz::calidad}}</p>',
    );
  });

  it('volver a texto devuelve lo que se escribió', () => {
    expect(htmlToText('<p>Uno<br>dos</p><p>3 &lt; 4 &amp; &quot;x&quot;</p>')).toBe(
      'Uno\ndos\n\n3 < 4 & "x"',
    );
  });

  it('propiedad. Escribir, guardar y volver a abrir deja el texto normalizado', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 200 }), (text) => {
        expect(htmlToText(textToHtml(text))).toBe(normalizeText(text));
      }),
    );
  });

  it('propiedad. Lo guardado pasa por el saneador con el mismo texto y sin etiquetas del alumno', () => {
    const sanitizer = createCardSanitizer(window);
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (text) => {
        const html = textToHtml(text);
        // Lo que escribió el alumno nunca se vuelve una etiqueta propia
        const tags = [...html.matchAll(/<\/?([a-z]+)/gi)].map((match) => match[1]);
        expect(tags.every((tag) => tag === 'p' || tag === 'br')).toBe(true);
        // El saneador puede escribir las comillas sin escapar, pero el texto es el mismo
        expect(htmlToText(sanitizer.sanitize(html, () => null))).toBe(normalizeText(text));
      }),
    );
  });
});
