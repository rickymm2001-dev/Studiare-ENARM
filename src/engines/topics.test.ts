import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { TopicTaxonomy } from '@/data/schemas/content';
import { createRng } from './random';
import { analyzeCategories, analyzeTopics, topicExamWeights, type TopicResponse } from './topics';

const taxonomy: TopicTaxonomy = {
  version: 1,
  status: 'pending_physician_review',
  branches: [
    {
      key: 'mi',
      name: 'Medicina interna',
      weight: 1,
      topics: [
        {
          key: 'cardio',
          name: 'Cardiología',
          weight: 2,
          baseTopic: null,
          subtopics: [{ key: 'ic', name: 'IC' }],
        },
        {
          key: 'endo',
          name: 'Endocrinología',
          weight: 1,
          baseTopic: null,
          subtopics: [{ key: 'dm', name: 'DM' }],
        },
        {
          key: 'nefro',
          name: 'Nefrología',
          weight: 1,
          baseTopic: 'cardio',
          subtopics: [{ key: 'erc', name: 'ERC' }],
        },
      ],
    },
    {
      key: 'ped',
      name: 'Pediatría',
      weight: 1,
      topics: [
        {
          key: 'neo',
          name: 'Neonatología',
          weight: 1,
          baseTopic: null,
          subtopics: [{ key: 'ictericia', name: 'Ictericia' }],
        },
      ],
    },
  ],
};

function responses(branch: string, topic: string, correct: number, total: number): TopicResponse[] {
  return Array.from({ length: total }, (_, index) => ({ branch, topic, correct: index < correct }));
}

describe('análisis por tema (7.3)', () => {
  it('pesos del ENARM por tema suman 1', () => {
    const weights = topicExamWeights(taxonomy);
    expect(weights.get('mi/cardio')).toBeCloseTo(0.25, 12);
    expect(weights.get('mi/endo')).toBeCloseTo(0.125, 12);
    expect(weights.get('ped/neo')).toBeCloseTo(0.5, 12);
    expect([...weights.values()].reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
  });

  it('calibra con pocos datos y dice cuántas respuestas faltan', () => {
    const analysis = analyzeTopics({
      responses: responses('mi', 'cardio', 3, 5),
      taxonomy,
      averageRetrievability: {},
      thresholds: DEFAULT_THRESHOLDS.topics,
    });
    const cardio = analysis.topics.find((topic) => topic.topic === 'cardio');
    expect(cardio?.state.kind).toBe('calibrating');
    expect(cardio?.state.kind === 'calibrating' && cardio.state.responsesNeeded).toBeGreaterThan(
      30,
    );
    expect(analysis.priorities).toEqual([]);
    expect(analysis.calibrating).toBe(4);
  });

  it('prioriza temas débiles, pesados y olvidados, con una acción', () => {
    const analysis = analyzeTopics({
      responses: [
        ...responses('mi', 'cardio', 30, 80),
        ...responses('mi', 'endo', 70, 80),
        ...responses('mi', 'nefro', 40, 80),
        ...responses('ped', 'neo', 60, 80),
      ],
      taxonomy,
      averageRetrievability: { 'mi/nefro': 0.7 },
      thresholds: DEFAULT_THRESHOLDS.topics,
    });
    expect(analysis.calibrating).toBe(0);
    expect(analysis.priorities.map((priority) => priority.topic)).toEqual([
      'cardio',
      'neo',
      'nefro',
      'endo',
    ]);
    const cardio = analysis.priorities[0];
    expect(cardio?.action).toBe('topic_simulator');
    expect(cardio?.reason.averageRetrievability).toBeNull();
    expect(analysis.priorities.find((priority) => priority.topic === 'nefro')?.action).toBe(
      'review_cards',
    );
    expect(analysis.priorities.find((priority) => priority.topic === 'endo')?.action).toBe(
      'challenge',
    );
  });

  it('muestra como máximo 5 temas', () => {
    const big: TopicTaxonomy = {
      ...taxonomy,
      branches: [
        {
          key: 'b',
          name: 'B',
          weight: 1,
          topics: Array.from({ length: 8 }, (_, index) => ({
            key: `t${index}`,
            name: `T${index}`,
            weight: 1,
            baseTopic: null,
            subtopics: [{ key: `s${index}`, name: 'S' }],
          })),
        },
      ],
    };
    const analysis = analyzeTopics({
      responses: Array.from({ length: 8 }, (_, index) =>
        responses('b', `t${index}`, 40 + index * 5, 90),
      ).flat(),
      taxonomy: big,
      averageRetrievability: {},
      thresholds: DEFAULT_THRESHOLDS.topics,
    });
    expect(analysis.priorities).toHaveLength(5);
    expect(analysis.priorities[0]?.topic).toBe('t0');
  });

  it('con datos simulados el encogimiento por tema reduce el error frente a la proporción cruda', () => {
    const rng = createRng('temas-encogimiento');
    let raw = 0;
    let shrunk = 0;
    let count = 0;
    for (let run = 0; run < 40; run += 1) {
      const truth = new Map(
        taxonomy.branches.flatMap((branch) =>
          branch.topics.map((topic) => [`${branch.key}/${topic.key}`, rng.beta(10, 5)] as const),
        ),
      );
      const data: TopicResponse[] = [];
      for (const [key, p] of truth) {
        const [branch = '', topic = ''] = key.split('/');
        const n = rng.int(4, 20);
        for (let index = 0; index < n; index += 1)
          data.push({ branch, topic, correct: rng.chance(p) });
      }
      const analysis = analyzeTopics({
        responses: data,
        taxonomy,
        averageRetrievability: {},
        thresholds: DEFAULT_THRESHOLDS.topics,
      });
      for (const topic of analysis.topics) {
        const p = truth.get(`${topic.branch}/${topic.topic}`) ?? 0;
        raw += Math.abs(topic.tally.successes / topic.tally.trials - p);
        shrunk += Math.abs(topic.estimate.mean - p);
        count += 1;
      }
    }
    expect(count).toBe(160);
    expect(shrunk / count).toBeLessThan(raw / count);
  });
});

describe('análisis por estructura (7.5)', () => {
  it('calibra hasta 20 respuestas por categoría y la regla del intervalo', () => {
    const data = [
      ...Array.from({ length: 15 }, (_, index) => ({ category: 'negative', correct: index < 8 })),
      ...Array.from({ length: 120 }, (_, index) => ({
        category: 'affirmative',
        correct: index < 90,
      })),
    ];
    const result = analyzeCategories({
      responses: data,
      thresholds: DEFAULT_THRESHOLDS.topics,
      minResponsesPerCategory: 20,
    });
    const negative = result.find((entry) => entry.category === 'negative');
    const affirmative = result.find((entry) => entry.category === 'affirmative');
    expect(negative?.state.kind).toBe('calibrating');
    expect(
      negative?.state.kind === 'calibrating' && negative.state.responsesNeeded,
    ).toBeGreaterThanOrEqual(5);
    expect(affirmative?.state.kind).toBe('ready');
  });
});
