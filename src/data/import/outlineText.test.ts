import { describe, expect, it } from 'vitest';
import { normalizeTags, sanitizeTag } from '../../engines/tagPath';
import { decodeText } from './csv';
import { IMPORT_LIMITS } from './limits';
import {
  isMarkdownName,
  looksLikeOpml,
  markdownLines,
  markdownOutline,
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

/** Las etiquetas que da una ruta de contexto, saneadas como las saca el importador */
const tagsOf = (...path: string[]) => normalizeTags([sanitizeTag(path.join('::'))]);
const elapsed = (run: () => void) => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

describe('contexto de las etiquetas', () => {
  it('una viñeta con hijos bajo un título no borra el contexto del título', () => {
    const result = parseMarkdown(
      bytes(['# Cardiología', '## Arritmias', '- FA', '  - Pregunta :: Respuesta'].join('\n')),
      'a.md',
    );
    expect(result.notes[0]?.tags).toEqual(tagsOf('Cardiología', 'Arritmias', 'FA'));
  });

  it('las hermanas de un tema ya no llevan el contexto de lo que estaba más hondo', () => {
    const result = parseMarkdown(
      bytes(['- Tema A', '  - Sub A1', '    - P1 :: R1', '  - P2 :: R2', '- P3 :: R3'].join('\n')),
      'a.md',
    );
    expect(result.notes.map((note) => note.tags)).toEqual([
      tagsOf('Tema A', 'Sub A1'),
      tagsOf('Tema A'),
      [],
    ]);
  });

  it('una tarjeta hermana de un grupo no hereda el grupo', () => {
    const result = parseMarkdown(
      bytes(['# H1', '- P1 :: R1', '- Grupo', '  - P2 :: R2', '- P3 :: R3'].join('\n')),
      'a.md',
    );
    expect(result.notes.map((note) => note.tags)).toEqual([
      tagsOf('H1'),
      tagsOf('H1', 'Grupo'),
      tagsOf('H1'),
    ]);
  });

  it('un título entre las líneas que cuelgan de una pregunta con >>> corta su respuesta', () => {
    const result = parseMarkdown(
      bytes(['- Causas >>>', '  - Una', '## Otro tema', '- A :: B'].join('\n')),
      'a.md',
    );
    expect(result.notes.map((note) => [note.front, note.back])).toEqual([
      ['Causas', 'Una'],
      ['A', 'B'],
    ]);
    expect(result.notes[1]?.tags).toEqual(tagsOf('Otro tema'));
  });
});

describe('propiedades y macros de Logseq y de Roam', () => {
  it('salta tags, title, alias y source con valores de varias palabras y deja las tarjetas', () => {
    const lines = markdownLines(
      [
        'title:: Mi página larga',
        'tags:: cardio, hta',
        'alias:: otro nombre',
        '- Tema',
        '  source:: libro x',
        '  created-at:: 1699999999',
        '- Title :: Una tarjeta con la palabra Title',
        '- dosis:: 5 mg',
      ].join('\n'),
    );
    expect(lines.map((line) => line.text)).toEqual([
      'Tema',
      'Title :: Una tarjeta con la palabra Title',
      'dosis:: 5 mg',
    ]);
  });

  it('las macros de Roam y de Logseq no se vuelven huecos de cloze', () => {
    const result = parseMarkdown(
      bytes(
        [
          '- {{[[TODO]]}} comprar',
          '- {{embed: ((abc123))}}',
          '- {{[[table]]}}',
          '- {{query: (and [[x]])}}',
          '- {{video: https://example.com/v}}',
          '- La {{c1::penicilina}} trata la sífilis',
          '- A :: B',
        ].join('\n'),
      ),
      'a.md',
    );
    expect(result.notes.map((note) => note.kind)).toEqual(['cloze', 'basic_reverse']);
    expect(result.notes[0]?.front).toBe('La {{c1::penicilina}} trata la sífilis');
  });
});

describe('cercas de código y comentarios', () => {
  it('una cerca se cierra con el mismo carácter y no se invierte con otra marca adentro', () => {
    const lines = markdownLines(
      ['````', '```', '~~~', '- dentro :: no', '````', '- fuera :: sí'].join('\n'),
    );
    expect(lines.map((line) => line.text)).toEqual(['fuera :: sí']);
    const tildes = markdownLines(
      ['~~~', '```', '- dentro :: no', '~~~', '- fuera :: sí'].join('\n'),
    );
    expect(tildes.map((line) => line.text)).toEqual(['fuera :: sí']);
  });

  it('una cerca que nunca se cierra se avisa y se traga el resto', () => {
    const open = markdownOutline(['- P1 :: R1', '```', 'code', '- P2 :: R2'].join('\n'));
    expect(open.openFence).toBe(true);
    expect(open.lines.map((line) => line.text)).toEqual(['P1 :: R1']);
    const result = parseMarkdown(bytes('- P1 :: R1\n```\n- P2 :: R2'), 'a.md');
    expect(result.warnings).toEqual([{ code: 'unclosed_code_fence', count: 1 }]);
    expect(parseMarkdown(bytes('- P1 :: R1\n```\nx\n```\n- P2 :: R2'), 'a.md').warnings).toEqual(
      [],
    );
  });

  it('un comentario de varias líneas se salta completo', () => {
    const lines = markdownLines(
      ['- antes :: sí', '<!--', '- comentado :: no', '- otro :: no', '-->', '- después :: sí'].join(
        '\n',
      ),
    );
    expect(lines.map((line) => line.text)).toEqual(['antes :: sí', 'después :: sí']);
  });
});

describe('límites del importador de esquemas', () => {
  it('maxNotes deja exactamente maxNotes notas y avisa del resto', () => {
    const lines = Array.from({ length: 5 }, (_, index) => `- P${index} :: R${index}`).join('\n');
    const result = parseMarkdown(bytes(lines), 'a.md', { ...IMPORT_LIMITS, maxNotes: 3 });
    expect(result.notes).toHaveLength(3);
    expect(result.errors).toEqual([{ position: 4, code: 'too_many_notes' }]);
  });

  it('una línea más larga que un campo se rechaza sin leerla y el resto se importa', () => {
    const huge = `- ${'a'.repeat(30_000)} :: b`;
    const result = parseMarkdown(bytes(`${huge}\n- A :: B`), 'a.md');
    expect(result.errors).toEqual([{ position: 1, code: 'too_long' }]);
    expect(result.notes).toHaveLength(1);
  });

  it('una línea de 80,000 espacios no congela la lectura', () => {
    const text = `- a${' '.repeat(80_000)}b\n- A :: B`;
    let result: ReturnType<typeof parseMarkdown> | undefined;
    expect(
      elapsed(() => {
        result = parseMarkdown(bytes(text), 'a.md');
      }),
    ).toBeLessThan(1000);
    expect(result?.notes.map((note) => note.front)).toEqual(['A']);
  });

  it('decenas de miles de etiquetas en una línea no congelan la lectura', () => {
    const tags = Array.from({ length: 4_000 }, (_, index) => `#t${index}a`).join(' ');
    expect(elapsed(() => parseMarkdown(bytes(`- ${tags} P :: R`), 'a.md'))).toBeLessThan(2000);
  });
});

describe('texto del archivo', () => {
  it('un UTF-8 válido con un carácter de reemplazo escrito a propósito no se lee como Windows-1252', () => {
    const text = '- ¿Qué símbolo es \ufffd? :: Ninguno, está dañado';
    const result = parseMarkdown(bytes(text), 'a.md');
    expect(result.notes[0]?.front).toBe('¿Qué símbolo es \ufffd?');
    expect(decodeText(bytes('Cuál es la dosis de acetaminofén'))).toBe(
      'Cuál es la dosis de acetaminofén',
    );
  });

  it('lo que no es UTF-8 se lee como Windows-1252', () => {
    expect(decodeText(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe('Café');
  });

  it('quita la marca de orden de bytes', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
  });
});

describe('OPML endurecido', () => {
  const wrap = (body: string) =>
    `<?xml version="1.0"?><opml version="2.0"><body>${body}</body></opml>`;

  it('un > dentro de un atributo no corta la etiqueta ni descuadra los niveles', () => {
    const lines = opmlLines(
      wrap(
        '<outline text="Tema"><outline text="PA > 140 es HTA :: sí"/><outline text="Otra :: cosa"/></outline><outline text="Fuera :: nivel cero"/>',
      ),
    );
    expect(lines.map((line) => [line.depth, line.text])).toEqual([
      [0, 'Tema'],
      [1, 'PA > 140 es HTA :: sí'],
      [1, 'Otra :: cosa'],
      [0, 'Fuera :: nivel cero'],
    ]);
  });

  it('salta los comentarios y los CDATA, y ancla el atributo text', () => {
    const lines = opmlLines(
      wrap(
        '<!-- <outline text="comentado :: no"/> --><![CDATA[<outline text="cdata :: no"/>]]><outline data-text="mal :: no" text="bien :: sí"/><outline _note="a text=\'b :: no\'" text="otra :: sí"/>',
      ),
    );
    expect(lines.map((line) => line.text)).toEqual(['bien :: sí', 'otra :: sí']);
  });

  it('las referencias numéricas inválidas se dejan como están', () => {
    const [line] = opmlLines(wrap('<outline text="a &#xD800; b &#0; c &#65; d"/>'));
    expect(line?.text).toBe('a &#xD800; b &#0; c A d');
  });

  it('una etiqueta sin cerrar repetida miles de veces no congela la lectura', () => {
    const hostile = `<opml><body>${'<outline text="'.repeat(50_000)}`;
    expect(elapsed(() => opmlLines(hostile))).toBeLessThan(1000);
    const angles = `<opml><body>${'<outline text="<<<<'.repeat(20_000)}"/></body></opml>`;
    expect(elapsed(() => opmlLines(angles))).toBeLessThan(1000);
  });
});
