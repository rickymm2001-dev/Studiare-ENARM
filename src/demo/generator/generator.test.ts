// Generador de alumnos simulados y alumno de la demo (11.2, 11.3).
import { describe, expect, it } from 'vitest';
import { AppEventSchema } from '@/data/schemas/events';
import { buildDemoBank } from '../content/bank';
import { topicTaxonomy } from '../content';
import { DEMO_STUDENT_TRUTH, generateCohort, generateDemoStudent, simItemsFrom } from './cohort';
import { toEvents } from './events';
import { DEFAULT_MIX, respond, sampleTruth, type SimItem } from './model';
import { createRng } from '@/engines/random';
import { analyzeBias, populationBaseline, type BiasExposure } from '@/engines/bias';
import { fatigueSignal, negationSignal } from '@/engines/behavior';
import { estimateRasch } from '@/engines/rasch';
import { analyzeTopics } from '@/engines/topics';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { SimResponse } from './simulate';
import { syntheticCards } from './simulate';

const bank = buildDemoBank();
const items = simItemsFrom(bank);
const small = (seed: string) =>
  generateCohort(bank, topicTaxonomy, {
    seed,
    size: 12,
    days: 30,
    endDay: '2026-10-01',
    simulateCards: false,
  });

describe('cohorte simulada', () => {
  it('es reproducible con la misma semilla y cambia con otra', () => {
    const a = small('s1');
    const b = small('s1');
    expect(b.students.map((s) => s.history.responses.length)).toEqual(
      a.students.map((s) => s.history.responses.length),
    );
    expect(b.students[3]?.history.responses[5]).toEqual(a.students[3]?.history.responses[5]);
    expect(small('s2').students[0]?.truth).not.toEqual(a.students[0]?.truth);
  });

  it('siembra propensiones en la proporción pedida y deja al resto cerca de cero', () => {
    const rng = createRng('mezcla');
    const branches = topicTaxonomy.branches.map((branch) => branch.key);
    const truths = Array.from({ length: 2000 }, () => sampleTruth(rng, branches, DEFAULT_MIX));
    const share = (count: number) => count / truths.length;
    expect(
      share(truths.filter((t) => Object.keys(t.biasPropensity).length > 0).length),
    ).toBeCloseTo(0.2, 1);
    expect(share(truths.filter((t) => t.negationMisread >= 0.2).length)).toBeCloseTo(0.2, 1);
    expect(share(truths.filter((t) => t.fatigue !== null).length)).toBeCloseTo(0.2, 1);
    expect(truths.every((t) => t.consistency >= 0.3 && t.consistency <= 0.98)).toBe(true);
  });

  it('cada respuesta muestra 4 opciones con la correcta y responde con tiempos plausibles', () => {
    const cohort = small('s3');
    const responses = cohort.students.flatMap((student) => student.history.responses);
    expect(responses.length).toBeGreaterThan(100);
    for (const response of responses) {
      expect(response.shown).toHaveLength(4);
      expect(response.shown.filter((option) => option.isCorrect)).toHaveLength(1);
      expect(response.msToAnswer).toBeGreaterThanOrEqual(2500);
      expect(response.correct).toBe(response.chosenTag === null);
      expect(response.shown[response.correctPosition]?.isCorrect).toBe(true);
    }
    const accuracy = responses.filter((response) => response.correct).length / responses.length;
    expect(accuracy).toBeGreaterThan(0.45);
    expect(accuracy).toBeLessThan(0.85);
  });

  it('las tarjetas se programan con FSRS y nunca retroceden en el tiempo', () => {
    const cohort = generateCohort(bank, topicTaxonomy, {
      seed: 's4',
      size: 2,
      days: 20,
      endDay: '2026-10-01',
      cardsPerTopic: 1,
    });
    expect(cohort.cards).toHaveLength(40);
    const reviews = cohort.students.flatMap((student) => student.history.reviews);
    expect(reviews.length).toBeGreaterThan(20);
    for (const review of reviews) {
      expect(new Date(review.stateAfter.due).getTime()).toBeGreaterThanOrEqual(
        new Date(review.stateAfter.lastReview ?? 0).getTime(),
      );
    }
  });
});

describe('modelo de respuesta', () => {
  const negative = items.find((item) => item.polarity === 'negative') as SimItem;
  const shown = [
    ...negative.options.filter((option) => option.isCorrect),
    ...negative.options.filter((option) => !option.isCorrect).slice(0, 3),
  ];

  it('quien lee mal las negaciones falla más en las negativas y responde más rápido', () => {
    const run = (misread: number) => {
      const rng = createRng(`neg-${misread}`);
      const truth = {
        ...DEMO_STUDENT_TRUTH,
        biasPropensity: {},
        fatigue: null,
        negationMisread: misread,
      };
      return Array.from({ length: 600 }, () =>
        respond({ rng, truth, item: negative, difficulty: 0, shown, minuteInSession: 5 }),
      );
    };
    const careful = run(0);
    const misreader = run(0.5);
    const rate = (list: ReturnType<typeof run>) =>
      list.filter((o) => o.correct).length / list.length;
    expect(rate(misreader)).toBeLessThan(rate(careful) - 0.2);
    expect(misreader.some((o) => o.misread)).toBe(true);
    expect(careful.some((o) => o.misread)).toBe(false);
  });

  it('la propensión sembrada atrae a los distractores de esa etiqueta', () => {
    const tag = shown.find((option) => !option.isCorrect)?.biasTag ?? '';
    const run = (propensity: number) => {
      const rng = createRng(`tag-${propensity}`);
      const truth = {
        ...DEMO_STUDENT_TRUTH,
        ability: -1,
        biasPropensity: propensity ? { [tag]: propensity } : {},
        fatigue: null,
        negationMisread: 0,
      };
      const list = Array.from({ length: 800 }, () =>
        respond({
          rng,
          truth,
          item: { ...negative, polarity: 'affirmative' },
          difficulty: 0,
          shown,
          minuteInSession: 5,
        }),
      );
      return list.filter((o) => o.chosenTag === tag).length / list.length;
    };
    expect(run(2)).toBeGreaterThan(run(0) + 0.15);
  });

  it('la fatiga baja el acierto después de su inicio', () => {
    const rng = createRng('fatiga');
    const truth = { ...DEMO_STUDENT_TRUTH, biasPropensity: {}, negationMisread: 0 };
    const at = (minute: number) =>
      Array.from({ length: 800 }, () =>
        respond({
          rng,
          truth,
          item: { ...negative, polarity: 'affirmative' },
          difficulty: 0,
          shown,
          minuteInSession: minute,
        }),
      ).filter((o) => o.correct).length / 800;
    expect(at(70)).toBeLessThan(at(10) - 0.2);
  });
});

describe('alumno de la demo', () => {
  const cards = syntheticCards([{ branch: 'pediatrics', topic: 'neonatology' }], 3, 'demo-test');
  const cohort = small('demo-base');
  const student = generateDemoStudent(bank, {
    seed: 'demo-test',
    endDay: '2026-10-01',
    days: 60,
    examDate: '2027-09-01',
    difficulties: cohort.difficulties,
    cards,
  });
  const responses = student.history.responses;

  it('tiene 60 días de historial que terminan el día pedido', () => {
    expect((student.history.activeDays[0] ?? '') >= '2026-08-03').toBe(true);
    expect((student.history.activeDays.at(-1) ?? '9999') <= '2026-10-01').toBe(true);
    expect(student.history.activeDays.length).toBeGreaterThan(40);
  });

  it('muestra sus patrones sembrados', () => {
    const accuracy = (list: typeof responses) =>
      list.filter((r) => r.correct).length / Math.max(list.length, 1);
    const pediatrics = responses.filter((r) => r.branch === 'pediatrics');
    const others = responses.filter((r) => r.branch !== 'pediatrics');
    expect(accuracy(pediatrics)).toBeLessThan(accuracy(others) - 0.1);
    const negatives = responses.filter((r) => r.polarity === 'negative');
    const affirmatives = responses.filter((r) => r.polarity === 'affirmative');
    expect(accuracy(negatives)).toBeLessThan(accuracy(affirmatives) - 0.1);
    const errors = responses.filter((r) => !r.correct);
    expect(
      errors.filter((r) => r.chosenTag === 'anchoring').length / errors.length,
    ).toBeGreaterThan(0.2);
    const early = responses.filter((r) => r.minuteInSession < 30);
    const late = responses.filter((r) => r.minuteInSession > 50);
    expect(late.length).toBeGreaterThan(30);
    expect(accuracy(late)).toBeLessThan(accuracy(early));
  });

  it('su bitácora valida con el esquema de eventos, en orden y sin IDs repetidos', () => {
    const events = toEvents({ student, bank, cards, cardSeed: 'demo-test' });
    for (const event of events) expect(AppEventSchema.safeParse(event).success).toBe(true);
    expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
    const sorted = [...events].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted.map((event) => event.id)).toEqual(events.map((event) => event.id));
    const answered = events.filter((event) => event.type === 'question_answered');
    expect(answered).toHaveLength(responses.length);
    expect(events.filter((event) => event.type === 'card_reviewed')).toHaveLength(
      student.history.reviews.length,
    );
    expect(events.some((event) => event.type === 'xp_awarded')).toBe(true);
    expect(events.filter((event) => event.type === 'session_started')).toHaveLength(
      student.history.sessions.length,
    );
  });
});

describe('el alumno de la demo con los motores reales (11.3)', () => {
  const cohort = generateCohort(bank, topicTaxonomy, {
    seed: 'motores',
    size: 60,
    days: 90,
    endDay: '2026-10-01',
    simulateCards: false,
  });
  const student = generateDemoStudent(bank, {
    seed: 'motores',
    endDay: '2026-10-01',
    examDate: '2027-09-15',
    difficulties: cohort.difficulties,
    cards: [],
  });
  const responses = student.history.responses;
  const everyone = [...cohort.students, student];
  const rasch = estimateRasch(
    everyone.flatMap((s) =>
      s.history.responses.map((r) => ({ person: s.userId, item: r.itemKey, correct: r.correct })),
    ),
  );
  const expected = (r: SimResponse) => {
    const person = rasch.persons[student.userId]?.ability ?? 0;
    const item = rasch.items[r.itemKey]?.difficulty ?? 0;
    return 1 / (1 + Math.exp(-(person - item)));
  };
  const exposures = (list: readonly SimResponse[]): BiasExposure[] =>
    list.map((r) => ({
      visibleTags: r.shown.flatMap((o) => (!o.isCorrect && o.biasTag ? [o.biasTag] : [])),
      chosenTag: r.chosenTag,
    }));

  it('el análisis por sesgo encuentra anclaje, y la variante propuesta solo anclaje', () => {
    const population = cohort.students.map((s) => exposures(s.history.responses));
    const byDefault = analyzeBias({
      exposures: exposures(responses),
      baseline: populationBaseline(population, 'simulated'),
      thresholds: DEFAULT_THRESHOLDS.bias,
    });
    expect(byDefault.patterns).toContain('anchoring');
    const variant = analyzeBias({
      exposures: exposures(responses),
      baseline: populationBaseline(population, 'simulated', 'error_share'),
      thresholds: DEFAULT_THRESHOLDS.bias,
      method: 'error_share',
      familywise: true,
    });
    expect(variant.patterns).toEqual(['anchoring']);
  });

  it('marca mala lectura de negaciones y fatiga', () => {
    const negation = negationSignal(
      responses.map((r) => ({ polarity: r.polarity, correct: r.correct, expected: expected(r) })),
      DEFAULT_THRESHOLDS.structure.minResponsesPerCategory,
    );
    expect(negation.misreads).toBe(true);
    const fatigue = fatigueSignal(
      responses.map((r, index) => ({
        id: String(index),
        sessionId: r.session,
        at: r.at,
        msToAnswer: r.msToAnswer,
        words: r.words,
        correct: r.correct,
        confidence: r.confidence,
        expected: expected(r),
        changes: [],
        minuteInSession: r.minuteInSession,
      })),
      DEFAULT_THRESHOLDS.behavior,
    );
    expect(fatigue.fatigued).toBe(true);
  });

  it('Pediatría sale como la rama más débil en el análisis por tema', () => {
    const analysis = analyzeTopics({
      responses: responses.map((r) => ({ branch: r.branch, topic: r.topic, correct: r.correct })),
      taxonomy: topicTaxonomy,
      averageRetrievability: {},
      thresholds: DEFAULT_THRESHOLDS.topics,
    });
    const byBranch = new Map<string, number[]>();
    for (const topic of analysis.topics) {
      if (topic.tally.trials === 0) continue;
      byBranch.set(topic.branch, [...(byBranch.get(topic.branch) ?? []), topic.estimate.mean]);
    }
    const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
    const ranked = [...byBranch].sort((a, b) => mean(a[1]) - mean(b[1]));
    expect(ranked[0]?.[0]).toBe('pediatrics');
    expect(analysis.priorities.some((p) => p.branch === 'pediatrics')).toBe(true);
  });
});
