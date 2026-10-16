// Los hechos de Conócete con respuestas de Inglés médico (B13, hallazgo 5 de la revisión independiente). La
// respuesta de una pregunta en inglés lleva su idioma, y el motor la deja fuera de lo que mide tiempo contra el
// largo del texto. Aquí se comprueba de punta a punta, de la bitácora a los hallazgos, con el escenario de la
// revisión. Todo es simulado.
import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { ClinicalCase, Option, Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { buildInsights } from '@/engines/insights';
import { buildInsightInput, type BankLookup } from './insightFacts';

const base = {
  userId: 'u1',
  tz: 'America/Mexico_City',
  schemaVersion: 1 as const,
  sessionId: 's1',
};

const words = (count: number) => Array.from({ length: count }, () => 'palabra').join(' ');

const spanishQuestion = {
  id: 'qes',
  questionId: 'qes-stable',
  caseId: null,
  caseOrder: null,
  vignette: words(148),
  prompt: '¿Cuál NO es?',
  branch: 'internal_medicine',
  topic: 'infectology',
  structure: { polarity: 'negative', task: 'diagnosis', format: 'direct', source: 'auto' },
  physicianDifficulty: 3,
} as unknown as Question;

const englishQuestion = (order: number) =>
  ({
    id: `qen${String(order)}`,
    questionId: `qen${String(order)}-stable`,
    caseId: 'case1',
    caseOrder: order,
    vignette: '',
    prompt: 'Which of these is NOT in the text?',
    branch: 'medical_english',
    topic: 'reading_comprehension',
    language: 'en',
    structure: {
      polarity: 'negative',
      task: 'data_interpretation',
      format: 'serial_case',
      source: 'auto',
    },
    physicianDifficulty: 3,
  }) as unknown as Question;

const option = (id: string, isCorrect: boolean) =>
  ({ id, isCorrect, biasTag: isCorrect ? null : 'anchoring', text: 'Opción' }) as unknown as Option;

const questions = new Map<string, Question>([
  ['qes', spanishQuestion],
  ...[1, 2, 3].map((order) => [`qen${String(order)}`, englishQuestion(order)] as const),
]);
const bank: BankLookup = {
  questions,
  options: new Map([
    ['good', option('good', true)],
    ['bad', option('bad', false)],
  ]),
  cases: new Map([['case1', { id: 'case1', vignette: words(400) } as unknown as ClinicalCase]]),
};

let minute = 0;
function answered(questionVersionId: string, correct: boolean, msToAnswer: number): AppEvent {
  minute += 1;
  return {
    ...base,
    id: `e${String(minute)}`,
    at: new Date(Date.UTC(2026, 9, 10, 15, 0, 0) + minute * 60_000).toISOString(),
    type: 'question_answered',
    payload: {
      questionVersionId,
      optionVersionId: correct ? 'good' : 'bad',
      correct,
      confidence: null,
      msToAnswer,
      changeCount: 0,
      highlightEnabled: false,
    },
  } as unknown as AppEvent;
}

const factsOf = (events: AppEvent[]) =>
  buildInsightInput({
    events,
    bank,
    timeZone: 'America/Mexico_City',
    today: '2026-10-16',
    desiredRetention: 0.9,
    thresholds: DEFAULT_THRESHOLDS,
  });

/** 150 respuestas en español de 40 a 85 segundos, repartidas parejo, con 70% de aciertos */
const spanishEvents = () =>
  Array.from({ length: 150 }, (_, index) => answered('qes', index % 10 < 7, 40_000 + index * 300));

/** 10 textos de tres preguntas. 120 segundos la primera, 35 las otras dos y 50% de aciertos */
const englishEvents = () =>
  Array.from({ length: 10 }, (_, text) =>
    [1, 2, 3].map((order) =>
      answered(`qen${String(order)}`, (text + order) % 2 === 0, order === 1 ? 120_000 : 35_000),
    ),
  ).flat();

describe('hechos de Conócete con respuestas de inglés', () => {
  it('la respuesta de una pregunta en inglés lleva su idioma y la de español no', () => {
    const facts = factsOf([answered('qes', true, 60_000), answered('qen2', true, 35_000)]);
    const [es, en] = facts.answers;
    expect(es).not.toHaveProperty('language');
    expect(en).toMatchObject({ language: 'en', caseOrder: 2, branch: 'medical_english' });
    // Cuenta el texto entero como palabras de la pregunta, y el motor sabe que eso no se usa
    expect(en?.words).toBeGreaterThan(400);
  });

  it('una pregunta negativa fallada de inglés contestada en 35 s no cuenta como mala lectura por rápida', () => {
    // La misma situación en español sí cuenta, porque 20 segundos son menos de lo que toma leerla
    const facts = factsOf([answered('qes', false, 20_000), answered('qen2', false, 35_000)]);
    const [es, en] = facts.answers;
    expect(es?.misread).toBe(true);
    expect(en?.misread).toBe(false);
  });

  it('el ritmo personal que usa la mala lectura sale solo de las respuestas en español', () => {
    // Con muchas de inglés rápidas por palabra, el percentil 10 bajaría y las de español lentas por palabra
    // ya no se verían rápidas. Con las de inglés fuera da lo mismo que sin ellas
    const spanishOnly = factsOf(spanishEvents());
    const mixed = factsOf([...spanishEvents(), ...englishEvents()]);
    // Que la prueba mire algo: en español hay negativas falladas más rápidas que su percentil 10
    expect(spanishOnly.answers.some((item) => item.misread)).toBe(true);
    expect(
      mixed.answers.filter((item) => item.language !== 'en').map((item) => item.misread),
    ).toEqual(spanishOnly.answers.map((item) => item.misread));
  });

  it('el escenario de la revisión no produce el foco falso en Conócete', () => {
    const only = buildInsights(factsOf(spanishEvents()));
    const mixed = buildInsights(factsOf([...spanishEvents(), ...englishEvents()]));
    for (const id of ['pace', 'rapid_guess', 'stuck', 'long_vignettes']) {
      expect(mixed.insights.find((item) => item.id === id)?.state, id).toEqual(
        only.insights.find((item) => item.id === id)?.state,
      );
    }
    expect(mixed.focus.map((item) => item.id)).not.toContain('rapid_guess');
    expect(mixed.totals.answers).toBe(180);
  });
});
