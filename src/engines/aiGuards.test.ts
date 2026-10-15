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
  predictsScore,
  sentenceCount,
  usesBiasWord,
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

  it('deja repetir un tema de psiquiatría del banco, pero no atribuírselo al alumno (B12)', () => {
    const bank =
      'Mujer de 30 años con trastorno depresivo mayor y ansiedad. Se inicia terapia con un antidepresivo.';
    expect(
      mentionsMentalHealth('Confundes el trastorno depresivo mayor con la ansiedad.', bank),
    ).toBe(false);
    expect(mentionsMentalHealth('Ingresa a terapia intensiva.', 'Pasa a terapia intensiva.')).toBe(
      false,
    );
    for (const opinion of [
      'Parece que tienes ansiedad antes del examen.',
      'Estás muy deprimido con este tema.',
      'Tu ansiedad te hace fallar el trastorno depresivo.',
      'Sufres de trastorno de ansiedad.',
    ]) {
      expect(mentionsMentalHealth(opinion, bank), opinion).toBe(true);
    }
    // Un término que el banco no trae sigue contando, aunque el resto sí venga
    expect(mentionsMentalHealth('Hay depresión y burnout en estos casos.', bank)).toBe(true);
  });
});

describe('salud mental, atribuciones al alumno (B12, revisión del hallazgo 4)', () => {
  // Las seis frases del informe. Antes pasaban todas, porque la guarda solo probaba las frases al
  // alumno si la frase ya traía un término de la lista general
  const attributed = [
    'Te sientes triste por los errores.',
    'Estás muy estresado con esto.',
    'Se nota que estás agotado.',
    'Tu ánimo no ayuda.',
    'Tu estrés sube en las sesiones largas.',
    'Pareces angustiado al contestar.',
  ];

  it('rechaza atribuirle un estado al alumno aunque la frase no traiga un término de la lista', () => {
    for (const text of attributed) expect(mentionsMentalHealth(text), text).toBe(true);
    for (const text of [
      'Tienes mucho estrés con el examen.',
      'Sufres de estrés cuando el reloj corre.',
      'Sientes tristeza al fallar.',
      'Eres muy ansioso con las preguntas largas.',
      'Cuando estés estresada, respira.',
      'Andas un poco agotada esta semana.',
      'Te ves deprimido después de los simulacros.',
      'Tu tristeza afecta tu ritmo.',
    ]) {
      expect(mentionsMentalHealth(text), text).toBe(true);
    }
  });

  it('también las rechaza dentro de un texto más largo y aunque el banco hable de psiquiatría', () => {
    const bank = 'Mujer con trastorno depresivo mayor, ansiedad y estrés postraumático.';
    expect(
      mentionsMentalHealth(
        'Repasa la dosis de sertralina. Se nota que estás agotado. Sigue con las tarjetas.',
        bank,
      ),
    ).toBe(true);
    expect(mentionsMentalHealth('Tu ánimo no ayuda.', bank)).toBe(true);
  });

  it('no bloquea el estrés ni el ánimo cuando no son del alumno, ni el texto del banco', () => {
    const bank =
      'Mujer de 30 años con trastorno depresivo mayor, ansiedad y estrés postraumático. Recibe terapia cognitiva.';
    for (const text of [
      'El estrés oxidativo daña las membranas celulares.',
      'Con estrés de tiempo, descarta primero las opciones imposibles.',
      'Entrena el manejo del estrés ante el reloj del simulador.',
      'El ánimo bajo es un criterio del trastorno depresivo mayor.',
      'Una paciente triste y con anhedonia no descarta la ansiedad.',
      'Confundes el trastorno depresivo mayor con la ansiedad.',
      'La paciente estresada por el trabajo presenta insomnio.',
      'Estas tarjetas están agotadas por hoy.',
      'Estás cerca de terminar el repaso.',
      'Eres capaz de resolver este tipo de pregunta.',
      'Tienes que revisar la tabla de dosis.',
      'Tu estrategia de descarte funciona.',
      'Tu ritmo de estudio bajó esta semana.',
      'Haz una pausa de cinco minutos cada hora.',
    ]) {
      expect(mentionsMentalHealth(text, bank), text).toBe(false);
    }
  });

  it('las guardas de cada motor las rechazan con mental_health_opinion', () => {
    const hypothesis = hypothesisInput();
    const base: HypothesisOutput = {
      hypothesis: 'Confundes los antibióticos de la neumonía típica con los de la atípica.',
      evidence: ['q-01', 'q-02'],
      confidence: 'low',
      actions: ['create_contrast_card'],
      studentMessage: 'Compara ambos tratamientos lado a lado. Fíjate en el dato que distingue.',
    };
    expect(guardHypothesis(base, hypothesis).passed).toBe(true);
    const report = weeklyReportInput();
    const goodReport = mockOutput('weekly_report', report);
    const tipInput = biasTipInput();
    const goodTip = mockOutput('bias_tips', tipInput);
    for (const text of attributed) {
      const message = `Compara ambos tratamientos lado a lado. ${text}`;
      expect(
        guardHypothesis({ ...base, studentMessage: message }, hypothesis).issues,
        text,
      ).toContain('mental_health_opinion');
      expect(
        guardWeeklyReport(
          { ...goodReport, summary: `Respondiste varias preguntas. ${text}` },
          report,
        ).issues,
        text,
      ).toContain('mental_health_opinion');
      expect(guardBiasTip({ ...goodTip, tip: text }, tipInput).issues, text).toContain(
        'mental_health_opinion',
      );
    }
  });
});

describe('predicción del puntaje (B12)', () => {
  it('detecta un puntaje estimado, una plaza o un percentil futuro', () => {
    for (const text of [
      'Con este ritmo obtendrás un puntaje de 70 en el ENARM.',
      'Tu puntaje estimado ya alcanza para una plaza.',
      'Tienes buenas posibilidades de aprobar.',
      'Así aumenta tu probabilidad de quedar en el ENARM.',
      'Si sigues así vas a quedar seleccionado.',
      'Vas a aprobar el ENARM sin problema.',
      'Quedarás en el percentil 90 de tu generación.',
      'Tu percentil sube cada semana.',
      'Serás seleccionada en la especialidad que quieres.',
      'Tu calificación proyectada es de las más altas.',
      'Con esto lograrás más aciertos en el examen.',
      'Tu resultado en el ENARM será mejor.',
    ]) {
      expect(predictsScore(text), text).toBe(true);
    }
  });

  it('deja pasar lo que habla del examen sin predecir nada', () => {
    for (const text of [
      'Esta semana respondiste 120 preguntas. Estas son las prioridades para la que sigue.',
      'En el ENARM tendrás casos así.',
      'Es probable que el ENARM pregunte este tema.',
      'Llegarás mejor preparado al examen.',
      'La escala de Alvarado con una puntuación de 7 o más sugiere el diagnóstico.',
      'Revisa el puntaje de Apgar del recién nacido.',
      'La probabilidad de quedar con secuelas baja con la reperfusión temprana.',
      'Practica el tema en el simulador a ritmo de examen.',
    ]) {
      expect(predictsScore(text), text).toBe(false);
    }
  });
});

describe('vocabulario de sesgo o trampa (B12)', () => {
  it('reconoce la palabra sesgo con o sin acento ni plural', () => {
    expect(usesBiasWord('Este sesgo te hace fallar')).toBe(true);
    expect(usesBiasWord('Los SESGOS más comunes')).toBe(true);
    expect(usesBiasWord('Una lectura sesgada del caso')).toBe(true);
    expect(usesBiasWord('Esta trampa te hace fallar')).toBe(false);
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

  it('acepta un patrón de psiquiatría que repite los términos del banco (B12)', () => {
    const psychiatry = hypothesisInput({
      area: 'Trastorno depresivo mayor',
      evidence: [
        { ref: 'q-31', kind: 'question', text: 'Mujer con trastorno depresivo mayor y ansiedad.' },
        { ref: 'q-32', kind: 'question', text: 'Hombre con depresión y riesgo suicida.' },
      ],
    });
    const output: HypothesisOutput = {
      ...good,
      hypothesis: 'En trastorno depresivo mayor confundes la depresión con la ansiedad.',
      evidence: ['q-31', 'q-32'],
    };
    expect(guardHypothesis(output, psychiatry)).toEqual({ passed: true, issues: [] });
    const opinion = {
      ...output,
      studentMessage: 'Parece que tienes ansiedad con este tema. Repasa los criterios con calma.',
    };
    expect(guardHypothesis(opinion, psychiatry).issues).toEqual(['mental_health_opinion']);
  });

  it('rechaza predecir el puntaje del ENARM (B12)', () => {
    const promise = {
      ...good,
      studentMessage:
        'Compara ambos tratamientos lado a lado. Así obtendrás un mejor puntaje en el ENARM.',
    };
    expect(guardHypothesis(promise, input).issues).toEqual(['score_prediction']);
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

  it('rechaza un puntaje estimado, una plaza o un percentil futuro (B12)', () => {
    for (const summary of [
      'Esta semana respondiste 120 preguntas. Con esto tu puntaje estimado sube.',
      'Esta semana respondiste 120 preguntas. Vas por buen camino para obtener una plaza y tus posibilidades de aprobar crecen.',
      'Esta semana respondiste 120 preguntas. Quedarás en el percentil más alto.',
    ]) {
      expect(guardWeeklyReport({ ...good, summary }, input).issues, summary).toEqual([
        'score_prediction',
      ]);
    }
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

  it('rechaza predecir el puntaje (B12)', () => {
    const tip = {
      tip: 'Nombra el dato que no encaja y vas a aprobar el ENARM.',
      exampleRefs: ['q-10', 'q-11'],
    };
    expect(guardBiasTip(tip, input).issues).toEqual(['score_prediction']);
  });

  it('rechaza la palabra sesgo mientras el alumno ve trampas, también sin vocabulario (B12)', () => {
    const tip = {
      tip: 'Este sesgo de anclaje te hace fallar. Nombra el dato que no encaja.',
      exampleRefs: ['q-10', 'q-11'],
    };
    expect(guardBiasTip(tip, input).issues).toEqual(['vocabulary']);
    expect(guardBiasTip(tip, biasTipInput({ vocabulary: 'trampa' })).issues).toEqual([
      'vocabulary',
    ]);
    expect(guardBiasTip(tip, biasTipInput({ vocabulary: 'sesgo' })).passed).toBe(true);
    const trap = { ...tip, tip: 'Esta trampa de anclaje te hace fallar. Nombra el dato.' };
    expect(guardBiasTip(trap, input).passed).toBe(true);
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

  it('acepta reestructurar una pregunta de psiquiatría o con terapia intensiva (B12)', () => {
    const sample = restructureInput({
      transform: 'change_anchor',
      stem: 'Mujer de 30 años con trastorno depresivo mayor y ansiedad que ingresa a terapia intensiva. ¿Qué sigue?',
    });
    expect(guardRestructure(mockOutput('restructure', sample), sample)).toEqual({
      passed: true,
      issues: [],
    });
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
