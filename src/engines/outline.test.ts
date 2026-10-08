import { describe, expect, it } from 'vitest';
import {
  backlinks,
  cardCountOf,
  countNodes,
  docToOutline,
  markTokens,
  normalizeTitle,
  numberClozeHoles,
  OUTLINE_LIMITS,
  outlineDepth,
  outlineTags,
  outlineToDoc,
  parseLine,
  planCards,
  resolveLinks,
  type OutlineNode,
} from './outline';

let counter = 0;
const makeId = () => `gen-${(counter += 1)}`;
const node = (id: string, text: string, ...children: OutlineNode[]): OutlineNode => ({
  id,
  text,
  children,
});

describe('parseLine, marcas de una línea', () => {
  it('>> es una tarjeta hacia delante', () => {
    expect(parseLine('Primera línea del asma >> Salbutamol').mark).toEqual({
      type: 'forward',
      separator: '>>',
      left: 'Primera línea del asma',
      right: 'Salbutamol',
    });
  });

  it('<< pregunta lo que está a la derecha y <> y :: dan las dos direcciones', () => {
    expect(parseLine('Salbutamol << Primera línea del asma').mark).toMatchObject({
      type: 'backward',
      left: 'Salbutamol',
      right: 'Primera línea del asma',
    });
    expect(parseLine('Disnea <> Dificultad para respirar').mark).toMatchObject({ type: 'both' });
    expect(parseLine('Asma :: Obstrucción reversible de la vía aérea').mark).toMatchObject({
      type: 'both',
      separator: '::',
    });
  });

  it(';; es un descriptor hacia delante', () => {
    expect(parseLine('Asma ;; Sibilancias nocturnas').mark).toMatchObject({
      type: 'forward',
      separator: ';;',
    });
  });

  it('una marca sin texto de un lado no hace tarjeta', () => {
    expect(parseLine('>> solo respuesta').mark).toEqual({ type: 'none' });
    expect(parseLine('solo pregunta >>').mark).toEqual({ type: 'none' });
    expect(parseLine('   ').mark).toEqual({ type: 'none' });
  });

  it('los dos puntos de una etiqueta o de un hueco no cuentan como marca', () => {
    expect(parseLine('Tema #Cardiología::Arritmias').mark).toEqual({ type: 'none' });
    expect(parseLine('El {{c1::sodio}} es el principal catión').mark).toMatchObject({
      type: 'cloze',
    });
    // Un :: de verdad fuera del hueco sí es marca
    expect(parseLine('Sodio :: catión principal #Fisiología::Líquidos').mark).toMatchObject({
      type: 'both',
      left: 'Sodio',
      right: 'catión principal',
    });
  });

  it('tres signos al final piden la respuesta en las líneas de abajo', () => {
    expect(parseLine('Causas de insuficiencia cardiaca >>>').mark).toEqual({
      type: 'multiline',
      front: 'Causas de insuficiencia cardiaca',
    });
    expect(parseLine('>>>').mark).toEqual({ type: 'none' });
    // A mitad de línea tres signos no son una marca de varias líneas
    expect(parseLine('a >>> b').mark).toEqual({ type: 'none' });
  });

  it('{{texto}} se numera en orden y respeta los números que ya trae', () => {
    expect(numberClozeHoles('{{a}} y {{b}}')).toBe('{{c1::a}} y {{c2::b}}');
    expect(numberClozeHoles('{{c2::a}} y {{b}} y {{c1::c}}')).toBe(
      '{{c2::a}} y {{c3::b}} y {{c1::c}}',
    );
    expect(numberClozeHoles('sin huecos')).toBeNull();
    expect(numberClozeHoles('hueco {{ }} vacío')).toBeNull();
    expect(parseLine('El {{corazón}} bombea la {{sangre}}').mark).toEqual({
      type: 'cloze',
      text: 'El {{c1::corazón}} bombea la {{c2::sangre}}',
    });
  });

  it('con un separador, las llaves dobles quedan como texto y no hacen cloze', () => {
    const parsed = parseLine('Fármaco >> {{beta}} bloqueador');
    expect(parsed.mark.type).toBe('forward');
  });

  it('saca las etiquetas y los enlaces, y deja el texto limpio', () => {
    const parsed = parseLine('Ver [[Asma]] y [[Asma]] de nuevo #Neumología::Asma #urgente.');
    expect(parsed.tags).toEqual(['Neumología::Asma', 'urgente']);
    expect(parsed.links).toEqual(['Asma']);
    expect(parsed.plain).toBe('Ver Asma y Asma de nuevo');
  });

  it('una almohadilla pegada a una palabra no es etiqueta', () => {
    expect(parseLine('Caso C#3 del examen').tags).toEqual([]);
  });

  it('un salto de línea dentro del texto cuenta como espacio al buscar marcas', () => {
    expect(parseLine('Pregunta\n>> Respuesta').mark).toMatchObject({ type: 'forward' });
  });
});

describe('planCards, el plan de tarjetas de un apunte', () => {
  it('convierte cada marca en el tipo de nota que toca', () => {
    const { plans, issues } = planCards([
      node('a', 'Asma >> Obstrucción reversible'),
      node('b', 'Obstrucción reversible << Asma'),
      node('c', 'Disnea <> Falta de aire'),
      node('d', 'El {{corazón}} bombea'),
      node('e', 'Sin marca'),
    ]);
    expect(issues).toEqual([]);
    expect(plans.map((plan) => [plan.nodeId, plan.draft.kind])).toEqual([
      ['a', 'basic'],
      ['b', 'basic'],
      ['c', 'basic_reverse'],
      ['d', 'cloze'],
    ]);
    // << invierte los lados
    expect(plans[1]?.draft).toEqual({
      kind: 'basic',
      front: 'Asma',
      back: 'Obstrucción reversible',
    });
  });

  it('las etiquetas de una línea pasan a todo lo que cuelga de ella', () => {
    const { plans } = planCards([
      node(
        't',
        'Cardiología #Cardio',
        node('x', 'FA >> Arritmia #Arritmias'),
        node('y', 'IC >> Falla'),
      ),
    ]);
    expect(plans.find((plan) => plan.nodeId === 'x')?.tags).toEqual(['Cardio', 'Arritmias']);
    expect(plans.find((plan) => plan.nodeId === 'y')?.tags).toEqual(['Cardio']);
  });

  it('con >>> la respuesta son las líneas de abajo y esas líneas no generan tarjetas', () => {
    const { plans, issues } = planCards([
      node(
        'm',
        'Causas de IC >>>',
        node('c1', 'Isquemia'),
        node('c2', 'Hipertensión', node('c3', 'Crónica')),
      ),
    ]);
    expect(issues).toEqual([]);
    expect(plans).toHaveLength(1);
    expect(plans[0]?.draft).toEqual({
      kind: 'basic',
      front: 'Causas de IC',
      back: 'Isquemia\nHipertensión\n  Crónica',
    });
  });

  it('avisa si una línea con >>> no tiene respuesta o si sus hijas traían marcas', () => {
    const empty = planCards([node('m', 'Causas >>>')]);
    expect(empty.plans).toEqual([]);
    expect(empty.issues).toEqual([{ nodeId: 'm', code: 'multiline_without_children' }]);
    const nested = planCards([node('m', 'Causas >>>', node('h', 'A >> B'))]);
    expect(nested.plans).toHaveLength(1);
    expect(nested.issues).toEqual([{ nodeId: 'm', code: 'nested_mark_ignored' }]);
  });

  it('un hueco que no se puede usar no genera tarjeta y se avisa', () => {
    const { plans, issues } = planCards([node('c', 'Dato {{c1::sin cerrar')]);
    expect(plans).toEqual([]);
    expect(issues).toEqual([{ nodeId: 'c', code: 'cloze_unusable' }]);
    const explicit = planCards([node('d', 'Dato {{c1::}} vacío {{c2::ok}}')]);
    expect(explicit.issues).toEqual([{ nodeId: 'd', code: 'cloze_unusable' }]);
  });

  it('respeta los topes de campo, de tarjetas y de profundidad', () => {
    const long = planCards([node('l', `P >> ${'x'.repeat(OUTLINE_LIMITS.maxFieldLength + 1)}`)]);
    expect(long.plans).toEqual([]);
    expect(long.issues).toEqual([{ nodeId: 'l', code: 'too_long' }]);

    const many = planCards(
      Array.from({ length: OUTLINE_LIMITS.maxCards + 5 }, (_, i) =>
        node(`n${i}`, `P${i} >> R${i}`),
      ),
    );
    expect(many.plans).toHaveLength(OUTLINE_LIMITS.maxCards);
    expect(many.issues.filter((issue) => issue.code === 'too_many_cards')).toHaveLength(5);

    let deep: OutlineNode = node('d9', 'P >> R');
    for (let level = 8; level >= 1; level -= 1) deep = node(`d${level}`, 'nivel', deep);
    const result = planCards([deep]);
    expect(result.issues).toEqual([{ nodeId: 'd9', code: 'too_deep' }]);
  });

  it('el plan es el mismo con las mismas líneas, el id de la línea manda y no su posición', () => {
    const lines = [node('a', 'A >> 1'), node('b', 'B >> 2')];
    const swapped = [lines[1] as OutlineNode, lines[0] as OutlineNode];
    const byId = (list: OutlineNode[]) =>
      Object.fromEntries(planCards(list).plans.map((plan) => [plan.nodeId, plan.draft]));
    expect(byId(swapped)).toEqual(byId(lines));
  });

  it('cuenta líneas y profundidad', () => {
    const tree = [node('a', 'a', node('b', 'b', node('c', 'c'))), node('d', 'd')];
    expect(countNodes(tree)).toBe(4);
    expect(outlineDepth(tree)).toBe(3);
    expect(outlineDepth([])).toBe(0);
  });
});

describe('conversión entre el árbol y el documento del editor', () => {
  const tree = [
    node('a', 'Cardiología #Cardio', node('b', 'FA >> Arritmia'), node('c', '')),
    node('d', 'Otra'),
  ];

  it('ida y vuelta conserva texto, orden, niveles e ids', () => {
    const doc = outlineToDoc(tree, makeId);
    expect(docToOutline(doc, makeId)).toEqual(tree);
  });

  it('un apunte vacío trae una línea en blanco para escribir', () => {
    const doc = outlineToDoc([], makeId);
    const back = docToOutline(doc, makeId);
    expect(back).toHaveLength(1);
    expect(back[0]?.text).toBe('');
  });

  it('una línea partida con Enter hereda el id y solo la primera lo conserva', () => {
    const doc = outlineToDoc(tree, makeId);
    // Se parte la primera línea: la copia queda justo después con el mismo id
    const list = doc.content?.[0];
    list?.content?.splice(1, 0, {
      type: 'listItem',
      attrs: { nodeId: 'a' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'mitad nueva' }] }],
    });
    const back = docToOutline(doc, makeId);
    expect(back[0]?.id).toBe('a');
    expect(back[1]?.text).toBe('mitad nueva');
    expect(back[1]?.id).not.toBe('a');
    expect(
      new Set([...back, ...back.flatMap((item) => item.children)].map((item) => item.id)).size,
    ).toBe(countNodes(back));
  });

  it('una línea sin id recibe uno nuevo y nunca queda vacío', () => {
    const back = docToOutline(
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
              },
            ],
          },
        ],
      },
      makeId,
    );
    expect(back[0]?.id).toMatch(/^gen-/);
  });

  it('los saltos suaves del editor pasan a espacio', () => {
    const back = docToOutline(
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                attrs: { nodeId: 'z' },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'uno' },
                      { type: 'hardBreak' },
                      { type: 'text', text: 'dos' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      makeId,
    );
    expect(back[0]?.text).toBe('uno dos');
  });
});

describe('enlaces entre apuntes', () => {
  const asma = { id: 'A', title: 'Asma', nodes: [node('a1', 'Ver [[EPOC]] y [[Tos crónica]]')] };
  const epoc = { id: 'E', title: 'epoc', nodes: [node('e1', 'Parecido a [[ASMA]]')] };
  const all = [asma, epoc];

  it('compara títulos sin mayúsculas, acentos ni espacios de sobra', () => {
    expect(normalizeTitle('  Insuficiencia   CARDÍACA ')).toBe('insuficiencia cardiaca');
  });

  it('resuelve a dónde enlaza un apunte y cuáles títulos no existen', () => {
    expect(resolveLinks(asma, all)).toEqual({ targets: ['E'], missing: ['Tos crónica'] });
  });

  it('un enlace a sí mismo no cuenta', () => {
    const self = { id: 'S', title: 'Yo', nodes: [node('s', '[[yo]]')] };
    expect(resolveLinks(self, [self])).toEqual({ targets: [], missing: [] });
  });

  it('los vínculos de regreso dicen qué línea de qué apunte menciona a este', () => {
    expect(backlinks(asma, all)).toEqual([
      { outlineId: 'E', title: 'epoc', nodeId: 'e1', text: 'Parecido a ASMA' },
    ]);
    expect(backlinks(epoc, all)).toEqual([
      { outlineId: 'A', title: 'Asma', nodeId: 'a1', text: 'Ver EPOC y Tos crónica' },
    ]);
  });

  it('junta las etiquetas de todo el apunte sin repetir', () => {
    expect(
      outlineTags([node('a', 'x #B', node('b', 'y #A #B')), node('c', 'z #Cardio::Arritmias')]),
    ).toEqual(['B', 'A', 'Cardio::Arritmias']);
  });
});

describe('markTokens, lo que el editor resalta', () => {
  const kinds = (text: string) =>
    markTokens(text).map((token) => [token.kind, text.slice(token.start, token.end)]);

  it('marca el separador y las etiquetas y enlaces', () => {
    expect(kinds('Asma >> Salbutamol #Neumo [[EPOC]]')).toEqual([
      ['separator', '>>'],
      ['tag', '#Neumo'],
      ['link', '[[EPOC]]'],
    ]);
  });

  it('marca los huecos solo si la línea es cloze', () => {
    expect(kinds('El {{corazón}} bombea')).toEqual([['cloze', '{{corazón}}']]);
    expect(kinds('Fármaco >> {{beta}} bloqueador')).toEqual([['separator', '>>']]);
  });

  it('marca los tres signos del final de una línea de varias líneas', () => {
    expect(kinds('Causas de IC >>>  ')).toEqual([['multiline', '>>>']]);
  });

  it('una línea sin marcas no resalta nada', () => {
    expect(markTokens('Solo texto')).toEqual([]);
  });
});

describe('cardCountOf', () => {
  it('cuenta las tarjetas que da cada tipo de borrador', () => {
    expect(cardCountOf({ kind: 'basic', front: 'a', back: 'b' })).toBe(1);
    expect(cardCountOf({ kind: 'basic_reverse', front: 'a', back: 'b' })).toBe(2);
    expect(
      cardCountOf({ kind: 'cloze', text: '{{c1::a}} y {{c2::b}} y {{c1::c}}', extra: '' }),
    ).toBe(2);
  });
});
