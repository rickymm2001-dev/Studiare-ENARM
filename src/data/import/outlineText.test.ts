import { describe, expect, it } from 'vitest';
import { IMPORT_LIMITS } from './limits';
import {
  isMarkdownName,
  looksLikeOpml,
  markdownLines,
  opmlLines,
  parseMarkdown,
  parseOpml,
} from './outlineText';
import { ImportError } from './types';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('markdownLines', () => {
  it('lee viñetas, títulos y párrafos, y salta el encabezado, el código y los comentarios', () => {
    const lines = markdownLines(
      [
        '---',
        'title: Nota',
        '---',
        '# Pediatría',
        '<!-- comentario -->',
        '- Tos ferina :: Bordetella pertussis',
        '  - hijo',
        '```',
        '- esto es código :: no',
        '```',
        'Un párrafo suelto',
      ].join('\n'),
    );
    expect(lines).toEqual([
      { depth: 0, text: 'Pediatría', heading: true },
      { depth: 0, text: 'Tos ferina :: Bordetella pertussis', heading: false },
      { depth: 1, text: 'hijo', heading: false },
      { depth: 0, text: 'Un párrafo suelto', heading: false },
    ]);
  });

  it('da el mismo nivel con 2, 3 o 4 espacios por nivel y con tabuladores', () => {
    for (const unit of ['  ', '   ', '    ', '\t']) {
      const levels = markdownLines(['- a', `${unit}- b`, `${unit}${unit}- c`].join('\n')).map(
        (line) => line.depth,
      );
      expect(levels).toEqual([0, 1, 2]);
    }
  });

  it('salta las propiedades de Logseq y de Roam pero no una tarjeta con dos puntos', () => {
    const lines = markdownLines(
      ['- Tema', '  id:: 64f2a1b0-aaaa', '  collapsed:: true', '- dosis:: 5 mg'].join('\n'),
    );
    expect(lines.map((line) => line.text)).toEqual(['Tema', 'dosis:: 5 mg']);
  });
});

describe('parseMarkdown', () => {
  it('saca tarjetas de las marcas y pone los títulos como etiqueta en ruta', () => {
    const result = parseMarkdown(
      bytes(
        [
          '# Pediatría',
          '## Infectología',
          '- Tos ferina :: Bordetella pertussis',
          '- Triada de Beck ;; Hipotensión, ruidos apagados, ingurgitación yugular',
          '- La {{c1::penicilina}} es el tratamiento de la sífilis',
          '- Una línea sin marca',
        ].join('\n'),
      ),
      'notas.md',
    );
    expect(result.source).toBe('markdown');
    expect(result.notes.map((note) => note.kind)).toEqual(['basic_reverse', 'basic', 'cloze']);
    expect(result.notes[0]?.front).toBe('Tos ferina');
    expect(result.notes[0]?.tags.some((tag) => tag.startsWith('Pediatría::Infectología'))).toBe(
      true,
    );
    expect(result.notes.every((note) => !note.html)).toBe(true);
  });

  it('una pregunta con >>> toma como respuesta las líneas que cuelgan y no las repite como tarjetas', () => {
    const result = parseMarkdown(
      bytes(
        [
          '- Causas de abdomen agudo >>>',
          '  - Apendicitis',
          '  - Colecistitis',
          '- Otra :: cosa',
        ].join('\n'),
      ),
      'a.md',
    );
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0]).toMatchObject({
      front: 'Causas de abdomen agudo',
      back: 'Apendicitis; Colecistitis',
    });
  });

  it('un tema con hijos da contexto a las tarjetas de abajo', () => {
    const result = parseMarkdown(
      bytes(['- Gineco', '  - Preeclampsia :: TA alta tras la semana 20'].join('\n')),
      'a.md',
    );
    expect(result.notes[0]?.tags.some((tag) => tag.includes('Gineco'))).toBe(true);
  });

  it('sin ninguna marca no hay nada que importar', () => {
    expect(() => parseMarkdown(bytes('- uno\n- dos'), 'a.md')).toThrow(ImportError);
    expect(() => parseMarkdown(bytes(''), 'a.md')).toThrow(ImportError);
  });

  it('un archivo demasiado grande se rechaza', () => {
    expect(() =>
      parseMarkdown(bytes('- a :: b'), 'a.md', { ...IMPORT_LIMITS, maxDocumentBytes: 3 }),
    ).toThrow(expect.objectContaining({ code: 'too_large' }));
  });

  it('un hueco que no es hueco se avisa y no rompe el resto', () => {
    const result = parseMarkdown(bytes('- Una {{ vacía }}\n- A :: B'), 'a.md');
    expect(result.notes.length).toBeGreaterThanOrEqual(1);
  });
});

describe('OPML', () => {
  const opml = `<?xml version="1.0"?><opml version="2.0"><head/><body>
    <outline text="Cirugía">
      <outline text="Apendicitis :: Signo de McBurney"/>
      <outline text="Fórmula &amp; dosis ;; 5 &lt; 10"/>
    </outline></body></opml>`;

  it('lee outline anidados, decodifica entidades y detecta el formato por el contenido', () => {
    expect(looksLikeOpml(bytes(opml))).toBe(true);
    expect(looksLikeOpml(bytes('a,b\n1,2'))).toBe(false);
    expect(opmlLines(opml).map((line) => [line.depth, line.text])).toEqual([
      [0, 'Cirugía'],
      [1, 'Apendicitis :: Signo de McBurney'],
      [1, 'Fórmula & dosis ;; 5 < 10'],
    ]);
  });

  it('saca las tarjetas con el tema como etiqueta', () => {
    const result = parseOpml(bytes(opml), 'dynalist.opml');
    expect(result.source).toBe('opml');
    expect(result.notes).toHaveLength(2);
    expect(result.notes[1]).toMatchObject({ kind: 'basic', front: 'Fórmula & dosis' });
    expect(result.notes[0]?.tags.some((tag) => tag.includes('Cirugía'))).toBe(true);
  });

  it('un XML que no es OPML se rechaza y una entidad externa no lee nada', () => {
    expect(() => parseOpml(bytes('<xml/>'), 'a.opml')).toThrow(
      expect.objectContaining({ code: 'corrupt' }),
    );
    const hostile = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><opml><body><outline text="&e; :: algo"/></body></opml>`;
    const result = parseOpml(bytes(hostile), 'a.opml');
    expect(JSON.stringify(result)).not.toContain('root:');
  });
});

describe('isMarkdownName', () => {
  it('reconoce .md y .markdown sin importar mayúsculas', () => {
    expect(isMarkdownName('Notas.MD')).toBe(true);
    expect(isMarkdownName('a.markdown')).toBe(true);
    expect(isMarkdownName('a.csv')).toBe(false);
  });
});
