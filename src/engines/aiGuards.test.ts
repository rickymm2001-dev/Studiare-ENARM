import { describe, expect, it } from 'vitest';
import {
  AI_ENGINES,
  ENGINE_CONTRACTS,
  type FlashcardsOutput,
  type HypothesisOutput,
  type WeeklyReportOutput,
} from './aiContracts';
import {
  guardBiasTip,
  guardFlashcards,
  guardHypothesis,
  guardOutput,
  guardRestructure,
  guardWeeklyReport,
  mentionsMentalHealth,
  sentenceCount,
} from './aiGuards';
import { mockOutput } from './aiMock';
import {
  biasTipInput,
  flashcardsInput,
  hypothesisInput,
  restructureInput,
  weeklyReportInput,
} from '@/ai/testing/aiSamples';

describe('texto', () => {
  it('cuenta frases sin cortar una cifra con punto', () => {
    expect(sentenceCount('La meta es 7.5 en adultos. Revísala cada tres meses.')).toBe(2);
    expect(sentenceCount('Una sola frase sin punto final')).toBe(1);
    expect(sentenceCount('¿Qué pasa? Nada. ¡Listo!')).toBe(3);
  });

  it('detecta opiniones de salud mental aunque lleven acento', () => {
    expect(mentionsMentalHealth('Parece que tienes ansiedad')).toBe(true);
    expect(mentionsMentalHealth('Tu autoestima está baja')).toBe(true);
    expect(mentionsMentalHealth('Revisa la explicación de esos casos')).toBe(false);
  });
});

describe('hipótesis', () => {
  const input = hypothesisInput();
  const good: HypothesisOutput = {
    hypothesis: 'Confundes los antibióticos de la neumonía típica con los de la atípica.',
    evidence: ['q-01', 'q-02'],
    confidence: 'low',
    actions: ['create_contrast_card'],
    studentMessage:
      'Compara ambos tratamientos lado a lado. Fíjate en el dato que distingue a cada neumonía.',
  };

  it('deja pasar una hipótesis anclada', () => {
    expect(guardHypothesis(good, input)).toEqual({ passed: true, issues: [] });
  });

  it('acepta que no haya hipótesis si no trae nada más', () => {
    const empty: HypothesisOutput = {
      hypothesis: null,
      evidence: [],
      confidence: 'low',
      actions: [],
      studentMessage: null,
    };
    expect(guardHypothesis(empty, input).passed).toBe(true);
    expect(guardHypothesis({ ...empty, actions: ['suggest_break'] }, input).issues).toEqual([
      'inconsistent_empty',
    ]);
  });

  it('rechaza evidencia inventada, o ausente', () => {
    expect(guardHypothesis({ ...good, evidence: ['q-99'] }, input).issues).toContain(
      'evidence_not_in_input',
    );
    expect(guardHypothesis({ ...good, evidence: [] }, input).issues).toContain('evidence_missing');
  });

  it('rechaza una acción fuera de las que la app puede ejecutar para la regla', () => {
    expect(guardHypothesis({ ...good, actions: ['suggest_break'] }, input).issues).toEqual([
      'action_not_allowed',
    ]);
  });

  it('rechaza cifras y fármacos que los ítems no traen', () => {
    const withDose = {
      ...good,
      studentMessage: 'Usa ceftriaxona en lugar de amoxicilina. Son 3 días de tratamiento.',
    };
    expect(guardHypothesis(withDose, input).issues).toContain('new_medical_fact');
  });

  it('rechaza opinar sobre la salud mental del alumno', () => {
    const opinion = {
      ...good,
      studentMessage: 'Parece que tienes mucha ansiedad. Descansa un poco por favor.',
    };
    expect(guardHypothesis(opinion, input).issues).toEqual(['mental_health_opinion']);
  });

  it('pide una frase de hipótesis y de dos a tres frases de mensaje', () => {
    expect(
      guardHypothesis({ ...good, hypothesis: 'Una frase. Y otra más.' }, input).issues,
    ).toContain('hypothesis_not_one_sentence');
    expect(guardHypothesis({ ...good, studentMessage: 'Solo una frase.' }, input).issues).toEqual([
      'message_sentences',
    ]);
    expect(guardHypothesis({ ...good, studentMessage: null }, input).issues).toEqual([
      'message_sentences',
    ]);
    expect(
      guardHypothesis(
        { ...good, studentMessage: 'Uno aquí. Dos aquí. Tres aquí. Cuatro aquí.' },
        input,
      ).issues,
    ).toEqual(['message_sentences']);
  });
});

describe('informe semanal', () => {
  const input = weeklyReportInput();
  const good: WeeklyReportOutput = {
    summary: 'Esta semana respondiste 120 preguntas. Estas son las prioridades.',
    priorities: input.priorities.map((line) => ({ ref: line.ref, text: line.detail })),
    habit: 'Haz una pausa corta.',
    challenge: 'Practica diez preguntas.',
  };

  it('deja pasar un informe que repite lo calculado', () => {
    expect(guardWeeklyReport(good, input)).toEqual({ passed: true, issues: [] });
  });

  it('rechaza prioridades que no vinieron o que se repiten o faltan', () => {
    const unknown = {
      ...good,
      priorities: [{ ref: 'zzz', text: 'x' }, ...good.priorities.slice(1)],
    };
    expect(guardWeeklyReport(unknown, input).issues).toContain('ref_not_in_input');
    const fewer = { ...good, priorities: good.priorities.slice(0, 2) };
    expect(guardWeeklyReport(fewer, input).issues).toEqual(['priorities_mismatch']);
    const repeated = { ...good, priorities: [good.priorities[0], ...good.priorities.slice(0, 2)] };
    expect(guardWeeklyReport(repeated as WeeklyReportOutput, input).issues).toContain(
      'priorities_mismatch',
    );
  });

  it('no deja hablar de una sección que sigue calibrando', () => {
    const calibrating = weeklyReportInput({ habit: null, challenge: null });
    expect(guardWeeklyReport(good, calibrating).issues).toEqual(['section_not_provided']);
    expect(guardWeeklyReport({ ...good, habit: null, challenge: null }, calibrating).passed).toBe(
      true,
    );
  });

  it('rechaza cifras nuevas y opiniones de salud mental', () => {
    expect(
      guardWeeklyReport({ ...good, summary: 'Respondiste 450 preguntas. Vas muy bien.' }, input)
        .issues,
    ).toEqual(['new_medical_fact']);
    expect(
      guardWeeklyReport({ ...good, challenge: 'Cuida tu salud mental esta semana.' }, input).issues,
    ).toEqual(['mental_health_opinion']);
  });
});

describe('consejo por sesgo', () => {
  const input = biasTipInput();

  it('deja pasar el texto base personalizado', () => {
    expect(guardBiasTip(mockOutput('bias_tips', input), input).passed).toBe(true);
  });

  it('rechaza ejemplos que no vinieron, repetidos, hechos nuevos y salud mental', () => {
    const tip = { tip: 'Nombra el dato que no encaja.', exampleRefs: ['q-10', 'q-11'] };
    expect(guardBiasTip({ ...tip, exampleRefs: ['q-10', 'q-77'] }, input).issues).toEqual([
      'ref_not_in_input',
    ]);
    expect(guardBiasTip({ ...tip, exampleRefs: ['q-10', 'q-10'] }, input).issues).toEqual([
      'examples_count',
    ]);
    expect(
      guardBiasTip({ ...tip, tip: 'Da 40 mg de digoxina al paciente.' }, input).issues,
    ).toEqual(['new_medical_fact']);
    expect(guardBiasTip({ ...tip, tip: 'Tienes un trastorno de atención.' }, input).issues).toEqual(
      ['mental_health_opinion'],
    );
  });
});

describe('tarjetas', () => {
  const input = flashcardsInput();
  const valid: FlashcardsOutput['cards'][number] = {
    kind: 'basic',
    front: '¿Cuál es el tratamiento inicial de elección en la diabetes mellitus tipo 2?',
    back: 'La metformina',
    quote: 'La metformina es el tratamiento inicial de elección en la diabetes mellitus tipo 2.',
  };

  it('deja pasar la tarjeta anclada y no descarta nada', () => {
    const guarded = guardFlashcards({ cards: [valid] }, input);
    expect(guarded.cards).toEqual([valid]);
    expect(guarded.dropped).toBe(0);
    expect(guarded.result).toEqual({ passed: true, issues: [] });
  });

  it('descarta la tarjeta con cita inventada, dosis nueva, fármaco nuevo o respuesta sin apoyo', () => {
    const fakeQuote = {
      ...valid,
      quote: 'La insulina es el tratamiento inicial de elección siempre.',
    };
    const newDose = { ...valid, back: 'La metformina, 2000 mg al día' };
    const newDrug = { ...valid, back: 'La metformina junto con insulina' };
    const ungrounded = { ...valid, back: 'Cambios intensivos del estilo de vida personalizados' };
    const guarded = guardFlashcards(
      { cards: [valid, fakeQuote, newDose, newDrug, ungrounded] },
      input,
    );
    expect(guarded.cards).toEqual([valid]);
    expect(guarded.dropped).toBe(4);
    expect(guarded.result.issues).toEqual(
      expect.arrayContaining([
        'quote_not_in_source',
        'number_not_in_quote',
        'drug_not_in_quote',
        'answer_not_grounded',
      ]),
    );
    expect(guarded.result.passed).toBe(true);
  });

  it('revisa la respuesta de un cloze por sus huecos', () => {
    const cloze = {
      kind: 'cloze' as const,
      front:
        'La {{c1::metformina}} es el tratamiento inicial de elección en la diabetes mellitus tipo 2.',
      back: '',
      quote: valid.quote,
    };
    const wrong = { ...cloze, front: 'La {{c1::glargina}} es el tratamiento inicial de elección.' };
    expect(guardFlashcards({ cards: [cloze] }, input).cards).toEqual([cloze]);
    expect(guardFlashcards({ cards: [wrong] }, input).result.issues).toEqual([
      'answer_not_grounded',
    ]);
  });

  it('no pasa si todas se descartaron, pero sí si no había ninguna', () => {
    expect(guardFlashcards({ cards: [] }, input).result.passed).toBe(true);
    const bad = { ...valid, quote: 'Una frase que el texto no contiene para nada.' };
    expect(guardFlashcards({ cards: [bad] }, input).result.passed).toBe(false);
    const noSources = { ...valid, controversy: { reason: 'x'.repeat(30), sources: [] } };
    expect(guardFlashcards({ cards: [noSources] }, input).result.issues).toEqual([
      'controversy_invalid',
    ]);
    const outside = {
      ...valid,
      controversy: { reason: 'x'.repeat(30), sources: [{ key: 'wikipedia' }] },
    };
    const keys = new Set(['harrison', 'nom']);
    expect(guardFlashcards({ cards: [outside] }, input).cards).toEqual([outside]);
    expect(guardFlashcards({ cards: [outside] }, input, { sourceKeys: keys }).cards).toEqual([]);
    const inside = {
      ...outside,
      controversy: { reason: 'x'.repeat(30), sources: [{ key: 'nom' }] },
    };
    expect(guardFlashcards({ cards: [inside] }, input, { sourceKeys: keys }).cards).toEqual([
      inside,
    ]);
  });
});

describe('pregunta reestructurada', () => {
  const input = restructureInput();
  const good = mockOutput('restructure', input);

  it('deja pasar la propuesta del simulado en cada transformación', () => {
    for (const transform of ['to_except', 'change_anchor', 'next_step'] as const) {
      const sample = restructureInput({ transform });
      expect(guardRestructure(mockOutput('restructure', sample), sample)).toEqual({
        passed: true,
        issues: [],
      });
    }
  });

  it('pide letras únicas y una sola clave', () => {
    const twoKeys = { ...good, options: good.options.map((o) => ({ ...o, isKey: true })) };
    expect(guardRestructure(twoKeys, input).issues).toContain('key_count');
    const sameLabel = { ...good, options: good.options.map((o) => ({ ...o, label: 'A' })) };
    expect(guardRestructure(sameLabel, input).issues).toContain('option_labels');
  });

  it('rechaza una pregunta que no cambió y una excepción sin forma de excepción', () => {
    const same = { ...good, stem: input.stem, options: input.options };
    expect(guardRestructure(same, input).issues).toEqual(
      expect.arrayContaining(['unchanged', 'transform_not_applied']),
    );
  });

  it('rechaza cifras y fármacos nuevos, cita inventada, clave sin apoyo y salud mental', () => {
    expect(
      guardRestructure(
        { ...good, explanation: `${good.explanation} Se usan 400 mg de litio.` },
        input,
      ).issues,
    ).toContain('new_medical_fact');
    expect(
      guardRestructure({ ...good, quote: 'Una frase que la explicación nunca dijo así.' }, input)
        .issues,
    ).toContain('quote_not_in_source');
    expect(guardRestructure({ ...good, quote: 'corta' }, input).issues).toContain(
      'quote_too_short',
    );
    const unsupportedKey = {
      ...good,
      options: good.options.map((o) =>
        o.isKey ? { ...o, text: 'Observación estrecha con seguimiento ambulatorio' } : o,
      ),
    };
    expect(guardRestructure(unsupportedKey, input).issues).toContain('answer_not_grounded');
    expect(
      guardRestructure({ ...good, rationale: 'x', stem: `${good.stem} Tiene depresión.` }, input)
        .issues,
    ).toContain('mental_health_opinion');
  });
});

describe('por motor', () => {
  it('cada salida simulada pasa su esquema y su guarda', () => {
    const inputs = {
      forgetting: hypothesisInput(),
      weekly_report: weeklyReportInput(),
      flashcards: flashcardsInput(),
      bias_tips: biasTipInput(),
      restructure: restructureInput(),
    } as const;
    for (const engine of AI_ENGINES) {
      const input = ENGINE_CONTRACTS[engine].input.parse(inputs[engine]);
      const output = ENGINE_CONTRACTS[engine].output.parse(mockOutput(engine, input as never));
      expect(guardOutput(engine, output as never, input as never), engine).toEqual({
        passed: true,
        issues: [],
      });
    }
  });

  it('rechaza un motor que no existe', () => {
    expect(() => guardOutput('otro' as never, {} as never, {} as never)).toThrow('Motor');
  });
});
