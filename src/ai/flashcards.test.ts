import { describe, expect, it, vi } from 'vitest';
import type { ProposedCard, SourceSection } from '@/engines/cardGen';
import {
  createProxyGenerator,
  generateFlashcards,
  generatorFor,
  simulatedGenerator,
  type CardGenerator,
} from './flashcards';

const TEXT =
  'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2. ' +
  'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos. ' +
  'Nunca debe usarse con una tasa de filtrado glomerular menor de 30 ml/min.';

const good: ProposedCard = {
  kind: 'cloze',
  front: 'La {{c1::metformina}} es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
  back: '',
  quote: 'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
};

const scripted = (cards: ProposedCard[], seen: SourceSection[] = []): CardGenerator => ({
  mode: 'real',
  model: 'prueba',
  generate: (section) => {
    seen.push(section);
    return Promise.resolve(cards);
  },
});

describe('generateFlashcards', () => {
  it('deja pasar solo lo que aprueba el validador y cuenta lo que descarta', async () => {
    const invented: ProposedCard = {
      ...good,
      quote: 'Una frase que el texto nunca dice, de varias palabras.',
    };
    const wrongDose: ProposedCard = {
      kind: 'basic',
      front: '¿Dosis inicial?',
      back: '850 mg cada 12 horas con los alimentos',
      quote: 'La dosis inicial habitual es de 500 mg cada 12 horas con los alimentos.',
    };
    const result = await generateFlashcards({
      text: TEXT,
      generator: scripted([good, invented, wrongDose]),
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]).toMatchObject({ kind: 'cloze', duplicate: false, sectionIndex: 0 });
    expect(result.rejected).toBe(2);
    // La inventada tampoco trae en su cita el 2 de "tipo 2" que lleva la tarjeta
    expect(result.rejectedBy).toMatchObject({ quote_not_in_source: 1, number_not_in_quote: 2 });
    expect(result.mode).toBe('real');
    expect(result.fellBack).toBe(false);
  });

  it('al generador solo le llega texto sin datos personales y las citas se validan contra ese texto', async () => {
    const seen: SourceSection[] = [];
    const text = `${TEXT} Escribe a ana@correo.com o al 55 1234 5678. Revisó Ana López.`;
    const result = await generateFlashcards({
      text,
      names: ['Ana López'],
      generator: scripted([good], seen),
    });
    const sent = seen.map((section) => section.text).join(' ');
    expect(sent).not.toContain('ana@correo.com');
    expect(sent).not.toContain('1234');
    expect(sent).not.toContain('Ana López');
    expect(sent).toContain('[correo]');
    expect(result.scrubbedTotal).toBe(3);
    expect(result.scrubbed).toMatchObject({ email: 1, phone: 1, name: 1 });
    expect(result.processedText).toBe(sent);
  });

  it('una cita que solo existe en el texto original, con datos personales, no pasa', async () => {
    const result = await generateFlashcards({
      text: 'El correo ana@correo.com pertenece a la paciente que recibió metformina cada día.',
      generator: scripted([
        {
          kind: 'cloze',
          front:
            'El correo ana@correo.com pertenece a la paciente que recibió {{c1::metformina}} cada día.',
          back: '',
          quote:
            'El correo ana@correo.com pertenece a la paciente que recibió metformina cada día.',
        },
      ]),
    });
    expect(result.proposals).toEqual([]);
    expect(result.rejected).toBe(1);
  });

  it('marca las tarjetas que ya tiene el alumno y no las quita', async () => {
    const result = await generateFlashcards({
      text: TEXT,
      generator: scripted([good]),
      existing: [{ id: 'x', kind: 'cloze', text: good.front }],
    });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.duplicate).toBe(true);
  });

  it('una controversia con fuente fuera de la lista descarta la tarjeta y una buena se conserva intacta', async () => {
    const flagged: ProposedCard = {
      ...good,
      controversy: {
        reason:
          'La frase usa una afirmación absoluta y las guías la matizan, así que conviene revisarla.',
        sources: [{ key: 'gpc_cenetec', locator: 'Capítulo 3' }],
      },
    };
    const bad: ProposedCard = {
      ...good,
      controversy: { reason: flagged.controversy?.reason ?? '', sources: [{ key: 'wikipedia' }] },
    };
    const result = await generateFlashcards({ text: TEXT, generator: scripted([flagged, bad]) });
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.controversy).toEqual({
      reason: flagged.controversy?.reason,
      sources: [{ key: 'gpc_cenetec', locator: 'Capítulo 3' }],
    });
    // El texto de la tarjeta es el que mandó el generador, la señal nunca lo cambia
    expect(result.proposals[0]?.front).toBe(good.front);
    expect(result.rejectedBy).toMatchObject({ controversy_source_not_allowed: 1 });
  });

  it('si el proxy falla usa el generador simulado una vez y lo dice', async () => {
    let calls = 0;
    const broken: CardGenerator = {
      mode: 'real',
      model: 'proxy',
      generate: () => {
        calls += 1;
        return Promise.reject(new Error('sin red'));
      },
    };
    const text = `${TEXT}\n\nOtra sección con una oración que menciona 40 mg de metformina cada día para el paciente adulto.`;
    const result = await generateFlashcards({ text, generator: broken, maxSections: 5 });
    expect(calls).toBe(1);
    expect(result.fellBack).toBe(true);
    expect(result.mode).toBe('template');
    expect(result.proposals.length).toBeGreaterThan(0);
  });

  it('si también falla el simulado, falla con un mensaje claro', async () => {
    const broken: CardGenerator = {
      mode: 'template',
      model: 'x',
      generate: () => Promise.reject(new Error('x')),
    };
    await expect(
      generateFlashcards({ text: TEXT, generator: broken, fallback: broken }),
    ).rejects.toThrow('El generador de tarjetas falló');
  });

  it('procesa un máximo de secciones y avisa si cortó', async () => {
    const paragraph = (n: number) => `${'Oración clínica número '.repeat(30)}${n}.`;
    const text = Array.from({ length: 8 }, (_, index) => paragraph(index)).join('\n\n');
    const seen: SourceSection[] = [];
    const result = await generateFlashcards({
      text,
      generator: scripted([], seen),
      maxSections: 2,
    });
    expect(seen).toHaveLength(2);
    expect(result.sections).toBe(2);
    expect(result.sectionsCut).toBe(true);
  });

  it('el generador simulado da siempre lo mismo y todo pasa su validación', async () => {
    const options = { text: TEXT, generator: simulatedGenerator, now: () => 1000 };
    const first = await generateFlashcards(options);
    const second = await generateFlashcards(options);
    expect(first.rejected).toBe(0);
    expect(first.proposals.map(({ id: _id, ...rest }) => rest)).toEqual(
      second.proposals.map(({ id: _id, ...rest }) => rest),
    );
    expect(first.mode).toBe('template');
    expect(first.model).toBe('plantilla-simulada-v1');
  });
});

describe('generadores', () => {
  it('generatorFor usa el proxy solo con clave y el simulado en los demás casos', () => {
    expect(generatorFor({ kind: 'real' }).mode).toBe('real');
    for (const kind of ['mock', 'no-proxy', 'offline', 'checking'] as const) {
      expect(generatorFor({ kind })).toBe(simulatedGenerator);
    }
  });

  it('el proxy recibe la sección y su respuesta se valida con el esquema', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(
        Response.json({
          cards: [
            {
              kind: 'basic',
              front: 'a',
              back: 'b',
              quote: 'una cita de varias palabras',
              controversy: null,
            },
          ],
        }),
      ),
    ) as unknown as typeof fetch;
    const generator = createProxyGenerator(fetchImpl);
    const cards = await generator.generate({ index: 0, title: 'Título', text: 'Texto' });
    expect(cards).toHaveLength(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/ai/flashcards');
    expect(JSON.parse(init.body as string)).toMatchObject({ title: 'Título', text: 'Texto' });
  });

  it('una respuesta que no cumple el esquema o con error del proxy lanza', async () => {
    const wrong = vi.fn(() =>
      Promise.resolve(Response.json({ cards: [{ kind: 'otro' }] })),
    ) as unknown as typeof fetch;
    await expect(
      createProxyGenerator(wrong).generate({ index: 0, title: null, text: 'x' }),
    ).rejects.toThrow();
    const down = vi.fn(() =>
      Promise.resolve(new Response('', { status: 404 })),
    ) as unknown as typeof fetch;
    await expect(
      createProxyGenerator(down).generate({ index: 0, title: null, text: 'x' }),
    ).rejects.toThrow('404');
  });
});
