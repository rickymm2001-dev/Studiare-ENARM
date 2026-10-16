import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { PopulationBaselines } from '@/data/model/contracts';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { topicTaxonomy } from '@/demo/content';
import { buildStudentModel } from '@/engines/studentModel';
import { buildAnalysis } from '../progress/analysis';
import { biasMotives, buildTutorView, type TutorViewInput } from './tutorView';
import { answered, event, minute, option, question } from './testing/fixtures';

const NOW = new Date(minute(60 * 24));

function base(overrides: Partial<TutorViewInput> = {}): TutorViewInput {
  return {
    now: NOW,
    events: [],
    bank: { questions: new Map(), options: new Map(), cases: new Map() },
    questions: [],
    options: [],
    cards: new Map(),
    timeZone: 'America/Merida',
    today: '2026-10-02',
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

describe('vista del tutor', () => {
  it('sin actividad todo calibra y no hay nada que mostrar', () => {
    const view = buildTutorView(base());
    expect(view.confirmed).toEqual([]);
    expect(view.forming).toEqual([]);
    expect(view.recentErrors).toBe(0);
    expect(view.report).toMatchObject({ ready: false, have: 0 });
    expect(view.biasTips).toEqual([]);
    expect(view.baseTopics.get('nephrology')).toBe('endocrinology');
  });

  it('cinco fallos seguros en el mismo tema confirman una hipótesis y tres solo la forman', () => {
    const wrong = option(newId(), false, 'Mala');
    const right = option(newId(), true, 'Buena');
    const questions = Array.from({ length: 5 }, () =>
      question({ id: newId(), topic: 'cardiology' }),
    );
    const options = questions.flatMap((q) => [
      { ...right, id: newId(), questionVersionId: q.id },
      { ...wrong, id: newId(), questionVersionId: q.id },
    ]);
    const wrongOf = (q: (typeof questions)[number]) =>
      options.find((o) => o.questionVersionId === q.id && !o.isCorrect);
    const events: AppEvent[] = [
      event('session_started', { kind: 'practice', config: {} }, minute(60 * 20)),
      ...questions.map((q, index) =>
        answered(q, wrongOf(q)?.id ?? '', false, minute(60 * 20 + index * 3), {
          confidence: 'sure',
        }),
      ),
    ];
    const bank = {
      questions: new Map(questions.map((q) => [q.id, q])),
      options: new Map(options.map((o) => [o.id, o])),
      cases: new Map(),
    };
    const five = buildTutorView(base({ events, bank, questions, options }));
    expect(five.confirmed.map((h) => h.key)).toEqual(['high_confidence_error|cardiology']);
    expect(five.recentErrors).toBe(5);

    // Con solo 3 de los 5 se está formando y faltan 2
    const keep = new Set(questions.slice(0, 3).map((q) => q.id));
    const three = buildTutorView(
      base({
        events: events.filter(
          (e) => e.type !== 'question_answered' || keep.has(e.payload.questionVersionId),
        ),
        bank,
        questions,
        options,
      }),
    );
    expect(three.confirmed).toEqual([]);
    expect(three.forming[0]).toMatchObject({ recentFindings: 3, findingsNeeded: 2 });
  });

  it('con respuestas suficientes pero pocos errores con trampa etiquetada dice cuántos faltan', () => {
    const right = option(newId(), true, 'Buena');
    const wrong = option(newId(), false, 'Mala');
    const questions = Array.from({ length: 25 }, () => question({ id: newId() }));
    const options = questions.flatMap((q) => [
      { ...right, id: newId(), questionVersionId: q.id },
      { ...wrong, id: newId(), questionVersionId: q.id },
    ]);
    const pick = (q: (typeof questions)[number], correct: boolean) =>
      options.find((o) => o.questionVersionId === q.id && o.isCorrect === correct)?.id ?? '';
    // 25 respuestas, 10 de ellas errores en preguntas con un distractor etiquetado
    const events: AppEvent[] = questions.map((q, index) =>
      answered(q, pick(q, index >= 10), index >= 10, minute(60 * 20 + index * 3)),
    );
    const view = buildTutorView(
      base({
        events,
        questions,
        options,
        bank: {
          questions: new Map(questions.map((q) => [q.id, q])),
          options: new Map(options.map((o) => [o.id, o])),
          cases: new Map(),
        },
      }),
    );
    // El resumen ya tiene sus 20 respuestas, pero los consejos piden 40 errores etiquetados
    expect(view.report.ready).toBe(true);
    expect(view.biasTips).toEqual([]);
    expect(view.biasCalibration).toEqual({
      have: 10,
      need: DEFAULT_THRESHOLDS.bias.minTaggedErrors,
    });
  });

  it('sin actividad también calibra el perfil de sesgos desde cero', () => {
    expect(buildTutorView(base()).biasCalibration).toEqual({
      have: 0,
      need: DEFAULT_THRESHOLDS.bias.minTaggedErrors,
    });
  });
});

describe('motivos en los consejos por trampa (B5)', () => {
  it('cada trampa dice el motivo que más marcó en sus errores, con el último de cada error', () => {
    const questions = Array.from({ length: 3 }, () => question({ id: newId() }));
    const trap = (q: (typeof questions)[number]) => ({
      ...option(newId(), false, 'Mala'),
      questionVersionId: q.id,
    });
    const traps = questions.map(trap);
    const [first, second, third] = questions as [
      (typeof questions)[number],
      (typeof questions)[number],
      (typeof questions)[number],
    ];
    const motive = (
      q: (typeof questions)[number],
      cause: 'knowledge' | 'overconfidence',
      at: number,
    ) => event('cause_reported', { targetKind: 'question', targetId: q.id, cause }, at);
    const events: AppEvent[] = [
      answered(first, traps[0]?.id ?? '', false, minute(0)),
      // Cambió de Conocimiento a Exceso de confianza, así que cuenta el último
      motive(first, 'knowledge', minute(1)),
      motive(first, 'overconfidence', minute(2)),
      answered(second, traps[1]?.id ?? '', false, minute(3)),
      motive(second, 'overconfidence', minute(4)),
      answered(third, traps[2]?.id ?? '', false, minute(5)),
      motive(third, 'knowledge', minute(6)),
    ];
    const bank = {
      questions: new Map(questions.map((q) => [q.id, q])),
      options: new Map(traps.map((o) => [o.id, o])),
      cases: new Map(),
    };
    expect(biasMotives(events, bank).get('anchoring')).toEqual({
      motive: 'overconfidence',
      count: 2,
      total: 3,
    });
    // Sin motivos marcados no dice nada
    expect(
      biasMotives(
        events.filter((item) => item.type !== 'cause_reported'),
        bank,
      ).size,
    ).toBe(0);
  });
});

describe('el tutor lee el mismo modelo que Progreso (B14, 4.2)', () => {
  const right = option(newId(), true, 'Buena');
  const wrong = option(newId(), false, 'Mala');
  /** Cuatro sesiones de 44 minutos donde casi todo se falla y los errores caen en el último tercio */
  function tiringSessions() {
    const questions = Array.from({ length: 12 }, () =>
      question({ id: newId(), topic: 'cardiology' }),
    );
    const options = questions.flatMap((q) => [
      { ...right, id: newId(), questionVersionId: q.id },
      { ...wrong, id: newId(), questionVersionId: q.id },
    ]);
    const pick = (q: (typeof questions)[number], correct: boolean) =>
      options.find((o) => o.questionVersionId === q.id && o.isCorrect === correct)?.id ?? '';
    const events: AppEvent[] = [];
    for (let s = 0; s < 4; s += 1) {
      const sessionId = newId();
      const start = 120 * s;
      events.push(
        event('session_started', { kind: 'practice', config: {} }, minute(start), sessionId),
      );
      questions.forEach((q, i) => {
        events.push(
          answered(
            q,
            pick(q, i < 3),
            i < 3,
            minute(start + i * 4 + 1),
            { msToAnswer: 20_000 + i * 6000 },
            sessionId,
          ),
        );
      });
    }
    return {
      events,
      questions,
      options,
      bank: {
        questions: new Map(questions.map((q) => [q.id, q])),
        options: new Map(options.map((o) => [o.id, o])),
        cases: new Map(),
      },
    };
  }
  const population = (state: PopulationBaselines['fatigue']['state']): PopulationBaselines => ({
    available: true,
    runAt: '2026-10-01T10:00:00.000Z',
    bias: {},
    motives: {},
    topics: {},
    indicators: {},
    fatigue: { state, students: 40, longSessions: 220 },
  });
  const modelOf = (data: ReturnType<typeof tiringSessions>, given: PopulationBaselines | null) =>
    buildStudentModel({
      now: NOW,
      timeZone: 'America/Merida',
      desiredRetention: 0.9,
      events: data.events,
      bank: data.bank,
      taxonomy: topicTaxonomy,
      thresholds: DEFAULT_THRESHOLDS,
      population: given,
    });

  it('sin actividad la fatiga calibra y el detector global todavía no está validado', () => {
    const view = buildTutorView(base());
    expect(view.fatigue).toMatchObject({
      state: 'calibrating',
      have: 0,
      validation: 'calibrating',
    });
  });

  it('mientras el detector no esté validado no hay patrones de fatiga, aunque los errores los formen', () => {
    const data = tiringSessions();
    const view = buildTutorView(
      base({ ...data, questions: data.questions, options: data.options }),
    );
    expect(view.fatigue).toMatchObject({ state: 'calibrating', validation: 'calibrating' });
    expect([...view.confirmed, ...view.forming].map((hypothesis) => hypothesis.rule)).not.toContain(
      'fatigue',
    );
  });

  it('con el detector validado los patrones de fatiga vuelven y la fatiga se detecta', () => {
    const data = tiringSessions();
    const model = modelOf(data, population('validated'));
    const view = buildTutorView(
      base({ ...data, questions: data.questions, options: data.options, model }),
    );
    expect(view.fatigue).toMatchObject({
      state: 'ready',
      value: { detected: true },
      validation: 'validated',
    });
    expect(view.confirmed.map((hypothesis) => hypothesis.key)).toContain('fatigue|cardiology');
  });

  it('el informe y los temas débiles son los mismos que ve Progreso, con o sin el modelo ya calculado', () => {
    const data = tiringSessions();
    const input = base({ ...data, questions: data.questions, options: data.options });
    const analysis = buildAnalysis({
      events: data.events,
      bank: data.bank,
      timeZone: 'America/Merida',
      today: input.today,
      now: NOW,
      desiredRetention: 0.9,
      thresholds: DEFAULT_THRESHOLDS,
    });
    const alone = buildTutorView(input);
    const shared = buildTutorView({ ...input, model: analysis.model });
    expect(shared.report).toEqual(alone.report);
    expect(shared.biasCalibration).toEqual(alone.biasCalibration);
    expect(shared.fatigue).toEqual(alone.fatigue);
    // El reto del informe semanal es el tema más débil, el mismo que enseña Progreso
    expect(analysis.weakTopics.map((topic) => topic.key)).toEqual(['cardiology']);
    expect(shared.report.ready && shared.report.challenge?.to).toContain('topic=cardiology');
    expect(analysis.report).toBe(analysis.model.report);
  });

  describe('consejos por sesgo con lo que dice el modelo (4.3)', () => {
    /** 50 errores con cuatro trampas a la vista, 25 a la A y 25 a la B, así que las dos son un patrón */
    function twoTraps() {
      const tags = ['tagA', 'tagB', 'tagC', 'tagD'];
      const questions = Array.from({ length: 50 }, () => question({ id: newId() }));
      const options = questions.flatMap((q) => [
        { ...option(newId(), true, 'Buena'), questionVersionId: q.id },
        ...tags.map((tag) => ({
          ...option(newId(), false, `Trampa ${tag}`),
          biasTag: tag,
          questionVersionId: q.id,
        })),
      ]);
      const events: AppEvent[] = questions.flatMap((q, index) => {
        const mine = options.filter((o) => o.questionVersionId === q.id);
        const chosen = mine.find((o) => o.biasTag === (index < 25 ? 'tagA' : 'tagB'));
        return [
          event(
            'question_shown',
            {
              questionVersionId: q.id,
              shownOptions: mine.map((o, position) => ({ optionVersionId: o.id, position })),
              seed: 'x',
              samplingMode: 'diverse',
              highlightEnabled: true,
              positionInSession: index,
            },
            minute(index * 2),
          ),
          answered(q, chosen?.id ?? '', false, minute(index * 2 + 1)),
        ];
      });
      return {
        events,
        questions,
        options,
        bank: {
          questions: new Map(questions.map((q) => [q.id, q])),
          options: new Map(options.map((o) => [o.id, o])),
          cases: new Map(),
        },
      };
    }

    it('marca las trampas propensas y deja el vocabulario por omisión en trampas', () => {
      const data = twoTraps();
      const view = buildTutorView(base(data));
      expect(view.biasTips.map((tip) => [tip.tag, tip.prone])).toEqual([
        ['tagA', true],
        ['tagB', true],
      ]);
      expect(view.vocabulary).toBe('trap');
      expect(view.biasCalibration).toBeNull();
    });

    it('las propensas van primero en el orden del modelo y el vocabulario sale de él', () => {
      const data = twoTraps();
      const model = buildStudentModel({
        now: NOW,
        timeZone: 'America/Merida',
        desiredRetention: 0.9,
        events: data.events,
        bank: data.bank,
        taxonomy: topicTaxonomy,
        thresholds: DEFAULT_THRESHOLDS,
        vocabulary: 'bias',
      });
      const flipped = {
        ...model,
        model: { ...model.model, bias: { ...model.model.bias, prone: ['tagB'] } },
      };
      const view = buildTutorView(base({ ...data, model: flipped }));
      expect(view.biasTips.map((tip) => [tip.tag, tip.prone])).toEqual([
        ['tagB', true],
        ['tagA', false],
      ]);
      expect(view.vocabulary).toBe('bias');
    });
  });
});
