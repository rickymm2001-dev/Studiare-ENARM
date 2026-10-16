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

  it('los fragmentos en inglés que se piden van en un span con lang en, y el resto queda igual', () => {
    expect(
      textToHtml('Which statement is correct?\n\nRespuesta correcta. Option A & B', [
        'Which statement is correct?',
        'Option A & B',
      ]),
    ).toBe(
      '<p><span lang="en">Which statement is correct?</span></p><p>Respuesta correcta. <span lang="en">Option A &amp; B</span></p>',
    );
    // Sin fragmentos, o con fragmentos que no están en el texto, sale lo de siempre
    for (const english of [[], ['no está'], ['', '  ', 'a']]) {
      expect(textToHtml('Uno\ndos\n\nTres', english)).toBe('<p>Uno<br>dos</p><p>Tres</p>');
    }
  });

  it('un fragmento con saltos de línea o de varios párrafos se marca en cada párrafo, y lo escapado sigue escapado', () => {
    expect(textToHtml('Línea uno\nLine two <b>\n\nOtro', ['Line two <b>'])).toBe(
      '<p>Línea uno<br><span lang="en">Line two &lt;b&gt;</span></p><p>Otro</p>',
    );
    // Un fragmento de dos párrafos se busca por párrafos
    expect(
      textToHtml('First paragraph\n\nSecond paragraph', ['First paragraph\n\nSecond paragraph']),
    ).toBe(
      '<p><span lang="en">First paragraph</span></p><p><span lang="en">Second paragraph</span></p>',
    );
    // El texto de un fragmento se marca cada vez que aparece, y el más largo gana si uno contiene al otro
    expect(
      textToHtml('Heart attack. Heart attack, acute.', ['Heart attack', 'Heart attack, acute']),
    ).toBe(
      '<p><span lang="en">Heart attack</span>. <span lang="en">Heart attack, acute</span>.</p>',
    );
  });

  it('lo que el alumno cambió ya no es el fragmento y no se marca como inglés', () => {
    expect(
      textToHtml('Which statement is correct? Y lo que yo agregué', [
        'Which statement is correct?',
      ]),
    ).toBe('<p><span lang="en">Which statement is correct?</span> Y lo que yo agregué</p>');
    expect(textToHtml('Which statement is cor', ['Which statement is correct?'])).toBe(
      '<p>Which statement is cor</p>',
    );
  });

  it('propiedad. Con fragmentos, volver a texto devuelve lo mismo y el saneador conserva el idioma', () => {
    const sanitizer = createCardSanitizer(window);
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 160 }),
        fc.array(fc.string({ unit: 'grapheme', minLength: 3, maxLength: 20 }), { maxLength: 4 }),
        (text, english) => {
          const html = textToHtml(text, english);
          // Las únicas etiquetas son las del texto plano y el span con lang en
          const tags = [...html.matchAll(/<\/?([a-z]+)/gi)].map((match) => match[1]);
          expect(tags.every((tag) => tag === 'p' || tag === 'br' || tag === 'span')).toBe(true);
          expect(htmlToText(html)).toBe(normalizeText(text));
          expect(htmlToText(sanitizer.sanitize(html, () => null))).toBe(normalizeText(text));
        },
      ),
    );
    // Las marcas pasan por el saneador de las tarjetas
    expect(sanitizer.sanitize(textToHtml('Option A and B', ['Option A']), () => null)).toBe(
      '<p><span lang="en">Option A</span> and B</p>',
    );
  });

  it('volver a texto quita el span del idioma y deja sus palabras', () => {
    expect(
      htmlToText(
        '<p><span lang="en">Which one?</span> Sí</p><p>Dos <span lang="en-US">yes</span></p>',
      ),
    ).toBe('Which one? Sí\n\nDos yes');
    // El saneador deja un span sin atributos cuando le quita el estilo, y tampoco debe mostrarse como etiqueta
    expect(htmlToText('<p><span>a</span></p>')).toBe('a');
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
