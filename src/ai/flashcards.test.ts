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
  const STUDENT = '01HZX0000000000000000000AA';
  const options = { studentRef: STUDENT, names: ['Ana López'] };

  it('generatorFor usa el proxy con clave y en simulado y el generador del cliente en los demás casos', () => {
    expect(generatorFor({ kind: 'real' }, options).mode).toBe('real');
    expect(generatorFor({ kind: 'mock' }, options).mode).toBe('mock');
    for (const kind of ['no-proxy', 'offline', 'checking'] as const) {
      expect(generatorFor({ kind }, options)).toBe(simulatedGenerator);
    }
  });

  const section = { index: 0, title: 'Diabetes', text: TEXT };
  const goodCard = {
    kind: 'cloze' as const,
    front:
      'La {{c1::metformina}} es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
    back: '',
    quote: 'La metformina es el tratamiento de primera línea de la diabetes mellitus tipo 2.',
  };
  const meta = {
    engine: 'flashcards',
    mode: 'real',
    model: 'claude-sonnet-5-5',
    promptVersion: 'flashcards.provisional.v1',
    inputTokens: 800,
    outputTokens: 300,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    estimatedCostUsd: 0.0046,
    latencyMs: 900,
    outcome: 'ok',
    validator: { passed: true, issues: [] },
  };

  it('el proxy recibe la sección sin datos personales y devuelve tarjetas con su costo', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(Response.json({ output: { cards: [goodCard] }, meta })),
    ) as unknown as typeof fetch;
    const generator = createProxyGenerator({ status: { kind: 'real' }, ...options, fetchImpl });
    expect(generator.model).toBe('proxy');
    const cards = await generator.generate(section);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ kind: 'cloze', controversy: null });
    expect(generator.model).toBe('claude-sonnet-5-5');
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('/api/ai/flashcards');
    const body = JSON.parse(init.body as string) as {
      studentRef: string;
      input: { title: string; text: string };
    };
    expect(body.studentRef).toBe(STUDENT);
    expect(body.input).toMatchObject({ title: 'Diabetes' });
    // Entrega lo que costó y se vacía
    expect(generator.drainMetas?.()).toHaveLength(1);
    expect(generator.drainMetas?.()).toEqual([]);
  });

  it('una respuesta inválida o un error del proxy lanza y deja constancia de lo que costó', async () => {
    const wrong = vi.fn(() =>
      Promise.resolve(Response.json({ output: { cards: [{ kind: 'otro' }] }, meta })),
    ) as unknown as typeof fetch;
    const generator = createProxyGenerator({
      status: { kind: 'real' },
      ...options,
      fetchImpl: wrong,
    });
    await expect(generator.generate(section)).rejects.toThrow('bad_response');
    expect(generator.drainMetas?.()).toHaveLength(1);

    const limited = vi.fn(() =>
      Promise.resolve(
        Response.json(
          {
            error: 'student_limit',
            message: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
          },
          { status: 429 },
        ),
      ),
    ) as unknown as typeof fetch;
    await expect(
      createProxyGenerator({ status: { kind: 'mock' }, ...options, fetchImpl: limited }).generate(
        section,
      ),
    ).rejects.toThrow('student_limit');
  });

  it('el resultado de generar junta lo que costaron las llamadas y cae al simulado si el proxy falla', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(Response.json({ output: { cards: [goodCard] }, meta })),
    ) as unknown as typeof fetch;
    const generator = createProxyGenerator({ status: { kind: 'real' }, ...options, fetchImpl });
    const result = await generateFlashcards({ text: TEXT, generator });
    expect(result.mode).toBe('real');
    expect(result.model).toBe('claude-sonnet-5-5');
    expect(result.promptVersion).toBe('flashcards.provisional.v1');
    expect(result.metas).toHaveLength(1);
    expect(result.proposals).toHaveLength(1);

    const down = vi.fn(() => Promise.reject(new TypeError('sin red'))) as unknown as typeof fetch;
    const fallen = await generateFlashcards({
      text: TEXT,
      generator: createProxyGenerator({ status: { kind: 'real' }, ...options, fetchImpl: down }),
    });
    expect(fallen.fellBack).toBe(true);
    expect(fallen.mode).toBe('template');
    // La llamada que falló queda con su motivo aunque no costó
    expect(fallen.metas).toHaveLength(1);
  });
});
