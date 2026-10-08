import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  OUTLINE_MAX_DEPTH,
  analyzeOutline,
  applyMark,
  backlinks,
  hasChildren,
  indentLine,
  insertLineBelow,
  moveLine,
  normalizeDepths,
  outdentLine,
  parseLine,
  removeLine,
  resolveLinks,
  subtreeEnd,
  titleKey,
  visibleIndexes,
  type OutlineLineLike,
} from './outline';

const line = (id: string, depth: number, text = id): OutlineLineLike => ({ id, depth, text });
const shape = (lines: readonly OutlineLineLike[]) =>
  lines.map((entry) => `${entry.depth}${entry.id}`);

describe('parseLine', () => {
  it('una línea sin marca no genera tarjeta', () => {
    const parsed = parseLine('Las ideas sueltas también van en el apunte');
    expect(parsed.mark).toBe('none');
    expect(parsed.error).toBeNull();
  });

  it(':: da una básica con frente y respuesta', () => {
    const parsed = parseLine(
      'Triada de Beck :: Hipotensión, ingurgitación yugular y ruidos apagados',
    );
    expect(parsed).toMatchObject({
      mark: 'basic',
      front: 'Triada de Beck',
      back: 'Hipotensión, ingurgitación yugular y ruidos apagados',
      error: null,
    });
  });

  it(';; da una básica con tarjeta inversa', () => {
    expect(parseLine('Metformina ;; Biguanida')).toMatchObject({
      mark: 'basic_reverse',
      front: 'Metformina',
      back: 'Biguanida',
    });
  });

  it('usa el primer marcador y deja el resto como respuesta', () => {
    const parsed = parseLine('A :: B ;; C');
    expect(parsed).toMatchObject({ mark: 'basic', front: 'A', back: 'B ;; C' });
  });

  it('un marcador pegado a una palabra no cuenta, así no choca con etiquetas en ruta', () => {
    expect(parseLine('a::b y c;;d').mark).toBe('none');
    expect(parseLine('Pregunta :: respuesta #cardio::infarto').tags).toEqual(['cardio::infarto']);
  });

  it('una pregunta sin respuesta o una respuesta sin pregunta se marca incompleta', () => {
    expect(parseLine('Pregunta ::')).toMatchObject({ mark: 'basic', error: 'empty_back' });
    expect(parseLine(':: Respuesta')).toMatchObject({ mark: 'none' });
    expect(parseLine('x ;; ').error).toBe('empty_back');
  });

  it('los huecos sin número se numeran en orden y los numerados se respetan', () => {
    expect(parseLine('La {{metformina}} baja la {{gluconeogénesis}}').cloze).toBe(
      'La {{c1::metformina}} baja la {{c2::gluconeogénesis}}',
    );
    expect(parseLine('{{c3::a}} y {{b}}').cloze).toBe('{{c3::a}} y {{c4::b}}');
    expect(parseLine('Hueco {{c1::uno}} y {{c1::otro}}').error).toBeNull();
  });

  it('un hueco sin cerrar o vacío no se acepta, para no dejar la respuesta a la vista', () => {
    expect(parseLine('Esto {{c1::queda abierto').error).toBe('unclosed_cloze');
    expect(parseLine('Esto {{c1::}} está vacío').error).toBe('unclosed_cloze');
    expect(parseLine('Solo llaves {{}}').error).toBe('no_cloze');
  });

  it('con huecos y :: a la vez manda el hueco', () => {
    expect(parseLine('Pregunta :: la {{respuesta}}').mark).toBe('cloze');
  });

  it('saca las etiquetas del texto y las limpia', () => {
    const parsed = parseLine('Dosis :: 500 mg #Medicina_interna::Cardiología, #urgencias.');
    expect(parsed.back).toBe('500 mg');
    expect(parsed.tags).toEqual(['Medicina_interna::Cardiología', 'urgencias']);
  });

  it('una etiqueta con espacios por escribir mal queda sin espacios', () => {
    expect(parseLine('a :: b #mieloma::multiple').tags).toEqual(['mieloma::multiple']);
  });

  it('aplana los enlaces y los junta sin repetir', () => {
    const parsed = parseLine('Ver [[Diabetes]] y [[diabetes]] o [[ Insulina ]]');
    expect(parsed.clean).toBe('Ver Diabetes y diabetes o Insulina');
    expect(parsed.links).toEqual(['Diabetes', 'Insulina']);
  });

  it('un campo demasiado largo se marca', () => {
    expect(parseLine(`${'a'.repeat(3001)} :: b`).error).toBe('too_long');
  });
});

describe('analyzeOutline', () => {
  const lines = [
    line('a', 0, 'Cardiología #cardio'),
    line('b', 1, 'Infarto :: Oclusión coronaria #infarto'),
    line('c', 1, 'El {{troponina}} sube a las 3 horas'),
    line('d', 2, 'Detalle ;; Otro'),
    line('e', 0, 'Nefrología'),
    line('f', 1, 'Incompleta ::'),
  ];
  const plan = analyzeOutline(lines, ['ENARM 2027']);

  it('hereda las etiquetas de las líneas de arriba y las del apunte', () => {
    const byLine = new Map(plan.cards.map((card) => [card.lineId, card]));
    expect(byLine.get('b')?.tags).toEqual(['ENARM_2027', 'cardio', 'infarto']);
    expect(byLine.get('d')?.tags).toEqual(['ENARM_2027', 'cardio']);
    expect(plan.lines.find((entry) => entry.lineId === 'e')?.tags).toEqual(['ENARM_2027']);
  });

  it('la cloze lleva de contexto el camino de líneas que la contienen', () => {
    const cloze = plan.cards.find((card) => card.lineId === 'c');
    expect(cloze?.draft).toEqual({
      kind: 'cloze',
      text: 'El {{c1::troponina}} sube a las 3 horas',
      extra: 'Cardiología',
    });
  });

  it('cuenta las cartas, separa los problemas y las líneas sin marca', () => {
    expect(plan.cards.map((card) => [card.lineId, card.cards])).toEqual([
      ['b', 1],
      ['c', 1],
      ['d', 2],
    ]);
    expect(plan.problems).toEqual([{ lineId: 'f', error: 'empty_back' }]);
    expect(plan.unmarked).toEqual(['a', 'e']);
  });

  it('un cloze con dos números da dos cartas', () => {
    const result = analyzeOutline([line('x', 0, 'La {{a}} y la {{b}} y otra {{c1::c}}')]);
    expect(result.cards[0]?.cards).toBe(3);
    const same = analyzeOutline([line('y', 0, '{{c1::uno}} y {{c1::dos}}')]);
    expect(same.cards[0]?.cards).toBe(1);
  });

  it('junta los enlaces de todo el apunte sin repetir', () => {
    const result = analyzeOutline([
      line('a', 0, 'Ver [[Uno]]'),
      line('b', 1, 'y [[uno]] y [[Dos]]'),
    ]);
    expect(result.links).toEqual(['Uno', 'Dos']);
  });

  it('la sangría de una línea saca de la pila a las que ya cerraron', () => {
    const result = analyzeOutline([
      line('a', 0, 'Uno #x'),
      line('b', 1, 'Dos #y'),
      line('c', 0, 'Tres'),
      line('d', 1, 'Cuatro :: algo'),
    ]);
    expect(result.cards[0]?.tags).toEqual([]);
    expect(result.lines[3]?.breadcrumb).toEqual(['Tres']);
  });
});

describe('estructura de la lista', () => {
  const outline = [
    line('a', 0),
    line('b', 1),
    line('c', 2),
    line('d', 1),
    line('e', 0),
    line('f', 1),
  ];

  it('subtreeEnd y hasChildren siguen la sangría', () => {
    expect(subtreeEnd(outline, 0)).toBe(4);
    expect(subtreeEnd(outline, 1)).toBe(3);
    expect(subtreeEnd(outline, 4)).toBe(6);
    expect(hasChildren(outline, 2)).toBe(false);
    expect(hasChildren(outline, 4)).toBe(true);
  });

  it('indentLine mete la rama un nivel y no pasa de la línea de arriba más uno', () => {
    expect(shape(indentLine(outline, 3))).toEqual(['0a', '1b', '2c', '2d', '0e', '1f']);
    // b ya está un nivel más hondo que a, no puede bajar más
    expect(shape(indentLine(outline, 1))).toEqual(shape(outline));
    // la primera línea no tiene a quién colgarse
    expect(shape(indentLine(outline, 0))).toEqual(shape(outline));
    // e puede colgar de d
    expect(shape(indentLine(outline, 4))).toEqual(['0a', '1b', '2c', '1d', '1e', '2f']);
  });

  it('outdentLine saca la rama completa y mantiene la lista válida', () => {
    expect(shape(outdentLine(outline, 1))).toEqual(['0a', '0b', '1c', '1d', '0e', '1f']);
    expect(shape(outdentLine(outline, 0))).toEqual(shape(outline));
  });

  it('moveLine mueve la rama entera entre hermanas', () => {
    const down = moveLine(outline, 0, 1);
    expect(shape(down.lines)).toEqual(['0e', '1f', '0a', '1b', '2c', '1d']);
    expect(down.index).toBe(2);
    const up = moveLine(outline, 4, -1);
    expect(shape(up.lines)).toEqual(['0e', '1f', '0a', '1b', '2c', '1d']);
    expect(up.index).toBe(0);
    // sin hermana en esa dirección no pasa nada
    expect(shape(moveLine(outline, 0, -1).lines)).toEqual(shape(outline));
    expect(shape(moveLine(outline, 4, 1).lines)).toEqual(shape(outline));
    expect(shape(moveLine(outline, 2, 1).lines)).toEqual(shape(outline));
  });

  it('insertLineBelow pone la línea nueva de primera hija si la actual tiene hijas', () => {
    const make = (depth: number) => line('n', depth);
    expect(shape(insertLineBelow(outline, 0, make).lines)).toEqual([
      '0a',
      '1n',
      '1b',
      '2c',
      '1d',
      '0e',
      '1f',
    ]);
    const leaf = insertLineBelow(outline, 2, make);
    expect(shape(leaf.lines)).toEqual(['0a', '1b', '2c', '2n', '1d', '0e', '1f']);
    expect(leaf.index).toBe(3);
  });

  it('removeLine quita solo esa línea y sube a sus hijas', () => {
    expect(shape(removeLine(outline, 1))).toEqual(['0a', '1c', '1d', '0e', '1f']);
    expect(shape(removeLine(outline, 0))).toEqual(['0b', '1c', '0d', '0e', '1f']);
  });

  it('visibleIndexes oculta lo que cuelga de una rama plegada', () => {
    expect(visibleIndexes(outline, new Set())).toEqual([0, 1, 2, 3, 4, 5]);
    expect(visibleIndexes(outline, new Set(['a']))).toEqual([0, 4, 5]);
    expect(visibleIndexes(outline, new Set(['b', 'e']))).toEqual([0, 1, 3, 4]);
    // plegar una línea sin hijas no oculta nada
    expect(visibleIndexes(outline, new Set(['c']))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('normalizeDepths corrige sangrías imposibles', () => {
    const messy = [line('a', 3), line('b', 5), line('c', 0), line('d', 99)];
    expect(shape(normalizeDepths(messy))).toEqual(['0a', '1b', '0c', '1d']);
  });
});

describe('propiedades de la estructura', () => {
  const arbitraryLines = fc
    .array(fc.integer({ min: 0, max: 12 }), { minLength: 1, maxLength: 30 })
    .map((depths) => normalizeDepths(depths.map((depth, index) => line(`l${index}`, depth))));
  const valid = (lines: readonly OutlineLineLike[]) =>
    lines.every(
      (entry, index) =>
        entry.depth >= 0 &&
        entry.depth <= OUTLINE_MAX_DEPTH &&
        entry.depth <= (index === 0 ? 0 : (lines[index - 1]?.depth ?? 0) + 1),
    );

  it('toda operación deja una lista válida y no pierde líneas', () => {
    fc.assert(
      fc.property(
        arbitraryLines,
        fc.nat(40),
        fc.constantFrom('in', 'out', 'up', 'down'),
        (lines, raw, op) => {
          const index = raw % lines.length;
          const result =
            op === 'in'
              ? indentLine(lines, index)
              : op === 'out'
                ? outdentLine(lines, index)
                : moveLine(lines, index, op === 'up' ? -1 : 1).lines;
          expect(valid(result)).toBe(true);
          expect(result.map((entry) => entry.id).sort()).toEqual(
            lines.map((entry) => entry.id).sort(),
          );
        },
      ),
    );
  });

  it('borrar una línea deja la lista válida con una menos', () => {
    fc.assert(
      fc.property(arbitraryLines, fc.nat(40), (lines, raw) => {
        const result = removeLine(lines, raw % lines.length);
        expect(valid(result)).toBe(true);
        expect(result).toHaveLength(lines.length - 1);
      }),
    );
  });

  it('sangrar y sacar la misma línea vuelve a la lista de antes', () => {
    fc.assert(
      fc.property(arbitraryLines, fc.nat(40), (lines, raw) => {
        const index = raw % lines.length;
        const indented = indentLine(lines, index);
        if (indented.every((entry, position) => entry === lines[position])) return;
        expect(outdentLine(indented, index).map((entry) => entry.depth)).toEqual(
          lines.map((entry) => entry.depth),
        );
      }),
    );
  });
});

describe('enlaces entre apuntes', () => {
  const pages = [
    { id: 'p1', title: 'Diabetes mellitus', lines: [line('a', 0, 'Ver [[Insulina]]')] },
    { id: 'p2', title: 'Insulina', lines: [line('b', 0, 'Relacionada con [[diabetes MELLITUS]]')] },
    { id: 'p3', title: 'Otro', lines: [line('c', 0, 'sin enlaces')] },
  ];

  it('titleKey ignora mayúsculas, acentos y espacios de más', () => {
    expect(titleKey('  Cardiología   Clínica ')).toBe('cardiologia clinica');
  });

  it('resolveLinks encuentra el apunte o deja null', () => {
    const resolved = resolveLinks(pages, ['insulina', 'No existe']);
    expect(resolved.get('insulina')?.id).toBe('p2');
    expect(resolved.get('No existe')).toBeNull();
  });

  it('backlinks lista a quien enlaza y nunca al propio apunte', () => {
    expect(backlinks(pages, pages[1] as (typeof pages)[number]).map((page) => page.id)).toEqual([
      'p1',
    ]);
    expect(backlinks(pages, pages[0] as (typeof pages)[number]).map((page) => page.id)).toEqual([
      'p2',
    ]);
    expect(backlinks(pages, pages[2] as (typeof pages)[number])).toEqual([]);
  });
});

describe('applyMark', () => {
  it('pone :: después de lo escrito con un espacio a cada lado', () => {
    expect(applyMark('Triada de Beck', 14, 14, 'card')).toEqual({
      text: 'Triada de Beck :: ',
      caret: 18,
    });
    expect(applyMark('Triada de Beck ', 15, 15, 'card').text).toBe('Triada de Beck :: ');
    expect(applyMark('', 0, 0, 'reverse')).toEqual({ text: ';; ', caret: 3 });
    // No duplica el espacio de la derecha
    expect(applyMark('A B', 1, 1, 'card').text).toBe('A :: B');
  });

  it('el hueco envuelve la selección o deja el cursor adentro', () => {
    expect(applyMark('La metformina baja', 3, 13, 'hole')).toEqual({
      text: 'La {{metformina}} baja',
      caret: 17,
    });
    expect(applyMark('La ', 3, 3, 'hole')).toEqual({ text: 'La {{}}', caret: 5 });
  });

  it('el enlace envuelve igual que el hueco', () => {
    expect(applyMark('Ver diabetes', 4, 12, 'link').text).toBe('Ver [[diabetes]]');
    expect(applyMark('', 0, 0, 'link')).toEqual({ text: '[[]]', caret: 2 });
  });

  it('la etiqueta agrega # con un espacio antes si hace falta', () => {
    expect(applyMark('Dosis', 5, 5, 'tag')).toEqual({ text: 'Dosis #', caret: 7 });
    expect(applyMark('', 0, 0, 'tag')).toEqual({ text: '#', caret: 1 });
    expect(applyMark('Dosis ', 6, 6, 'tag').text).toBe('Dosis #');
  });

  it('una selección al revés o fuera de rango se acomoda', () => {
    expect(applyMark('abc', 99, 1, 'hole').text).toBe('a{{bc}}');
    expect(applyMark('abc', -5, 2, 'hole').text).toBe('{{ab}}c');
  });

  it('el texto con la marca se lee con el motor', () => {
    const { text } = applyMark('Metformina', 10, 10, 'card');
    expect(parseLine(`${text}Biguanida`)).toMatchObject({ mark: 'basic', error: null });
  });
});
