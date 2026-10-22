import { describe, expect, it } from 'vitest';
import {
  backlinks,
  cardCountOf,
  countNodes,
  docToOutline,
  ENARM_TOPIC_TAG_PREFIX,
  FREE_SUBJECT_TAG_PREFIX,
  firstBlankLine,
  freeSubjects,
  isFreeSubjectNote,
  isFreeSubjectTag,
  isSubjectTag,
  markSpan,
  markTokens,
  nodesFromTemplate,
  normalizeTitle,
  numberClozeHoles,
  OUTLINE_LIMITS,
  outlineDepth,
  outlineTags,
  outlineToDoc,
  parseLine,
  pickIdOwners,
  planCards,
  resolveLinks,
  sameSubject,
  subjectTags,
  withSubjectTags,
  type OutlineNode,
} from './outline';

let counter = 0;
const makeId = () => `gen-${(counter += 1)}`;
const node = (id: string, text: string, ...children: OutlineNode[]): OutlineNode => ({
  id,
  text,
  children,
});

describe('pickIdOwners, quién conserva un id repetido', () => {
  it('gana el mayor rango y, entre iguales, el primero', () => {
    const owners = pickIdOwners([
      { id: 'a', rank: 0, item: 'vacío' },
      { id: 'a', rank: 1, item: 'con texto' },
      { id: 'a', rank: 1, item: 'otro con texto' },
      { id: 'b', rank: 0, item: 'único' },
      { id: '', rank: 5, item: 'sin id' },
    ]);
    expect(owners.get('a')).toBe('con texto');
    expect(owners.get('b')).toBe('único');
    expect(owners.has('')).toBe(false);
  });
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

  it('una almohadilla con un número no es etiqueta y el texto no pierde el número', () => {
    const parsed = parseLine('Causa #1 de muerte >> Isquemia');
    expect(parsed.tags).toEqual([]);
    expect(parsed.mark).toMatchObject({ type: 'forward', left: 'Causa #1 de muerte' });
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

  it('entre dos líneas con el mismo id lo conserva la que tiene texto, aunque vaya después', () => {
    const item = (id: string, text: string) => ({
      type: 'listItem',
      attrs: { nodeId: id },
      content: [
        { type: 'paragraph', ...(text === '' ? {} : { content: [{ type: 'text', text }] }) },
      ],
    });
    // Enter al inicio de la línea a: arriba queda el renglón vacío y abajo el texto, los dos con el id a
    const back = docToOutline(
      {
        type: 'doc',
        content: [
          { type: 'bulletList', content: [item('a', ''), item('a', 'Pregunta >> Respuesta')] },
        ],
      },
      makeId,
    );
    expect(back[0]?.text).toBe('');
    expect(back[0]?.id).toMatch(/^gen-/);
    expect(back[1]).toMatchObject({ id: 'a', text: 'Pregunta >> Respuesta' });
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

describe('markSpan, dónde está la marca aunque falte un lado (B6)', () => {
  it('da la marca y su lugar en el texto tal cual', () => {
    expect(markSpan('Asma #Neumo >> Salbutamol')).toEqual({
      type: 'separator',
      separator: '>>',
      start: 12,
      end: 14,
    });
    expect(markSpan('Pregunta >> ')).toMatchObject({ type: 'separator', separator: '>>' });
    expect(markSpan('Causas >>>  ')).toEqual({ type: 'multiline', start: 7, end: 10 });
    expect(markSpan('El {{sodio}} es')).toEqual({ type: 'cloze' });
    expect(markSpan('Nota #Cardio::Arritmias y {{c1::x}} >> y')).toMatchObject({
      type: 'separator',
      separator: '>>',
    });
    expect(markSpan('Sin marca [[A::B]]')).toEqual({ type: 'none' });
  });
});

describe('tema del apunte (B6)', () => {
  it('un tema del ENARM da la etiqueta topic: con su clave', () => {
    expect(
      subjectTags({ kind: 'enarm', branch: 'internal_medicine', topic: 'cardiology' }),
    ).toEqual([`${ENARM_TOPIC_TAG_PREFIX}cardiology`]);
    expect(ENARM_TOPIC_TAG_PREFIX).toBe('topic:');
  });

  it('una materia libre cuelga de Materia y nunca empieza con topic:', () => {
    expect(subjectTags({ kind: 'free', name: 'Anatomía humana' })).toEqual([
      'Materia::Anatomía_humana',
    ]);
    for (const name of ['topic:cardiology', 'Topic:x', '  ']) {
      const tags = subjectTags({ kind: 'free', name });
      expect(tags.some((tag) => tag.toLowerCase().startsWith(ENARM_TOPIC_TAG_PREFIX))).toBe(false);
    }
    expect(subjectTags(null)).toEqual([]);
    expect(subjectTags(undefined)).toEqual([]);
  });

  it('compara temas y sugiere las materias libres ya usadas, sin repetir', () => {
    const enarm = { kind: 'enarm', branch: 'pediatrics', topic: 'neonatology' } as const;
    expect(sameSubject(enarm, { ...enarm })).toBe(true);
    expect(sameSubject(enarm, { ...enarm, topic: 'immunizations' })).toBe(false);
    expect(sameSubject(null, undefined)).toBe(true);
    expect(sameSubject({ kind: 'free', name: 'A' }, null)).toBe(false);
    expect(
      freeSubjects([
        { subject: { kind: 'free', name: 'Fisiología' } },
        { subject: { kind: 'free', name: 'anatomía' } },
        { subject: { kind: 'free', name: 'Anatomia ' } },
        { subject: enarm },
        { subject: null },
        {},
      ]),
    ).toEqual(['anatomía', 'Fisiología']);
  });

  it('reconoce las etiquetas de un tema y las notas de una materia libre', () => {
    expect(FREE_SUBJECT_TAG_PREFIX).toBe('Materia::');
    expect(isFreeSubjectTag('Materia::Anatomía')).toBe(true);
    expect(isFreeSubjectTag('materia::anatomía')).toBe(true);
    expect(isFreeSubjectTag('Materia')).toBe(false);
    expect(isFreeSubjectTag('Rama::Materia::Tema')).toBe(false);
    expect(isSubjectTag('topic:cardiology')).toBe(true);
    expect(isSubjectTag('MATERIA::Fisiología')).toBe(true);
    expect(isSubjectTag('Generada_con_IA')).toBe(false);
    // Cada etiqueta que da una materia libre cuenta como de materia libre
    expect(isFreeSubjectNote(subjectTags({ kind: 'free', name: 'Anatomía humana' }))).toBe(true);
    expect(isFreeSubjectNote(['Materia::Anatomía', 'Hueso'])).toBe(true);
    // Con un tema del ENARM cuenta en el ENARM aunque la línea traiga Materia::
    expect(isFreeSubjectNote(['topic:cardiology', 'Materia::Repaso'])).toBe(false);
    expect(isFreeSubjectNote(['Hueso'])).toBe(false);
    expect(isFreeSubjectNote([])).toBe(false);
  });

  it('cambia el tema de una nota que sigue al apunte sin tocar sus demás etiquetas', () => {
    const tags = ['topic:endocrinology', 'Generada_con_IA', 'Tratamiento'];
    expect(withSubjectTags(tags, { kind: 'free', name: 'Farmacología' })).toEqual([
      'Materia::Farmacología',
      'Generada_con_IA',
      'Tratamiento',
    ]);
    expect(
      withSubjectTags(['Materia::Vieja', 'materia::Otra', 'Tratamiento'], {
        kind: 'enarm',
        branch: 'internal_medicine',
        topic: 'cardiology',
      }),
    ).toEqual(['topic:cardiology', 'Tratamiento']);
    expect(withSubjectTags(tags, null)).toEqual(['Generada_con_IA', 'Tratamiento']);
    // Con el mismo tema queda igual
    const same = { kind: 'enarm', branch: 'internal_medicine', topic: 'endocrinology' } as const;
    expect(withSubjectTags(tags, same)).toEqual(tags);
  });
});

describe('plantillas (B6)', () => {
  it('arma el árbol con un id por línea y encuentra la primera línea en blanco', () => {
    let next = 0;
    const nodes = nodesFromTemplate(
      [{ text: 'Ideas clave', children: [{ text: '' }] }, { text: 'Dudas' }],
      () => `id-${(next += 1)}`,
    );
    expect(nodes).toEqual([
      { id: 'id-1', text: 'Ideas clave', children: [{ id: 'id-2', text: '', children: [] }] },
      { id: 'id-3', text: 'Dudas', children: [] },
    ]);
    expect(firstBlankLine(nodes)).toBe('id-2');
    expect(firstBlankLine([node('a', 'Lleno')])).toBeNull();
    // Una plantilla no trae marcas, así que no crea tarjetas sola
    expect(planCards(nodes).plans).toEqual([]);
  });
});

describe('líneas hechas para congelar al leerlas', () => {
  /** Mide cuánto tarda algo. Con el arreglo todas bajan de 200 ms y sin él tardan segundos o minutos */
  const elapsed = (run: () => void) => {
    const start = performance.now();
    run();
    return performance.now() - start;
  };

  it('una línea con decenas de miles de espacios al final se lee casi al instante', () => {
    const line = `- a${' '.repeat(80_000)}b`;
    expect(elapsed(() => parseLine(line))).toBeLessThan(1000);
    expect(elapsed(() => markSpan(line))).toBeLessThan(1000);
  });

  it('una etiqueta con miles de signos de puntuación seguidos no congela y se recorta igual', () => {
    const line = `Tema #t${'.'.repeat(60_000)}x y #corta..`;
    expect(elapsed(() => parseLine(line))).toBeLessThan(1000);
    expect(parseLine('Tema #corta... y más').tags).toEqual(['corta']);
    expect(parseLine('Tema (ver #corta); y más').tags).toEqual(['corta']);
  });

  it('una línea con decenas de miles de etiquetas se lee casi al instante', () => {
    const line = Array.from({ length: 30_000 }, (_, index) => `#t${index}a`).join(' ');
    expect(elapsed(() => parseLine(`${line} Pregunta :: Respuesta`))).toBeLessThan(2000);
  });

  it('muchos {{ sin cerrar no hacen cuadrática la búsqueda de huecos', () => {
    const line = '{{ '.repeat(40_000);
    expect(numberClozeHoles(line)).toBeNull();
    expect(elapsed(() => markSpan(line))).toBeLessThan(1000);
    expect(numberClozeHoles('La {{penicilina}} y la {{ampicilina}}')).toBe(
      'La {{c1::penicilina}} y la {{c2::ampicilina}}',
    );
  });
});
