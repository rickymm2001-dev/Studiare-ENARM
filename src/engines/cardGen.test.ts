import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CARDS_PER_SECTION_MAX,
  checkCard,
  containsQuote,
  drugsIn,
  normalizeForMatch,
  numbersIn,
  simulateCards,
  splitSections,
  type ProposedCard,
} from './cardGen';

const SOURCE =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'Nunca debe usarse en pacientes con una tasa de filtrado glomerular menor de 30 ml/min.';

const card = (overrides: Partial<ProposedCard> = {}): ProposedCard => ({
  kind: 'cloze',
  front: 'La {{c1::metformina}} es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
  back: '',
  quote: 'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
  ...overrides,
});

describe('texto comparable', () => {
  it('ignora mayúsculas, acentos, espacios, comillas y guiones', () => {
    expect(normalizeForMatch('  Diabetes   MELLITUS\n tipo 2 — “primera”  línea ')).toBe(
      'diabetes mellitus tipo 2 - "primera" linea',
    );
  });

  it('une una palabra partida por un guion al final del renglón', () => {
    expect(normalizeForMatch('trata-\nmiento de elección')).toBe('tratamiento de eleccion');
  });

  it('containsQuote exige que la cita exista tal cual en el texto', () => {
    expect(containsQuote(SOURCE, 'la dosis inicial HABITUAL es de 500 mg')).toBe(true);
    expect(containsQuote(SOURCE, 'la dosis inicial habitual es de 850 mg')).toBe(false);
    expect(containsQuote(SOURCE, '   ')).toBe(false);
  });
});

describe('cifras y fármacos', () => {
  it('numbersIn toma las cifras con decimales y unifica la coma decimal', () => {
    expect(numbersIn('0,5 mg/kg cada 6 h, 120/80 mmHg y 1.5 L')).toEqual([
      '0.5',
      '6',
      '120',
      '80',
      '1.5',
    ]);
  });

  it('numbersIn no toma el número de hueco ni dígitos pegados a una letra', () => {
    expect(numbersIn('{{c1::vitamina B12}} y T4 a 25 mg')).toEqual(['25']);
  });

  it('drugsIn reconoce fármacos de la lista y por su terminación, y no confunde palabras comunes', () => {
    expect(drugsIn('Metformina y enalapril con atorvastatina; también insulina')).toEqual([
      'metformina',
      'enalapril',
      'atorvastatina',
      'insulina',
    ]);
    expect(drugsIn('La hormona y el colesterol del alcohol, en el hospital')).toEqual([]);
  });
});

describe('checkCard', () => {
  it('una tarjeta bien anclada pasa', () => {
    expect(checkCard(card(), SOURCE)).toEqual([]);
    expect(
      checkCard(
        {
          kind: 'basic',
          front: '¿Cuál es la dosis inicial habitual de metformina?',
          back: '500 mg cada 12 horas con los alimentos',
          // La cita puede abarcar varias oraciones seguidas. Aquí trae el fármaco y la dosis
          quote:
            'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.',
        },
        SOURCE,
      ),
    ).toEqual([]);
  });

  it('una cita que no está en el texto se rechaza, aunque lo demás cuadre', () => {
    expect(
      checkCard(
        card({ quote: 'La metformina es el tratamiento de primera línea de la obesidad.' }),
        SOURCE,
      ),
    ).toContain('quote_not_in_source');
  });

  it('una cita demasiado corta no ancla nada', () => {
    expect(checkCard(card({ quote: 'metformina' }), SOURCE)).toContain('quote_too_short');
    expect(checkCard(card({ quote: 'La metformina es el' }), SOURCE)).toContain('quote_too_short');
  });

  it('una cifra o dosis que no está en la cita se rechaza', () => {
    const issues = checkCard(
      {
        kind: 'basic',
        front: '¿Cuál es la dosis inicial de metformina?',
        back: '850 mg cada 12 horas con los alimentos',
        quote: 'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.',
      },
      SOURCE,
    );
    expect(issues).toContain('number_not_in_quote');
  });

  it('un fármaco que no está en la cita se rechaza', () => {
    const issues = checkCard(
      {
        kind: 'basic',
        front: '¿Cuál es el tratamiento de primera línea de la diabetes mellitus tipo 2?',
        back: 'Glibenclamida, un fármaco que la cita no menciona',
        quote: 'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
      },
      SOURCE,
    );
    expect(issues).toContain('drug_not_in_quote');
  });

  it('una respuesta que no sale de la cita se marca aunque la cita exista', () => {
    const issues = checkCard(
      {
        kind: 'basic',
        front: '¿Qué pasa?',
        back: 'Respuesta inventada sin relación con el material estudiado',
        quote: 'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.',
      },
      SOURCE,
    );
    expect(issues).toContain('answer_not_grounded');
  });

  it('campos vacíos y huecos mal armados se rechazan', () => {
    expect(checkCard({ ...card(), front: '' }, SOURCE)).toContain('empty_field');
    expect(
      checkCard({ kind: 'basic', front: 'x', back: '  ', quote: card().quote }, SOURCE),
    ).toContain('empty_field');
    expect(checkCard(card({ front: 'Sin huecos aquí, solo texto largo' }), SOURCE)).toContain(
      'cloze_invalid',
    );
    expect(checkCard(card({ front: 'La {{c1::metformina es' }), SOURCE)).toContain('cloze_invalid');
    expect(checkCard(card({ front: 'x'.repeat(3001) }), SOURCE)).toContain('too_long');
  });

  it('una controversia solo se apoya en la lista cerrada, con explicación y sin cambiar la tarjeta', () => {
    const base = card();
    const valid = {
      reason:
        'La frase usa una afirmación absoluta y las guías la matizan, así que conviene revisarla.',
      sources: [{ key: 'gpc_cenetec', locator: 'Capítulo de diabetes' }],
    };
    expect(checkCard({ ...base, controversy: valid }, SOURCE)).toEqual([]);
    expect(checkCard({ ...base, controversy: { ...valid, reason: 'corto' } }, SOURCE)).toContain(
      'controversy_reason_missing',
    );
    expect(checkCard({ ...base, controversy: { ...valid, sources: [] } }, SOURCE)).toContain(
      'controversy_source_missing',
    );
    expect(
      checkCard({ ...base, controversy: { ...valid, sources: [{ key: 'wikipedia' }] } }, SOURCE),
    ).toContain('controversy_source_not_allowed');
    expect(
      checkCard(
        {
          ...base,
          controversy: { ...valid, sources: [{ key: 'harrison' }, { key: 'blog-de-alguien' }] },
        },
        SOURCE,
      ),
    ).toContain('controversy_source_not_allowed');
  });

  it('una cita puede traer saltos de renglón y mayúsculas distintas', () => {
    expect(
      checkCard(
        card({
          quote:
            'LA METFORMINA es el tratamiento\nde primera línea de la diabetes mellitus tipo 2.',
        }),
        SOURCE,
      ),
    ).toEqual([]);
  });
});

describe('splitSections', () => {
  const paragraph = (n: number, size: number) =>
    `Párrafo ${n}. ${'Texto de relleno clínico. '.repeat(size)}`.trim();

  it('un texto corto es una sola sección', () => {
    const sections = splitSections(
      'Un texto corto, pero con suficientes palabras para una tarjeta.',
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ index: 0, title: null });
  });

  it('junta párrafos hasta el máximo y no pierde ni repite texto', () => {
    const text = Array.from({ length: 12 }, (_, index) => paragraph(index, 14)).join('\n\n');
    const sections = splitSections(text, { maxChars: 800, minChars: 200 });
    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.text.length <= 800)).toBe(true);
    const joined = sections.map((section) => section.text).join('\n\n');
    expect(joined.replace(/\s+/g, '')).toBe(text.replace(/\s+/g, ''));
  });

  it('un párrafo más largo que el máximo se parte por oraciones', () => {
    const long = Array.from(
      { length: 40 },
      (_, index) => `Oración número ${index} del texto largo.`,
    ).join(' ');
    const sections = splitSections(long, { maxChars: 300, minChars: 100 });
    expect(sections.length).toBeGreaterThan(3);
    expect(sections.every((section) => section.text.length <= 300)).toBe(true);
  });

  it('una oración sin ningún punto, más larga que el máximo, también se parte', () => {
    const words = Array.from({ length: 200 }, (_, index) => `palabra${index}`).join(' ');
    const sections = splitSections(words, { maxChars: 300, minChars: 100 });
    expect(sections.every((section) => section.text.length <= 300)).toBe(true);
    expect(
      sections
        .map((section) => section.text)
        .join(' ')
        .split(/\s+/),
    ).toHaveLength(200);
  });

  it('un título suelto pasa a ser el nombre de la sección que sigue', () => {
    const sections = splitSections(
      `Diabetes mellitus\n\n${paragraph(1, 20)}\n\nHipertensión arterial\n\n${paragraph(2, 20)}`,
      {
        minChars: 100,
      },
    );
    expect(sections.map((section) => section.title)).toEqual([
      'Diabetes mellitus',
      'Hipertensión arterial',
    ]);
    expect(sections[0]?.text.startsWith('Párrafo 1')).toBe(true);
  });

  it('respeta el máximo de secciones', () => {
    const text = Array.from({ length: 30 }, (_, index) => paragraph(index, 14)).join('\n\n');
    expect(splitSections(text, { maxChars: 400, minChars: 100, maxSections: 5 })).toHaveLength(5);
  });

  it('une una palabra partida con guion al final del renglón dentro del párrafo', () => {
    const [section] = splitSections(
      'El trata-\nmiento de elección es la metformina en muchos casos.',
    );
    expect(section?.text).toContain('tratamiento');
  });

  it('un texto vacío no da secciones', () => {
    expect(splitSections('  \n\n ')).toEqual([]);
  });
});

describe('generador simulado', () => {
  const section = {
    index: 0,
    title: 'Diabetes',
    text:
      SOURCE +
      ' La retinopatía diabética se caracteriza por microaneurismas y hemorragias retinianas en el fondo de ojo.',
  };

  it('da de 1 a 7 tarjetas que pasan su propia revisión contra el texto', () => {
    const cards = simulateCards(section);
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(CARDS_PER_SECTION_MAX);
    for (const proposed of cards) expect(checkCard(proposed, section.text)).toEqual([]);
  });

  it('es determinista', () => {
    expect(simulateCards(section)).toEqual(simulateCards(section));
  });

  it('usa una dosis como hueco y una definición como pregunta y respuesta', () => {
    const cards = simulateCards(section);
    expect(
      cards.some((entry) => entry.kind === 'cloze' && entry.front.includes('{{c1::500 mg}}')),
    ).toBe(true);
    const basic = cards.find((entry) => entry.kind === 'basic');
    expect(basic?.front).toBe('¿Qué caracteriza a La retinopatía diabética?');
  });

  it('una afirmación absoluta lleva una señal de controversia con fuentes de la lista y la tarjeta intacta', () => {
    const flagged = simulateCards(section).find((entry) => entry.controversy);
    expect(flagged?.quote).toContain('Nunca debe usarse');
    expect(flagged?.controversy?.sources.map((entry) => entry.key)).toEqual([
      'gpc_cenetec',
      'harrison',
    ]);
    // El texto de la tarjeta sale de la cita, no de una corrección
    expect(flagged?.front).toContain('Nunca debe usarse');
  });

  it('con una sección sin nada aprovechable no inventa tarjetas', () => {
    expect(
      simulateCards({ index: 0, title: null, text: 'Hola. Gracias. Nos vemos pronto en clase.' }),
    ).toEqual([]);
  });

  it('para cualquier texto, toda tarjeta simulada pasa su revisión', () => {
    fc.assert(
      fc.property(
        fc.array(fc.lorem({ maxCount: 14 }), { minLength: 1, maxLength: 12 }),
        (sentences) => {
          const text = sentences
            .map(
              (sentence, index) =>
                `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}. Dosis ${index + 1} mg al día.`,
            )
            .join(' ');
          const generated = simulateCards({ index: 0, title: null, text });
          for (const proposed of generated) expect(checkCard(proposed, text)).toEqual([]);
        },
      ),
    );
  });
});
