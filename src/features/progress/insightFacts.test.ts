import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { Option, Question } from '@/data/schemas/bank';
import type { AppEvent } from '@/data/schemas/events';
import { buildInsights } from '@/engines/insights';
import { buildInsightInput } from './insightFacts';

const at = (minute: number) => new Date(Date.UTC(2026, 8, 1, 15, minute)).toISOString();
const base = {
  userId: 'u1',
  tz: 'America/Mexico_City',
  schemaVersion: 1 as const,
  sessionId: 's1',
};

const question = {
  id: 'q1',
  questionId: 'q1-stable',
  caseId: null,
  caseOrder: null,
  vignette: 'Mujer de 30 años con fiebre',
  prompt: '¿Cuál NO es el diagnóstico?',
  branch: 'internal_medicine',
  topic: 'infectology',
  structure: { polarity: 'negative', task: 'diagnosis', format: 'direct', source: 'auto' },
  physicianDifficulty: 4,
} as unknown as Question;

const option = (id: string, isCorrect: boolean, biasTag: string | null, text = 'Opción') =>
  ({ id, isCorrect, biasTag, text }) as unknown as Option;

describe('buildInsightInput', () => {
  it('arma la respuesta con etiquetas, cambios, minuto, hora local y mala lectura', () => {
    const events = [
      {
        ...base,
        id: 'e1',
        at: at(0),
        type: 'session_started',
        payload: { kind: 'practice', config: {} },
      },
      {
        ...base,
        id: 'e2',
        at: at(10),
        type: 'question_shown',
        payload: {
          questionVersionId: 'q1',
          shownOptions: [
            { optionVersionId: 'o1', position: 0 },
            { optionVersionId: 'o2', position: 1 },
            { optionVersionId: 'o3', position: 2 },
          ],
          seed: 'x',
          samplingMode: 'diverse',
          highlightEnabled: true,
          positionInSession: 0,
        },
      },
      {
        ...base,
        id: 'e3',
        at: at(11),
        type: 'answer_changed',
        payload: {
          questionVersionId: 'q1',
          fromOptionVersionId: null,
          toOptionVersionId: 'o1',
          msSinceShown: 1,
        },
      },
      {
        ...base,
        id: 'e4',
        at: at(11),
        type: 'answer_changed',
        payload: {
          questionVersionId: 'q1',
          fromOptionVersionId: 'o1',
          toOptionVersionId: 'o2',
          msSinceShown: 2,
        },
      },
      {
        ...base,
        id: 'e5',
        at: at(12),
        type: 'question_answered',
        payload: {
          questionVersionId: 'q1',
          optionVersionId: 'o2',
          correct: false,
          confidence: 'sure',
          msToAnswer: 90_000,
          changeCount: 1,
          highlightEnabled: true,
        },
      },
      {
        ...base,
        id: 'e6',
        at: at(13),
        type: 'cause_reported',
        payload: { targetKind: 'question', targetId: 'q1', cause: 'misread' },
      },
    ] as unknown as AppEvent[];
    const result = buildInsightInput({
      events,
      bank: {
        questions: new Map([['q1', question]]),
        options: new Map([
          ['o1', option('o1', true, null)],
          ['o2', option('o2', false, 'anchoring')],
          ['o3', option('o3', false, 'availability_heuristic')],
        ]),
        cases: new Map(),
      },
      timeZone: 'America/Mexico_City',
      today: '2026-09-10',
      desiredRetention: 0.9,
      thresholds: DEFAULT_THRESHOLDS,
    });
    const [answer] = result.answers;
    expect(answer).toMatchObject({
      polarity: 'negative',
      task: 'diagnosis',
      expected: 0.45,
      minuteInSession: 12,
      localHour: 9,
      visibleTags: ['anchoring', 'availability_heuristic'],
      chosenTag: 'anchoring',
      changes: [{ fromCorrect: true, toCorrect: false }],
      misread: true,
    });
    expect(result.causes).toEqual(['misread']);
    expect(result.studyDays).toEqual(['2026-09-01']);
    expect(result.daysSinceStart).toBe(9);
  });

  it('la mala lectura que reporta el alumno cuenta solo para su respuesta más reciente', () => {
    const answer = (id: string, minute: number) => ({
      ...base,
      id,
      at: at(minute),
      type: 'question_answered',
      payload: {
        questionVersionId: 'q1',
        optionVersionId: 'o2',
        correct: false,
        confidence: 'sure',
        msToAnswer: 90_000,
        changeCount: 0,
        highlightEnabled: false,
      },
    });
    const events = [
      // Fallada y sin causa. Una semana después se falla otra vez y ahí dice que leyó mal
      answer('e1', 10),
      answer('e2', 10 + 7 * 24 * 60),
      {
        ...base,
        id: 'e3',
        at: at(11 + 7 * 24 * 60),
        type: 'cause_reported',
        payload: { targetKind: 'question', targetId: 'q1', cause: 'misread' },
      },
    ] as unknown as AppEvent[];
    const result = buildInsightInput({
      events,
      bank: {
        questions: new Map([['q1', question]]),
        options: new Map([
          ['o1', option('o1', true, null)],
          ['o2', option('o2', false, 'anchoring')],
        ]),
        cases: new Map(),
      },
      timeZone: 'America/Mexico_City',
      today: '2026-09-20',
      desiredRetention: 0.9,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(result.answers.map((item) => item.misread)).toEqual([false, true]);
  });

  it('los repasos de una materia libre no cuentan en Conócete, ni sus días ni sus causas (B6)', () => {
    const review = (
      id: string,
      cardId: string,
      day: number,
      rating: 'again' | 'good',
      lapses: number,
    ) => ({
      ...base,
      id,
      at: new Date(Date.UTC(2026, 8, day, 15, 0)).toISOString(),
      type: 'card_reviewed',
      payload: {
        cardId,
        deckId: 'd1',
        source: 'card',
        rating,
        confidence: null,
        msToReveal: 1000,
        msToRate: 1000,
        stateBefore: { state: 'review' },
        stateAfter: { lapses },
      },
    });
    const events = [
      // Una tarjeta de clase que se olvida una y otra vez, sola en su día
      review('e1', 'clase', 1, 'again', 9),
      {
        ...base,
        id: 'e2',
        at: new Date(Date.UTC(2026, 8, 1, 15, 1)).toISOString(),
        type: 'cause_reported',
        payload: { targetKind: 'card', targetId: 'clase', cause: 'forgot' },
      },
      // Y 50 del ENARM que el alumno recuerda, dos días después
      ...Array.from({ length: 50 }, (_, index) =>
        review(`r${index}`, `enarm-${index}`, 3, 'good', 0),
      ),
    ] as unknown as AppEvent[];
    const input = {
      events,
      bank: { questions: new Map(), options: new Map(), cases: new Map() },
      timeZone: 'America/Mexico_City',
      today: '2026-09-10',
      desiredRetention: 0.9,
      thresholds: DEFAULT_THRESHOLDS,
    };
    const insight = (report: ReturnType<typeof buildInsights>, id: string) =>
      report.insights.find((entry) => entry.id === id)?.state;

    // Sin la lista, la tarjeta de clase entra a la retención y a las sanguijuelas
    const all = buildInsightInput(input);
    expect(all.reviews).toHaveLength(51);
    expect(all.causes).toEqual(['forgot']);
    expect(all.studyDays).toEqual(['2026-09-01', '2026-09-03']);
    expect(insight(buildInsights(all), 'leeches')).toMatchObject({ values: { leeches: 1 } });

    // Con ella, Conócete solo ve las del ENARM
    const enarm = buildInsightInput({ ...input, freeSubjectCards: new Set(['clase']) });
    expect(enarm.reviews).toHaveLength(50);
    expect(enarm.reviews.some((item) => item.cardId === 'clase')).toBe(false);
    expect(enarm.causes).toEqual([]);
    expect(enarm.studyDays).toEqual(['2026-09-03']);
    expect(enarm.daysSinceStart).toBe(7);
    const report = buildInsights(enarm);
    expect(report.totals.reviews).toBe(50);
    expect(insight(report, 'leeches')).toMatchObject({ level: 'strength', values: { leeches: 0 } });
    expect(insight(report, 'retention')).toMatchObject({ values: { retention: 1, reviews: 50 } });
  });
});
