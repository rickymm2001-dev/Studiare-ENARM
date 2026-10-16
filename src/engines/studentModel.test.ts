import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { PopulationBaselines } from '@/data/model/contracts';
import type { Option, Question } from '@/data/schemas/bank';
import type { TopicTaxonomy } from '@/data/schemas/content';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import {
  answered,
  event,
  minute,
  option,
  question,
  state,
  T0,
} from '@/features/tutor/testing/fixtures';
import { estimateAbility } from './adaptive';
import {
  ABILITY_MIN_ANSWERS,
  buildStudentModel,
  physicianDifficultyOf,
  type DifficultyOf,
  type ModelCard,
  type StudentModelInput,
} from './studentModel';

const DAY = 86_400_000;
const NOW = new Date(T0 + 8 * DAY);

const subtopics = [{ key: 'sub', name: 'Sub' }];
const topic = (key: string, name: string) => ({
  key,
  name,
  weight: 1,
  baseTopic: null,
  subtopics,
});
const taxonomy: TopicTaxonomy = {
  version: 1,
  status: 'pending_physician_review',
  branches: [
    {
      key: 'mi',
      name: 'Medicina interna',
      weight: 1,
      topics: [topic('cardio', 'Cardiología'), topic('endo', 'Endocrinología')],
    },
    { key: 'ped', name: 'Pediatría', weight: 1, topics: [topic('neo', 'Neonatología')] },
    {
      key: 'eng',
      name: 'Inglés médico',
      section: 'english',
      weight: 1,
      topics: [topic('lectura', 'Lectura')],
    },
  ],
};

interface Bundle {
  q: Question;
  right: Option;
  wrong: Option[];
}

/** Una pregunta con su correcta y un distractor por etiqueta */
function bundle(over: Partial<Question> = {}, tags: readonly string[] = ['tagA']): Bundle {
  const q = question({ id: newId(), branch: 'mi', topic: 'cardio', ...over });
  const withQuestion = (o: Option): Option => ({ ...o, id: newId(), questionVersionId: q.id });
  return {
    q,
    right: withQuestion(option('', true, 'Correcta')),
    wrong: tags.map((tag) => ({
      ...withQuestion(option('', false, `Trampa ${tag}`)),
      biasTag: tag,
    })),
  };
}

function lookup(bundles: readonly Bundle[]) {
  return {
    questions: new Map(bundles.map((b) => [b.q.id, b.q])),
    options: new Map(bundles.flatMap((b) => [b.right, ...b.wrong]).map((o) => [o.id, o])),
    cases: new Map(),
  };
}

function base(overrides: Partial<StudentModelInput> = {}): StudentModelInput {
  return {
    now: NOW,
    timeZone: 'America/Merida',
    desiredRetention: 0.9,
    events: [],
    bank: { questions: new Map(), options: new Map(), cases: new Map() },
    taxonomy,
    thresholds: DEFAULT_THRESHOLDS,
    ...overrides,
  };
}

/** Respuestas de un mismo tema, cada una a una pregunta nueva, con tantos aciertos como se pida */
function topicAnswers(
  branch: string,
  topicKey: string,
  correct: number,
  wrong: number,
  startMinute = 0,
) {
  const bundles = Array.from({ length: correct + wrong }, () =>
    bundle({ branch, topic: topicKey }),
  );
  const events = bundles.map((b, index) =>
    index < correct
      ? answered(b.q, b.right.id, true, minute(startMinute + index))
      : answered(b.q, b.wrong[0]?.id ?? '', false, minute(startMinute + index)),
  );
  return { bundles, events };
}

describe('modelo del alumno sin datos', () => {
  const { model, report, weakTopics, responses } = buildStudentModel(base());

  it('cada parte calibra y dice cuánto lleva y cuánto pide', () => {
    expect(model.ability).toEqual({ state: 'calibrating', have: 0, need: ABILITY_MIN_ANSWERS });
    expect(model.motives).toEqual({ state: 'calibrating', have: 0, need: 8 });
    expect(model.pace).toEqual({ state: 'calibrating', have: 0, need: 20 });
    expect(model.consistency).toEqual({ state: 'calibrating', have: 0, need: 7 });
    expect(model.reviewLoad).toEqual({
      state: 'calibrating',
      have: 0,
      need: DEFAULT_THRESHOLDS.daily.minReviewsToMeasure,
    });
    expect(model.fatigue).toMatchObject({ state: 'calibrating', have: 0, need: 3 });
    expect(model.fatigue.validation).toBe('calibrating');
  });

  it('el dominio de cada rama y cada tema de la taxonomía calibra desde cero', () => {
    expect(Object.keys(model.mastery.byBranch)).toEqual(['mi', 'ped', 'eng']);
    expect(model.mastery.byBranch.mi).toEqual({
      state: 'calibrating',
      have: 0,
      need: DEFAULT_THRESHOLDS.structure.minResponsesPerCategory,
    });
    expect(Object.keys(model.mastery.byTopic)).toEqual(['cardio', 'endo', 'neo', 'lectura']);
    expect(model.mastery.byTopic.cardio).toMatchObject({ state: 'calibrating', have: 0 });
  });

  it('no hay temas a reforzar, ni sesgos a los que sea propenso, ni respuestas', () => {
    expect(model.reinforce).toEqual([]);
    expect(weakTopics).toEqual([]);
    expect(responses).toEqual([]);
    expect(model.bias).toEqual({ vocabulary: 'trap', prone: [], baseline: 'chance', byTag: {} });
    expect(report.totals.answers).toBe(0);
  });

  it('dice la hora del cálculo', () => {
    expect(model.asOf).toBe(NOW.toISOString());
  });
});

describe('dominio y temas para reforzar', () => {
  it('un tema con muchos fallos ya muestra su dominio y entra a reforzar con su rama', () => {
    const { bundles, events } = topicAnswers('mi', 'cardio', 3, 27);
    const built = buildStudentModel(base({ events, bank: lookup(bundles) }));
    expect(built.model.mastery.byTopic.cardio).toMatchObject({ state: 'ready' });
    const mastery = built.model.mastery.byTopic.cardio;
    expect(mastery?.state === 'ready' ? mastery.value : 1).toBeLessThan(0.3);
    expect(built.weakTopics).toEqual([
      expect.objectContaining({
        key: 'cardio',
        name: 'Cardiología',
        branch: 'mi',
        branchName: 'Medicina interna',
      }),
    ]);
    expect(built.model.reinforce).toEqual([
      expect.objectContaining({
        key: 'cardio',
        why: 'low_mastery',
        action: 'topic_simulator',
        populationHard: false,
      }),
    ]);
    expect(built.model.mastery.byBranch.mi?.state).toBe('ready');
    expect(built.branches.get('mi')?.tally.trials).toBe(30);
  });

  it('un tema que domina no se refuerza y el de inglés nunca entra', () => {
    const strong = topicAnswers('mi', 'cardio', 28, 2);
    const english = topicAnswers('eng', 'lectura', 3, 27, 100);
    const built = buildStudentModel(
      base({
        events: [...strong.events, ...english.events],
        bank: lookup([...strong.bundles, ...english.bundles]),
      }),
    );
    expect(built.model.mastery.byTopic.cardio?.state).toBe('ready');
    expect(built.model.mastery.byTopic.lectura?.state).toBe('ready');
    expect(built.model.reinforce).toEqual([]);
    expect(built.weakTopics).toEqual([]);
  });

  it('una pregunta que ya no está en el banco no cuenta', () => {
    const ghost = bundle();
    const built = buildStudentModel(
      base({ events: [answered(ghost.q, ghost.right.id, true, minute(0))] }),
    );
    expect(built.responses).toEqual([]);
  });

  describe('el factor de olvido sale de las tarjetas (4.2)', () => {
    // Dos temas con el mismo dominio y el mismo peso en el ENARM. Solo cambia lo que recuerda de sus tarjetas
    const cardio = topicAnswers('mi', 'cardio', 6, 24);
    const endo = topicAnswers('mi', 'endo', 6, 24, 200);
    const events = [...cardio.events, ...endo.events];
    const bank = lookup([...cardio.bundles, ...endo.bundles]);
    const faded: ModelCard[] = Array.from({ length: 4 }, () => ({
      topic: 'endo',
      state: state({ stability: 5, lastReview: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
    }));
    const fresh: ModelCard[] = Array.from({ length: 4 }, () => ({
      topic: 'cardio',
      state: state({ stability: 200, lastReview: new Date(NOW.getTime() - DAY).toISOString() }),
    }));

    it('sin tarjetas el factor vale 1 y empatan, así que el orden es el del tema', () => {
      const built = buildStudentModel(base({ events, bank }));
      expect(built.model.reinforce.map((item) => item.key)).toEqual(['cardio', 'endo']);
      expect(built.model.reinforce[0]?.priority).toBeCloseTo(
        built.model.reinforce[1]?.priority ?? 0,
        6,
      );
    });

    it('el tema cuyas tarjetas se olvidan pasa primero y pide repasarlas', () => {
      const built = buildStudentModel(base({ events, bank, cards: [...fresh, ...faded] }));
      expect(built.model.reinforce.map((item) => [item.key, item.why, item.action])).toEqual([
        ['endo', 'cards_fading', 'review_cards'],
        ['cardio', 'low_mastery', 'topic_simulator'],
      ]);
      expect(built.weakTopics.map((weak) => weak.key)).toEqual(['endo', 'cardio']);
      const [first, second] = built.model.reinforce;
      expect((first?.priority ?? 0) > (second?.priority ?? 0)).toBe(true);
    });

    it('las tarjetas nuevas, sin tema o de un tema que no existe no cambian nada', () => {
      const noise: ModelCard[] = [
        { topic: 'endo', state: null },
        { topic: 'endo', state: state({ state: 'new' }) },
        { topic: null, state: state({ stability: 5 }) },
        { topic: 'no_existe', state: state({ stability: 5 }) },
      ];
      const plain = buildStudentModel(base({ events, bank })).model.reinforce;
      const noisy = buildStudentModel(base({ events, bank, cards: noise })).model.reinforce;
      expect(noisy).toEqual(plain);
    });
  });

  describe('lo que le cuesta a la mayoría (3.7 y 10.36)', () => {
    const cardio = topicAnswers('mi', 'cardio', 3, 27);
    const endo = topicAnswers('mi', 'endo', 3, 27, 200);
    const events = [...cardio.events, ...endo.events];
    const bank = lookup([...cardio.bundles, ...endo.bundles]);
    const population = (students: number, available = true): PopulationBaselines => ({
      available,
      runAt: '2026-10-08T10:00:00.000Z',
      bias: {},
      motives: {},
      topics: {
        'mi/cardio': { students, accuracy: 0.31, difficulty: 0.9 },
        'mi/endo': { students, accuracy: 0.74, difficulty: -0.4 },
        'ped/neo': { students, accuracy: 0.66, difficulty: 0.1 },
        'mi/nefro': { students, accuracy: 0.7, difficulty: 0 },
        'mi/pulmo': { students, accuracy: 0.81, difficulty: -0.5 },
      },
      indicators: {},
      fatigue: { state: 'calibrating', students: 0, longSessions: 0 },
    });

    it('marca los temas del cuarto más bajo de acierto de la población', () => {
      const built = buildStudentModel(base({ events, bank, population: population(60) }));
      expect(built.model.reinforce.map((item) => [item.key, item.populationHard])).toEqual([
        ['cardio', true],
        ['endo', false],
      ]);
    });

    it('con menos de 30 alumnos por tema, o sin población, no marca nada', () => {
      for (const given of [population(29), population(60, false), null]) {
        const built = buildStudentModel(base({ events, bank, population: given }));
        expect(built.model.reinforce.every((item) => !item.populationHard)).toBe(true);
      }
    });

    it('un mínimo de ajustes menor a 30 no baja el piso de privacidad', () => {
      const built = buildStudentModel(
        base({ events, bank, population: population(29), settings: { populationMinStudents: 5 } }),
      );
      expect(built.model.reinforce.every((item) => !item.populationHard)).toBe(true);
    });
  });
});

describe('habilidad dentro del modelo', () => {
  const bundles = Array.from({ length: 12 }, () => bundle());
  const bank = lookup(bundles);
  const measured: DifficultyOf = (q) => ({
    logit: (q.physicianDifficulty - 3) * 0.5,
    state: 'calibrated',
    students: 120,
  });

  it('sin preguntas medidas con alumnos calibra, aunque ya haya respuestas', () => {
    const events = bundles.map((b, index) => answered(b.q, b.right.id, true, minute(index)));
    const built = buildStudentModel(base({ events, bank }));
    expect(built.model.ability).toEqual({
      state: 'calibrating',
      have: 0,
      need: ABILITY_MIN_ANSWERS,
    });
    expect(built.responses.every((response) => response.measured === undefined)).toBe(true);
  });

  it('con 10 primeros intentos a preguntas medidas ya estima y sube con los aciertos', () => {
    const right = buildStudentModel(
      base({
        events: bundles.map((b, i) => answered(b.q, b.right.id, true, minute(i))),
        bank,
        difficultyOf: measured,
      }),
    );
    const wrong = buildStudentModel(
      base({
        events: bundles.map((b, i) => answered(b.q, b.wrong[0]?.id ?? '', false, minute(i))),
        bank,
        difficultyOf: measured,
      }),
    );
    const thetaOf = (build: typeof right) => {
      if (build.model.ability.state !== 'ready') throw new Error('La habilidad debía estar lista');
      return build.model.ability.value;
    };
    expect(thetaOf(right).theta).toBeGreaterThan(0.5);
    expect(thetaOf(wrong).theta).toBeLessThan(-0.5);
    expect(thetaOf(right).se).toBeGreaterThan(0);
    expect(right.responses[0]?.measured).toEqual({ logit: 0, state: 'calibrated', students: 120 });
  });

  it('es la cuenta de adaptive.ts, la que usa Simular, con el mismo resultado exacto', () => {
    // Siete aciertos y cinco fallos, cada uno a una pregunta nueva de dificultad medida
    const right = bundles.slice(0, 7);
    const wrong = bundles.slice(7);
    const events = [
      ...right.map((b, i) => answered(b.q, b.right.id, true, minute(i))),
      ...wrong.map((b, i) => answered(b.q, b.wrong[0]?.id ?? '', false, minute(10 + i))),
    ];
    const built = buildStudentModel(base({ events, bank, difficultyOf: measured }));
    const direct = estimateAbility(
      bundles.map((b, index) => ({ difficulty: measured(b.q).logit, correct: index < 7 })),
    );
    expect(built.model.ability).toEqual({
      state: 'ready',
      value: { theta: direct.theta, se: direct.se },
    });
    // La habilidad del modelo no lleva el conteo de respuestas, que es de quien la estima
    expect(
      Object.keys(built.model.ability.state === 'ready' ? built.model.ability.value : {}),
    ).toEqual(['theta', 'se']);
  });

  it('solo cuenta el primer intento de cada pregunta estable', () => {
    const [first, ...rest] = bundles as [Bundle, ...Bundle[]];
    const events = [
      ...rest.slice(0, 8).map((b, i) => answered(b.q, b.right.id, true, minute(i))),
      // La misma pregunta repetida cuatro veces vale una
      ...[0, 1, 2, 3].map((i) => answered(first.q, first.right.id, true, minute(20 + i))),
    ];
    const built = buildStudentModel(base({ events, bank, difficultyOf: measured }));
    expect(built.model.ability).toEqual({
      state: 'calibrating',
      have: 9,
      need: ABILITY_MIN_ANSWERS,
    });
  });

  it('la dificultad del médico se convierte a logits y no cuenta como medida', () => {
    expect(physicianDifficultyOf(question({ id: newId(), physicianDifficulty: 5 }))).toEqual({
      logit: 2,
      state: 'physician_estimate',
      students: 0,
    });
  });
});

describe('sesgos a los que es propenso (4.2)', () => {
  /** 50 errores, 45 a la trampa A y 5 a la B, con las tres trampas a la vista */
  function errors(count = 50) {
    const bundles = Array.from({ length: count }, () => bundle({}, ['tagA', 'tagB', 'tagC']));
    const events: AppEvent[] = bundles.flatMap((b, index) => {
      const chosen = b.wrong[index < count - 5 ? 0 : 1] as Option;
      return [
        event(
          'question_shown',
          {
            questionVersionId: b.q.id,
            shownOptions: [b.right, ...b.wrong].map((o, position) => ({
              optionVersionId: o.id,
              position,
            })),
            seed: 'x',
            samplingMode: 'diverse',
            highlightEnabled: true,
            positionInSession: index,
          },
          minute(index * 2),
        ),
        answered(b.q, chosen.id, false, minute(index * 2 + 1)),
      ];
    });
    return { bundles, events, bank: lookup(bundles) };
  }
  const population = (students: number, rate: number): PopulationBaselines => ({
    available: true,
    runAt: '2026-10-08T10:00:00.000Z',
    bias: { tagA: { students, rate }, tagB: { students, rate: 0.3 } },
    motives: {},
    topics: {},
    indicators: {},
    fatigue: { state: 'calibrating', students: 0, longSessions: 0 },
  });

  it('con pocos errores etiquetados calibra cada trampa y no propone ninguna', () => {
    const { events, bank } = errors(12);
    const { model } = buildStudentModel(base({ events, bank }));
    expect(model.bias.prone).toEqual([]);
    expect(model.bias.byTag.tagA).toEqual({
      state: 'calibrating',
      have: 12,
      need: DEFAULT_THRESHOLDS.bias.minTaggedErrors,
    });
  });

  it('con 40 errores etiquetados propone las trampas que más le atraen, de la que más a la que menos', () => {
    const { events, bank } = errors();
    const { model } = buildStudentModel(base({ events, bank }));
    expect(model.bias.prone).toEqual(['tagA', 'tagB']);
    expect(model.bias.baseline).toBe('chance');
    const tagA = model.bias.byTag.tagA;
    expect(tagA?.state === 'ready' ? tagA.value : 0).toBeCloseTo(0.9, 6);
  });

  it('el vocabulario sale de quien llama', () => {
    const { events, bank } = errors();
    expect(
      buildStudentModel(base({ events, bank, vocabulary: 'bias' })).model.bias.vocabulary,
    ).toBe('bias');
  });

  it('una etiqueta con 30 alumnos usa la línea base de la población', () => {
    const { events, bank } = errors();
    const withPopulation = buildStudentModel(
      base({ events, bank, population: population(30, 0.9) }),
    );
    expect(withPopulation.model.bias.baseline).toBe('population');
    // Contra 0.9 de la población ya no destaca tanto como contra el azar
    const chance = buildStudentModel(base({ events, bank }));
    const patterns = (report: typeof chance.report) =>
      report.insights.filter((insight) => insight.id.startsWith('bias:')).map((i) => i.id);
    expect(patterns(chance.report)).toContain('bias:tagA');
    expect(patterns(withPopulation.report)).not.toContain('bias:tagA');
  });

  it('con 29 alumnos, o con un ajuste menor al piso de 30, sigue con el azar', () => {
    const { events, bank } = errors();
    for (const settings of [undefined, { populationMinStudents: 5 }]) {
      const built = buildStudentModel(
        base({
          events,
          bank,
          population: population(29, 0.9),
          ...(settings ? { settings } : {}),
        }),
      );
      expect(built.model.bias.baseline).toBe('chance');
    }
  });

  it('una población que dice available false no se usa', () => {
    const { events, bank } = errors();
    const off = { ...population(60, 0.9), available: false };
    expect(buildStudentModel(base({ events, bank, population: off })).model.bias.baseline).toBe(
      'chance',
    );
  });
});

describe('motivos de error', () => {
  function withCauses(total: number) {
    const bundles = Array.from({ length: 10 }, () => bundle());
    const events: AppEvent[] = bundles.flatMap((b, index) => [
      answered(b.q, b.wrong[0]?.id ?? '', false, minute(index * 3)),
      ...(index < total
        ? [
            event(
              'cause_reported',
              {
                targetKind: 'question' as const,
                targetId: b.q.id,
                cause: index < 6 ? ('knowledge' as const) : ('time' as const),
              },
              minute(index * 3 + 1),
            ),
          ]
        : []),
    ]);
    return { events, bank: lookup(bundles) };
  }

  it('calibra hasta tener los errores con motivo que pide Conócete', () => {
    const { events, bank } = withCauses(5);
    expect(buildStudentModel(base({ events, bank })).model.motives).toEqual({
      state: 'calibrating',
      have: 5,
      need: 8,
    });
  });

  it('con 10 errores explicados reparte los motivos y dice el que más marcó', () => {
    const { events, bank } = withCauses(10);
    const { motives } = buildStudentModel(base({ events, bank })).model;
    expect(motives).toEqual({
      state: 'ready',
      value: { shares: { knowledge: 0.6, time: 0.4 }, top: 'knowledge' },
    });
  });
});

describe('fatiga con el estado global del detector (3.6)', () => {
  /** Cuatro sesiones de 44 minutos donde el acierto cae y el tiempo sube hacia el final */
  function tiringSessions(count = 4) {
    const bundles = Array.from({ length: 12 }, () => bundle());
    const events: AppEvent[] = [];
    for (let s = 0; s < count; s += 1) {
      const sessionId = newId();
      const start = 60 * 24 * s;
      events.push(
        event('session_started', { kind: 'practice', config: {} }, minute(start), sessionId),
      );
      bundles.forEach((b, i) => {
        events.push(
          i < 6
            ? answered(
                b.q,
                b.right.id,
                true,
                minute(start + i * 4 + 1),
                { msToAnswer: 20_000 + i * 6000 },
                sessionId,
              )
            : answered(
                b.q,
                b.wrong[0]?.id ?? '',
                false,
                minute(start + i * 4 + 1),
                { msToAnswer: 20_000 + i * 6000 },
                sessionId,
              ),
        );
      });
    }
    return { events, bank: lookup(bundles) };
  }
  const population = (state: PopulationBaselines['fatigue']['state']): PopulationBaselines => ({
    available: true,
    runAt: '2026-10-08T10:00:00.000Z',
    bias: {},
    motives: {},
    topics: {},
    indicators: {},
    fatigue: { state, students: 40, longSessions: 220 },
  });
  const fatigueInsight = (build: ReturnType<typeof buildStudentModel>) =>
    build.report.insights.find((insight) => insight.id === 'fatigue');

  it('con las sesiones largas pero sin el detector validado dice calibrando, y por qué', () => {
    const { events, bank } = tiringSessions();
    for (const given of [null, population('calibrating'), population('not_valid')]) {
      const built = buildStudentModel(base({ events, bank, population: given }));
      expect(built.model.fatigue.state).toBe('calibrating');
      expect(built.model.fatigue.validation).toBe(given?.fatigue.state ?? 'calibrating');
      // El informe no lo marca como foco ni como fortaleza
      expect(fatigueInsight(built)?.state).toMatchObject({
        kind: 'calibrating',
        have: 4,
        unit: 'sessions',
      });
      expect(built.report.focus.map((insight) => insight.id)).not.toContain('fatigue');
    }
  });

  it('validado y con 3 sesiones largas o más detecta la caída y la pone como foco', () => {
    const { events, bank } = tiringSessions();
    const built = buildStudentModel(base({ events, bank, population: population('validated') }));
    expect(built.model.fatigue).toEqual({
      state: 'ready',
      value: { detected: true },
      validation: 'validated',
    });
    const insight = fatigueInsight(built);
    expect(insight?.state).toMatchObject({
      kind: 'ready',
      level: 'focus',
      refs: { method: 'trend' },
    });
    expect(built.report.focus.map((item) => item.id)).toContain('fatigue');
  });

  it('validado pero con menos de 3 sesiones largas sigue calibrando', () => {
    const { events, bank } = tiringSessions(2);
    const built = buildStudentModel(base({ events, bank, population: population('validated') }));
    expect(built.model.fatigue).toMatchObject({ state: 'calibrating', have: 2, need: 3 });
    expect(built.model.fatigue.validation).toBe('validated');
  });

  it('validado y sin caída lo marca como fortaleza', () => {
    const bundles = Array.from({ length: 12 }, () => bundle());
    const events: AppEvent[] = [];
    for (let s = 0; s < 4; s += 1) {
      const sessionId = newId();
      const start = 60 * 24 * s;
      events.push(
        event('session_started', { kind: 'practice', config: {} }, minute(start), sessionId),
      );
      bundles.forEach((b, i) => {
        events.push(
          answered(
            b.q,
            b.right.id,
            true,
            minute(start + i * 4 + 1),
            { msToAnswer: 30_000 },
            sessionId,
          ),
        );
      });
    }
    const built = buildStudentModel(
      base({ events, bank: lookup(bundles), population: population('validated') }),
    );
    expect(built.model.fatigue).toMatchObject({ state: 'ready', value: { detected: false } });
    expect(fatigueInsight(built)?.state).toMatchObject({ kind: 'ready', level: 'strength' });
  });
});

describe('ritmo, constancia y carga de repaso', () => {
  it('el ritmo es la mediana de segundos por pregunta desde las 20 respuestas', () => {
    const bundles = Array.from({ length: 25 }, () => bundle());
    const events = bundles.map((b, i) =>
      answered(b.q, b.right.id, true, minute(i), { msToAnswer: (30 + i) * 1000 }),
    );
    const built = buildStudentModel(base({ events, bank: lookup(bundles) }));
    expect(built.model.pace).toEqual({ state: 'ready', value: { secondsPerItem: 42 } });
    const few = buildStudentModel(base({ events: events.slice(0, 19), bank: lookup(bundles) }));
    expect(few.model.pace).toEqual({ state: 'calibrating', have: 19, need: 20 });
  });

  it('la constancia cuenta los días con actividad de los últimos 30 desde la semana de uso', () => {
    const bundles = Array.from({ length: 4 }, () => bundle());
    const bank = lookup(bundles);
    const day = (offset: number, b: Bundle) => answered(b.q, b.right.id, true, T0 + offset * DAY);
    const [a, b, c, d] = bundles as [Bundle, Bundle, Bundle, Bundle];
    const events = [day(0, a), day(1, b), day(3, c), day(7, d)];
    expect(buildStudentModel(base({ events, bank })).model.consistency).toEqual({
      state: 'ready',
      value: { activeDays30: 4 },
    });
    // Con menos de 7 días desde el primero calibra y dice cuántos lleva
    const recent = buildStudentModel(base({ events, bank, now: new Date(T0 + 3 * DAY) }));
    expect(recent.model.consistency).toEqual({ state: 'calibrating', have: 3, need: 7 });
  });

  it('la carga de repaso cuenta lo vencido hoy y lo que viene en los próximos 7 días', () => {
    const reviews = Array.from({ length: 100 }, (_, index) =>
      event(
        'card_reviewed',
        {
          cardId: newId(),
          deckId: newId(),
          source: 'card',
          rating: 'good',
          confidence: null,
          msToReveal: 3000,
          msToRate: 2000,
          stateBefore: null,
          stateAfter: state(),
        },
        T0 + (index % 10) * DAY,
      ),
    );
    const due = (offsetDays: number): ModelCard => ({
      topic: null,
      state: state({ due: new Date(NOW.getTime() + offsetDays * DAY).toISOString() }),
    });
    const cards: ModelCard[] = [
      due(-3),
      due(-1),
      { topic: null, state: state({ due: new Date(NOW.getTime() + 60_000).toISOString() }) },
      due(1),
      due(3),
      due(6),
      due(20),
      { topic: null, state: null },
      { topic: null, state: state({ state: 'new', due: NOW.toISOString() }) },
    ];
    const built = buildStudentModel(base({ events: reviews, cards }));
    expect(built.model.reviewLoad).toEqual({
      state: 'ready',
      value: { dueToday: 3, next7: 3, dailyAverage: 3 },
    });
    // Con menos de 100 repasos calibra
    const few = buildStudentModel(base({ events: reviews.slice(0, 40), cards }));
    expect(few.model.reviewLoad).toEqual({ state: 'calibrating', have: 40, need: 100 });
  });
});
