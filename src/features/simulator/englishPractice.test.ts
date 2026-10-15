// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolQuestion, QuestionSource } from '@/data/bank/questionSource';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { useBankNotice } from '../shared/bankNotice';
import {
  ENGLISH_TEXT_COUNTS,
  englishCardState,
  englishPracticePlan,
  startEnglishPractice,
} from './englishPractice';
import { usePractice } from './practice';

afterEach(() => {
  useBankNotice.getState().clear();
  usePractice.setState({ sessionId: null, userId: null, questionIds: [], answers: [] });
});

/** Un caso de lectura en el pool. 1 es una pregunta suelta */
function text(key: string, items: number): PoolQuestion[] {
  return Array.from({ length: items }, (_, order) => ({
    id: `${key}-${order + 1}`,
    questionId: `${key}-q${order + 1}`,
    version: 1,
    caseId: items === 1 ? null : key,
    caseOrder: items === 1 ? null : order + 1,
    branch: 'medical_english',
    topic: 'reading_comprehension',
    subtopic: 'english_pediatrics',
    physicianDifficulty: 3,
    isDemo: false,
    structure: { polarity: 'affirmative', task: 'data_interpretation', format: 'serial_case' },
    examEligible: true,
    language: 'en',
    distractorBiases: [],
    cached: false,
  }));
}
const POOL = [...text('a', 3), ...text('b', 2), ...text('c', 3), ...text('d', 2)];
const THRESHOLDS = { practiceMinCases: 1, examMinItems: 30 };

describe('estado de la tarjeta de inglés (2.1)', () => {
  it('sin ningún caso dice sin textos', () => {
    expect(englishCardState({ practice: [], exam: [] }, THRESHOLDS)).toEqual({ kind: 'none' });
  });

  it('con casos pero menos reactivos de los que pide la parte del examen está calibrando', () => {
    expect(englishCardState({ practice: POOL, exam: POOL }, THRESHOLDS)).toEqual({
      kind: 'calibrating',
      cases: 4,
      items: 10,
      target: 30,
    });
  });

  it('con 30 reactivos o más ya está lista', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      text(`t${index}`, index % 2 === 0 ? 2 : 3),
    ).flat();
    expect(many).toHaveLength(30);
    expect(englishCardState({ practice: many, exam: many }, THRESHOLDS)).toEqual({
      kind: 'ready',
      cases: 12,
      items: 30,
    });
    // El umbral es editable por el admin
    expect(
      englishCardState({ practice: POOL, exam: POOL }, { practiceMinCases: 1, examMinItems: 10 })
        .kind,
    ).toBe('ready');
  });

  it('si el umbral pide más casos de los que hay espera y dice cuántos faltan', () => {
    expect(
      englishCardState({ practice: POOL, exam: POOL }, { practiceMinCases: 6, examMinItems: 30 }),
    ).toEqual({ kind: 'waiting', cases: 4, needed: 6 });
  });

  it('los reactivos del examen salen de su propio pool', () => {
    const state = englishCardState({ practice: POOL, exam: POOL.slice(0, 5) }, THRESHOLDS);
    expect(state).toMatchObject({ kind: 'calibrating', cases: 4, items: 5 });
  });

  it('la tarjeta ofrece 1, 3, 5 o 10 textos', () => {
    expect(ENGLISH_TEXT_COUNTS).toEqual([1, 3, 5, 10]);
  });
});

describe('cuántos textos tendrá la práctica', () => {
  it('sin tope son los pedidos, y si hay menos son todos', () => {
    expect(englishPracticePlan(POOL, 3, null)).toEqual({
      available: 4,
      fitting: 4,
      smallest: 2,
      fits: 4,
      texts: 3,
    });
    expect(englishPracticePlan(POOL, 10, null).texts).toBe(4);
    expect(englishPracticePlan([], 3, null)).toEqual({
      available: 0,
      fitting: 0,
      smallest: null,
      fits: 0,
      texts: 0,
    });
  });

  it('con el tope de Gratis solo cuentan los textos que caben completos', () => {
    // Quedan 5. Caben los dos de 2 preguntas, o uno de 2 y uno de 3, y se cuentan los más cortos
    expect(englishPracticePlan(POOL, 5, 5)).toMatchObject({ fitting: 4, fits: 2, texts: 2 });
    // Quedan 2. Solo caben los textos de 2 preguntas, y de esos uno
    expect(englishPracticePlan(POOL, 5, 2)).toMatchObject({ fitting: 2, fits: 1, texts: 1 });
    // Si quedan 2 y todos los textos traen 3, no cabe ninguno y la tarjeta lo dice
    const threes = [...text('a', 3), ...text('b', 3)];
    expect(englishPracticePlan(threes, 3, 2)).toMatchObject({
      fitting: 0,
      smallest: 3,
      fits: 0,
      texts: 0,
    });
    expect(englishPracticePlan(POOL, 3, 0).texts).toBe(0);
  });
});

/** Una fuente que concede lo que se pida, salvo los ids que se le nieguen */
function fakeSource(denied: readonly string[] = [], offline = false): QuestionSource {
  return {
    kind: 'cloud',
    prepare: () => Promise.resolve('ready'),
    pool: () => Promise.resolve({ practice: [], exam: [], english: { practice: [], exam: [] } }),
    ensureBodies: (ids) =>
      Promise.resolve({
        ready: ids.filter((id) => !denied.includes(id)),
        denied: ids
          .filter((id) => denied.includes(id))
          .map((id) => ({ id, reason: 'daily_limit' as const })),
        quota: null,
        offline,
      }),
    quota: () => Promise.resolve(null),
    refresh: () => Promise.resolve(),
  };
}

const user = { id: newId(), timeZone: 'America/Merida' };

function recorder() {
  const events: AppEvent[] = [];
  return {
    events,
    api: {
      recordEvent: (event: AppEvent) => {
        events.push(event);
        return Promise.resolve(event);
      },
    },
  };
}

describe('empezar la práctica de inglés (2.4)', () => {
  it('elige textos completos, deja session_started con la sección y arma la práctica en curso', async () => {
    const { api, events } = recorder();
    const result = await startEnglishPractice({
      api,
      user,
      source: fakeSource(),
      pool: POOL,
      texts: 2,
      left: null,
      targetTags: [],
      secondsPerItem: 90,
    });
    expect(result).toEqual({ started: true });
    const state = usePractice.getState();
    expect(state).toMatchObject({
      userId: user.id,
      kind: 'practice',
      section: 'english',
      secondsPerItem: 90,
      caseStartedAt: 0,
      index: 0,
      answers: [],
      targetTags: [],
    });
    // Dos textos completos, cada uno con todas sus preguntas y en orden
    const byId = new Map(POOL.map((question) => [question.id, question]));
    const picked = state.questionIds.map((id) => byId.get(id));
    const cases = new Set(picked.map((question) => question?.caseId));
    expect(cases.size).toBe(2);
    for (const key of cases) {
      const members = POOL.filter((question) => question.caseId === key);
      expect(picked.filter((question) => question?.caseId === key)).toHaveLength(members.length);
    }
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'session_started',
      sessionId: state.sessionId,
      payload: {
        kind: 'practice',
        config: { section: 'english', cases: 2, secondsPerItem: 90, targeted: false },
      },
    });
  });

  it('con trampas dirigidas lo anota y las deja en la práctica', async () => {
    const { api, events } = recorder();
    await startEnglishPractice({
      api,
      user,
      source: fakeSource(),
      pool: POOL,
      texts: 1,
      left: null,
      targetTags: ['belief_bias', 'anchoring'],
      secondsPerItem: 77,
    });
    expect(usePractice.getState()).toMatchObject({
      targetTags: ['belief_bias', 'anchoring'],
      secondsPerItem: 77,
    });
    expect(events[0]?.payload).toMatchObject({
      config: { targeted: true, sampling: 'targeted', targetTags: ['belief_bias', 'anchoring'] },
    });
  });

  it('con el tope de Gratis no pasa de lo que le queda hoy', async () => {
    for (const left of [2, 3, 5]) {
      const { api } = recorder();
      const result = await startEnglishPractice({
        api,
        user,
        source: fakeSource(),
        pool: POOL,
        texts: 4,
        left,
        targetTags: [],
        secondsPerItem: 90,
      });
      expect(result.started).toBe(true);
      expect(usePractice.getState().questionIds.length).toBeLessThanOrEqual(left);
    }
  });

  it('si el servidor niega un texto, empieza con lo concedido y el marco de la app dice por qué', async () => {
    const { api } = recorder();
    // Se niegan las preguntas de uno de los dos textos que salgan elegidos
    const source: QuestionSource = {
      ...fakeSource(),
      ensureBodies: (ids) => {
        const keep = ids.filter((id) => id.startsWith(ids[0]?.slice(0, 1) ?? ''));
        return Promise.resolve({
          ready: keep,
          denied: ids
            .filter((id) => !keep.includes(id))
            .map((id) => ({ id, reason: 'daily_limit' as const })),
          quota: null,
          offline: false,
        });
      },
    };
    const result = await startEnglishPractice({
      api,
      user,
      source,
      pool: POOL,
      texts: 3,
      left: null,
      targetTags: [],
      secondsPerItem: 90,
    });
    expect(result.started).toBe(true);
    const notice = useBankNotice.getState().notice;
    expect(notice?.reason).toBe('daily_limit');
    expect(notice?.granted).toBe(usePractice.getState().questionIds.length);
    expect(notice?.requested).toBeGreaterThan(notice?.granted ?? 0);
  });

  it('si no llega ninguna pregunta no empieza y dice por qué, sin tocar la bitácora', async () => {
    const { api, events } = recorder();
    const result = await startEnglishPractice({
      api,
      user,
      source: fakeSource(POOL.map((question) => question.id)),
      pool: POOL,
      texts: 2,
      left: null,
      targetTags: [],
      secondsPerItem: 90,
    });
    expect(result).toEqual({
      started: false,
      message: bankText.shortfall.reasons.daily_limit,
    });
    expect(events).toEqual([]);
    expect(usePractice.getState().sessionId).toBeNull();
  });

  it('sin conexión ni nada bajado dice que se necesita conexión', async () => {
    const { api } = recorder();
    const source: QuestionSource = {
      ...fakeSource(),
      ensureBodies: () => Promise.resolve({ ready: [], denied: [], quota: null, offline: true }),
    };
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const result = await startEnglishPractice({
      api,
      user,
      source,
      pool: POOL,
      texts: 2,
      left: null,
      targetTags: [],
      secondsPerItem: 90,
    });
    expect(result).toEqual({ started: false, message: bankText.shortfall.reasons.offline });
  });
});
