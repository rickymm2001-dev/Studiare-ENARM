import { describe, expect, it } from 'vitest';
import {
  buildDuplicateIndex,
  duplicateKey,
  findDuplicates,
  firstField,
  normalizeForDuplicates,
  type DuplicateNote,
} from './duplicates';

const basic = (id: string, front: string, extra: Partial<DuplicateNote> = {}): DuplicateNote =>
  ({ id, kind: 'basic', front, ...extra }) as DuplicateNote;
const cloze = (id: string, text: string, extra: Partial<DuplicateNote> = {}): DuplicateNote =>
  ({ id, kind: 'cloze', text, ...extra }) as DuplicateNote;

describe('normalizeForDuplicates', () => {
  it('quita etiquetas, entidades, mayúsculas, acentos y puntuación', () => {
    expect(normalizeForDuplicates('<p>¿Qué es la <b>FEVI</b>?</p>')).toBe('que es la fevi');
    expect(normalizeForDuplicates('Coraz&oacute;n&nbsp;&amp;   Pulm&#243;n')).toBe(
      'corazon pulmon',
    );
    expect(normalizeForDuplicates('Año, niño: «sí»; ¡no!')).toBe('ano nino si no');
  });

  it('colapsa cualquier espacio y los saltos de línea', () => {
    expect(normalizeForDuplicates('  uno \t dos\n\ntres  ')).toBe('uno dos tres');
    expect(normalizeForDuplicates('<p>uno</p><p>dos</p>')).toBe('uno dos');
    expect(normalizeForDuplicates('')).toBe('');
    expect(normalizeForDuplicates('<p>¿?</p>')).toBe('');
  });

  it('en cloze deja la respuesta y quita la pista, también en huecos anidados', () => {
    expect(normalizeForDuplicates('La {{c1::Metformina::fármaco}} baja la {{c2::glucosa}}')).toBe(
      'la metformina baja la glucosa',
    );
    expect(normalizeForDuplicates('{{c1::A {{c2::B::hb}} C::ha}}')).toBe('a b c');
    // Un hueco sin cierre no es un hueco, y sus llaves se van como puntuación
    expect(normalizeForDuplicates('{{c1::abierto')).toBe('c1abierto');
  });

  it('un cloze y su texto con la respuesta puesta dan la misma clave', () => {
    expect(normalizeForDuplicates('El bazo es {{c1::un órgano}}')).toBe(
      normalizeForDuplicates('El bazo es un órgano'),
    );
  });

  it('conserva el sentido de < y > y de otros símbolos', () => {
    expect(normalizeForDuplicates('FEVI < 40%')).toBe('fevi menor 40');
    expect(normalizeForDuplicates('FEVI &gt; 40%')).toBe('fevi mayor 40');
    expect(normalizeForDuplicates('FEVI < 40%')).not.toBe(normalizeForDuplicates('FEVI > 40%'));
    expect(normalizeForDuplicates('Na+ ≥ 145')).not.toBe(normalizeForDuplicates('Na ≥ 145'));
  });

  it('un texto escapado como etiqueta sigue siendo texto y la normalización es estable', () => {
    const once = normalizeForDuplicates('&lt;b&gt;x&lt;/b&gt;');
    expect(once).toBe('menor b mayor x menor b mayor');
    expect(normalizeForDuplicates(once)).toBe(once);
  });

  it('las imágenes cuentan por su archivo', () => {
    const a = normalizeForDuplicates('Radiografía <img src="torax1.png">');
    const b = normalizeForDuplicates('Radiografía <img src="torax2.png">');
    expect(a).not.toBe(b);
    expect(normalizeForDuplicates('<img src="solo.png">')).not.toBe('');
  });

  it('une la puntuación interna, como anti-inflamatorio y antiinflamatorio', () => {
    expect(normalizeForDuplicates('anti-inflamatorio')).toBe(
      normalizeForDuplicates('antiinflamatorio'),
    );
    // Limitación conocida y documentada. Sin signos, 1.5 y 15 se parecen
    expect(normalizeForDuplicates('1.5 mg')).toBe(normalizeForDuplicates('15 mg'));
  });
});

describe('duplicateKey', () => {
  it('usa el primer campo, frente en básicas y texto en cloze', () => {
    expect(duplicateKey({ kind: 'basic', front: '<b>Hola</b>' })).toBe('hola');
    expect(duplicateKey({ kind: 'basic_reverse', front: 'Adiós' })).toBe('adios');
    expect(duplicateKey({ kind: 'cloze', text: 'Un {{c1::dato}}' })).toBe('un dato');
    expect(firstField({ kind: 'cloze', text: 't' })).toBe('t');
    expect(firstField({ kind: 'basic', front: 'f' })).toBe('f');
  });

  it('no depende de la respuesta', () => {
    expect(duplicateKey({ kind: 'basic', front: 'Hola' })).toBe(
      duplicateKey({ kind: 'basic', front: 'hola', back: 'otra' } as DuplicateNote),
    );
  });
});

describe('buildDuplicateIndex', () => {
  it('no cuenta las notas borradas ni las que no tienen texto', () => {
    const index = buildDuplicateIndex([
      basic('1', 'Uno'),
      basic('2', 'Dos', { deletedAt: '2026-10-07T10:00:00.000Z' }),
      basic('3', 'Tres', { deletedAt: null }),
      basic('4', '<p>¿?</p>'),
      cloze('5', ''),
    ]);
    expect(index.size).toBe(2);
    expect(index.byKey.has('dos')).toBe(false);
  });

  it('acepta cualquier iterable', () => {
    const index = buildDuplicateIndex(new Set([basic('1', 'Uno'), cloze('2', 'Dos {{c1::x}}')]));
    expect(index.size).toBe(2);
  });
});

describe('findDuplicates, exactos', () => {
  const index = buildDuplicateIndex([
    basic('a', '¿Qué es la <b>FEVI</b>?'),
    basic('b', 'Tratamiento de la gota', { deletedAt: '2026-10-07T10:00:00.000Z' }),
    cloze('c', 'La FEVI es {{c1::la fracción de eyección}} del ventrículo izquierdo'),
    basic('d', 'que es la fevi'),
  ]);

  it('encuentra el mismo texto aunque cambien mayúsculas, acentos, puntuación y HTML', () => {
    const result = findDuplicates({ kind: 'basic', front: 'QUÉ ES LA FEVI' }, index);
    expect(result.exact.map((match) => match.id)).toEqual(['a', 'd']);
    expect(result.totalExact).toBe(2);
    expect(result.exact[0]).toEqual({
      id: 'a',
      kind: 'basic',
      similarity: 1,
      preview: '¿Qué es la FEVI?',
    });
    expect(result.near).toEqual([]);
  });

  it('compara un cloze con su texto completo y la vista previa muestra la respuesta', () => {
    const result = findDuplicates(
      {
        kind: 'basic',
        front: 'La FEVI es la fracción de eyección del ventrículo izquierdo',
      },
      index,
    );
    expect(result.exact).toEqual([
      {
        id: 'c',
        kind: 'cloze',
        similarity: 1,
        preview: 'La FEVI es la fracción de eyección del ventrículo izquierdo',
      },
    ]);
  });

  it('las borradas no cuentan', () => {
    const result = findDuplicates({ kind: 'basic', front: 'Tratamiento de la gota' }, index);
    expect(result).toEqual({ exact: [], near: [], totalExact: 0, totalNear: 0 });
  });

  it('una nota no es duplicado de sí misma, por id de la candidata o por excludeId', () => {
    const byId = findDuplicates({ id: 'a', kind: 'basic', front: 'Qué es la FEVI' }, index);
    expect(byId.exact.map((match) => match.id)).toEqual(['d']);
    const byOption = findDuplicates({ kind: 'basic', front: 'Qué es la FEVI' }, index, {
      excludeId: 'd',
    });
    expect(byOption.exact.map((match) => match.id)).toEqual(['a']);
    const both = findDuplicates({ id: 'a', kind: 'basic', front: 'Qué es la FEVI' }, index, {
      excludeId: 'x',
    });
    expect(both.exact.map((match) => match.id)).toEqual(['a', 'd']);
  });

  it('una candidata sin texto no da nada, ni siquiera contra notas sin texto', () => {
    expect(findDuplicates({ kind: 'basic', front: '<p> </p>' }, index).totalExact).toBe(0);
    expect(findDuplicates({ kind: 'cloze', text: '' }, index).exact).toEqual([]);
  });

  it('recorta la vista previa larga', () => {
    const long = `${'palabra '.repeat(40)}final`;
    const result = findDuplicates(
      { kind: 'basic', front: long },
      buildDuplicateIndex([basic('l', long)]),
    );
    expect(result.exact[0]?.preview).toHaveLength(100);
    expect(result.exact[0]?.preview.endsWith('…')).toBe(true);
  });

  it('limita las coincidencias que devuelve pero cuenta todas', () => {
    const many = buildDuplicateIndex(
      Array.from({ length: 12 }, (_, position) => basic(`n${position}`, 'Mismo texto')),
    );
    const result = findDuplicates({ kind: 'basic', front: 'mismo texto' }, many, {
      maxMatches: 3,
    });
    expect(result.exact.map((match) => match.id)).toEqual(['n0', 'n1', 'n2']);
    expect(result.totalExact).toBe(12);
    const byDefault = findDuplicates({ kind: 'basic', front: 'mismo texto' }, many);
    expect(byDefault.exact).toHaveLength(5);
  });
});

describe('findDuplicates, casi iguales', () => {
  const base =
    'La metformina reduce la gluconeogénesis hepática y aumenta la sensibilidad a la insulina';
  const index = buildDuplicateIndex([
    basic('base', base),
    basic('mas', `${base} en el músculo`),
    basic('otro', 'Tratamiento de primera línea de la diabetes tipo 2'),
    basic('corto', 'Metformina'),
  ]);

  it('detecta una reformulación mínima con su similitud de Jaccard', () => {
    // 10 palabras distintas en la base y una más en la candidata, 10 entre 11
    const result = findDuplicates({ kind: 'basic', front: `${base} también` }, index);
    expect(result.exact).toEqual([]);
    expect(result.near.map((match) => match.id)).toEqual(['base']);
    expect(result.near[0]?.similarity).toBeCloseTo(10 / 11, 10);
    expect(result.totalNear).toBe(1);
  });

  it('ordena del más parecido al menos', () => {
    const result = findDuplicates({ kind: 'basic', front: base }, index, {
      nearSimilarity: 0.6,
    });
    expect(result.exact.map((match) => match.id)).toEqual(['base']);
    expect(result.near.map((match) => match.id)).toEqual(['mas']);
  });

  it('no avisa de textos que solo comparten algunas palabras', () => {
    const result = findDuplicates(
      { kind: 'basic', front: 'Tratamiento de primera línea de la hipertensión arterial' },
      index,
    );
    expect(result.near).toEqual([]);
  });

  it('con un umbral más bajo sí los avisa', () => {
    const result = findDuplicates(
      { kind: 'basic', front: 'Tratamiento de primera línea de la hipertensión arterial' },
      index,
      { nearSimilarity: 0.5 },
    );
    expect(result.near.map((match) => match.id)).toEqual(['otro']);
  });

  it('el mismo conjunto de palabras en otro orden es casi igual con similitud 1', () => {
    const result = findDuplicates(
      { kind: 'basic', front: 'línea primera de Tratamiento la diabetes de tipo 2' },
      index,
    );
    expect(result.near).toHaveLength(1);
    expect(result.near[0]).toMatchObject({ id: 'otro', similarity: 1 });
  });

  it('palabras que ninguna nota tiene no encuentran nada', () => {
    const result = findDuplicates({ kind: 'basic', front: 'zzz yyy xxx www' }, index);
    expect(result).toEqual({ exact: [], near: [], totalExact: 0, totalNear: 0 });
  });

  it('desempata por orden de entrada cuando la similitud es la misma', () => {
    const tied = buildDuplicateIndex([
      basic('x1', 'uno dos tres cuatro cinco seis siete extra'),
      basic('x2', 'uno dos tres cuatro cinco seis siete otro'),
    ]);
    const result = findDuplicates(
      { kind: 'basic', front: 'uno dos tres cuatro cinco seis siete' },
      tied,
      { nearSimilarity: 0.85 },
    );
    expect(result.near.map((match) => match.id)).toEqual(['x1', 'x2']);
  });

  it('no se compara contra la misma nota ni la cuenta como casi igual', () => {
    const result = findDuplicates(
      { id: 'mas', kind: 'basic', front: `${base} en el músculo ahora` },
      index,
    );
    expect(result.near.map((match) => match.id)).not.toContain('mas');
  });
});
