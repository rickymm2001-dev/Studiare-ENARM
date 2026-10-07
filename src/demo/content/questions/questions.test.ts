// Validación del contenido demo de preguntas (11.1, D-030, D-042). Corre sobre los lotes que existen.
import { describe, expect, it } from 'vitest';
import { DemoQuestionBatchSchema } from '@/data/schemas/content';
import { makeSyntheticBatch, makeSyntheticQuestion } from '@/data/testing/syntheticQuestions';
import { analyzeStructure } from '@/engines/structure';
import { biasTaxonomy, structureDictionary, taggableBiasKeys, topicTaxonomy } from '../index';
import { buildDemoBank } from '../bank';
import { questionBatches } from './index';

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
const allQuestions = questionBatches.flatMap((batch) =>
  batch.questions.map((question) => ({ batch, question })),
);
const branchOfTopic = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, branch.key] as const),
  ),
);
const subtopicsOfTopic = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, new Set(topic.subtopics.map((s) => s.key))] as const),
  ),
);
const biasKeys = new Set(biasTaxonomy.biases.map((bias) => bias.key));

describe('lotes de preguntas demo', () => {
  it('hay al menos un lote y cada lote tiene 50 preguntas con claves únicas', () => {
    expect(questionBatches.length).toBeGreaterThan(0);
    for (const batch of questionBatches) {
      expect(batch.status).toBe('pending_physician_review');
      expect(batch.questions, `lote ${batch.batch}`).toHaveLength(50);
      for (const question of batch.questions)
        expect(question.key.startsWith(`b${batch.batch}-`), question.key).toBe(true);
    }
    const keys = allQuestions.map(({ question }) => question.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cada lote mezcla las 4 ramas y trae al menos 20% de negativas', () => {
    for (const batch of questionBatches) {
      const byBranch = new Map<string, number>();
      for (const question of batch.questions)
        byBranch.set(question.branch, (byBranch.get(question.branch) ?? 0) + 1);
      expect(byBranch.size, `lote ${batch.batch}`).toBe(4);
      for (const count of byBranch.values()) expect(count).toBeGreaterThanOrEqual(12);
      const negatives = batch.questions.filter(
        (question) => question.polarity === 'negative',
      ).length;
      expect(negatives, `negativas del lote ${batch.batch}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('cada pregunta usa una rama, tema y subtema de la taxonomía', () => {
    for (const { question } of allQuestions) {
      expect(branchOfTopic.get(question.topic), question.key).toBe(question.branch);
      expect(
        subtopicsOfTopic.get(question.topic)?.has(question.subtopic),
        `${question.key} ${question.subtopic}`,
      ).toBe(true);
    }
  });

  it('10 opciones, una correcta, distractores con sesgo usable y set canónico válido', () => {
    for (const { question } of allQuestions) {
      const keys = question.options.map((option) => option.key);
      expect(keys, question.key).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
      const correct = question.options.filter((option) => option.correct);
      expect(correct, question.key).toHaveLength(1);
      expect(correct[0]?.bias, question.key).toBeUndefined();
      for (const option of question.options.filter((candidate) => !candidate.correct)) {
        expect(
          taggableBiasKeys.has(option.bias ?? ''),
          `${question.key}${option.key} ${option.bias ?? ''}`,
        ).toBe(true);
        for (const secondary of option.secondaryBiases ?? []) {
          expect(biasKeys.has(secondary), `${question.key}${option.key} ${secondary}`).toBe(true);
          expect(secondary).not.toBe(option.bias);
        }
      }
      const texts = question.options.map((option) => option.text.trim().toLowerCase());
      expect(new Set(texts).size, `${question.key} opciones repetidas`).toBe(10);
      expect(new Set(question.canonical).size, question.key).toBe(4);
      expect(question.canonical, question.key).toContain(correct[0]?.key);
    }
  });

  it('explicación de 80 a 150 palabras y referencias GPC solo por título', () => {
    for (const { question } of allQuestions) {
      const count = words(question.explanation);
      expect(count, `${question.key} tiene ${count} palabras`).toBeGreaterThanOrEqual(80);
      expect(count, `${question.key} tiene ${count} palabras`).toBeLessThanOrEqual(150);
      for (const reference of question.gpcRefs) {
        // Sin años ni claves de catálogo como IMSS-123-08. Números del título, como tipo 2, sí
        expect(reference, `${question.key} sin años`).not.toMatch(/(?<!\d)(19|20)\d{2}(?!\d)/);
        expect(reference, `${question.key} sin claves`).not.toMatch(/[A-Z]{2,}-\d/);
      }
    }
  });

  it('la polaridad declarada coincide con el etiquetador de estructura', () => {
    for (const { question } of allQuestions) {
      const auto = analyzeStructure(
        {
          vignette: question.vignette,
          prompt: question.prompt,
          serialCase: question.caseKey !== null,
        },
        structureDictionary,
      );
      expect(auto.polarity, `${question.key} ${question.prompt}`).toBe(question.polarity);
    }
  });

  it('la tarea declarada coincide con la automática en al menos 85% de las que detecta', () => {
    let detected = 0;
    let agree = 0;
    for (const { question } of allQuestions) {
      const auto = analyzeStructure(
        {
          vignette: question.vignette,
          prompt: question.prompt,
          serialCase: question.caseKey !== null,
        },
        structureDictionary,
      );
      if (auto.task === null) continue;
      detected += 1;
      if (auto.task === question.task) agree += 1;
    }
    expect(agree / Math.max(detected, 1)).toBeGreaterThanOrEqual(0.85);
  });

  it('los casos seriados tienen 2 o 3 preguntas en orden y su viñeta existe', () => {
    for (const batch of questionBatches) {
      const caseKeys = new Set(batch.cases.map((entry) => entry.key));
      const byCase = new Map<string, number[]>();
      for (const question of batch.questions) {
        if (question.caseKey === null) {
          expect(question.caseOrder, question.key).toBeNull();
          continue;
        }
        expect(caseKeys.has(question.caseKey), question.key).toBe(true);
        byCase.set(question.caseKey, [
          ...(byCase.get(question.caseKey) ?? []),
          question.caseOrder ?? 0,
        ]);
      }
      expect(byCase.size, `casos seriados del lote ${batch.batch}`).toBeGreaterThanOrEqual(1);
      for (const [caseKey, orders] of byCase) {
        expect(orders.length, caseKey).toBeGreaterThanOrEqual(2);
        expect(orders.length, caseKey).toBeLessThanOrEqual(3);
        expect([...orders].sort(), caseKey).toEqual(orders.map((_, index) => index + 1));
      }
    }
  });

  it('las dificultades usan toda la escala', () => {
    const levels = new Set(allQuestions.map(({ question }) => question.difficulty));
    expect([...levels].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('preguntas de 4, 5 y 6 opciones (banco nuevo)', () => {
  // Preguntas generadas por código con textos neutros. Prueban la forma, no la medicina
  const counts = [4, 5, 6];

  it('las 200 preguntas existentes siguen con sus 10 opciones y pasan el esquema', () => {
    expect(allQuestions).toHaveLength(200);
    for (const { question } of allQuestions)
      expect(question.options, question.key).toHaveLength(10);
  });

  it('el esquema acepta de 4 a 10 opciones con o sin tipos de reactivo', () => {
    for (const total of [4, 5, 6, 7, 8, 9, 10]) {
      const batch = makeSyntheticBatch([total]);
      expect(DemoQuestionBatchSchema.safeParse(batch).success, `${total} opciones`).toBe(true);
      const withKind = makeSyntheticBatch([total]);
      withKind.questions = withKind.questions.map((question) => ({
        ...question,
        kinds: ['control'],
      }));
      expect(DemoQuestionBatchSchema.safeParse(withKind).success, `${total} con kinds`).toBe(true);
    }
  });

  it('rechaza menos de 4 opciones', () => {
    for (const total of [1, 3]) {
      const question = makeSyntheticQuestion(total);
      const result = DemoQuestionBatchSchema.safeParse({
        ...makeSyntheticBatch([4]),
        questions: [question],
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues.some((issue) => issue.path.includes('options'))).toBe(true);
    }
  });

  it('rechaza un set canónico que apunta a una opción que no existe o repetida', () => {
    const lost = makeSyntheticQuestion(5, {}, { canonical: ['a', 'b', 'c', 'f'] });
    const repeated = makeSyntheticQuestion(5, {}, { canonical: ['a', 'b', 'b', 'c'] });
    for (const question of [lost, repeated]) {
      const batch = { ...makeSyntheticBatch([5]), questions: [question] };
      expect(DemoQuestionBatchSchema.safeParse(batch).success).toBe(false);
    }
  });

  it('cada pregunta tiene una correcta, sesgo en cada distractor y set canónico de 4 que existe', () => {
    const batch = makeSyntheticBatch(counts);
    batch.questions.forEach((question, index) => {
      expect(question.options, question.key).toHaveLength(counts[index] ?? 0);
      const correct = question.options.filter((option) => option.correct);
      expect(correct, question.key).toHaveLength(1);
      expect(question.canonical, question.key).toHaveLength(4);
      expect(question.canonical, question.key).toContain(correct[0]?.key);
      for (const option of question.options.filter((candidate) => !candidate.correct))
        expect(taggableBiasKeys.has(option.bias ?? ''), `${question.key}${option.key}`).toBe(true);
    });
  });

  it('se convierten en entidades del banco con los esquemas de la base', () => {
    const bank = buildDemoBank([makeSyntheticBatch(counts)]);
    expect(bank.questions.map((entry) => entry.options.length)).toEqual(counts);
    for (const entry of bank.questions) {
      expect(entry.question.canonicalOptionIds).toHaveLength(4);
      const ids = new Set(entry.options.map((option) => option.id));
      for (const id of entry.question.canonicalOptionIds) expect(ids.has(id)).toBe(true);
      expect(entry.options.filter((option) => option.isCorrect)).toHaveLength(1);
    }
  });
});
