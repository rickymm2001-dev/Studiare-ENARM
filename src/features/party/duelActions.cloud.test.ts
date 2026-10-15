import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EnsureResult, PoolQuestion, QuestionSource } from '@/data/bank/questionSource';
import { newId } from '@/data/testing/fixtures';
import { DUEL_QUESTIONS } from '@/engines/party';
import { usePractice } from '../simulator/practice';
import { pickDuelQuestionIds, startDuel } from './duelActions';

// Con el banco de la nube (B11, 5.4) las preguntas salen del catálogo y el rival baja las versiones
const source = vi.hoisted(() => ({ current: null as QuestionSource | null }));
vi.mock('../shared/useQuestionSource', () => ({
  currentQuestionSource: () => source.current,
}));

const USER = { id: newId(), timeZone: 'America/Merida' };

function pooled(overrides: Partial<PoolQuestion> = {}): PoolQuestion {
  return {
    id: newId(),
    questionId: newId(),
    version: 1,
    caseId: null,
    caseOrder: null,
    branch: 'internal_medicine',
    topic: 'cardiology',
    subtopic: 'hypertension',
    physicianDifficulty: 3,
    isDemo: false,
    structure: { polarity: 'affirmative', task: 'diagnosis', format: 'direct' },
    examEligible: true,
    language: 'es',
    distractorBiases: [],
    cached: false,
    ...overrides,
  };
}

function cloudSource(practice: PoolQuestion[], ensure: (ids: readonly string[]) => EnsureResult) {
  const ensureBodies = vi.fn((ids: readonly string[]) => Promise.resolve(ensure(ids)));
  source.current = {
    kind: 'cloud',
    prepare: () => Promise.resolve('ready'),
    pool: () => Promise.resolve({ practice, exam: practice }),
    ensureBodies,
    quota: () => Promise.resolve(null),
    refresh: () => Promise.resolve(),
  };
  return { ensureBodies };
}

const api = () => {
  const recorded: unknown[] = [];
  return {
    recorded,
    api: {
      repos: { events: { query: () => Promise.resolve([]) } },
      recordEvent: (item: unknown) => {
        recorded.push(item);
        return Promise.resolve(item);
      },
    } as never,
  };
};

afterEach(() => {
  source.current = null;
  usePractice.getState().set({ sessionId: null, userId: null, duelId: null, kind: 'practice' });
});

describe('duelos con el banco de la nube', () => {
  it('elige del catálogo publicado sin variantes, aunque no sean de la demostración', async () => {
    const loose = Array.from({ length: DUEL_QUESTIONS + 2 }, () => pooled());
    const variant = pooled({ variantOf: newId() });
    cloudSource([...loose, variant], () => ({
      ready: [],
      denied: [],
      quota: null,
      offline: false,
    }));
    const ids = await pickDuelQuestionIds(api().api, 'duel|semilla');
    expect(ids).toHaveLength(DUEL_QUESTIONS);
    expect(ids).not.toContain(variant.id);
    expect(await pickDuelQuestionIds(api().api, 'duel|semilla')).toEqual(ids);
  });

  it('el rival baja las versiones exactas y sin todas no empieza ni gasta su intento', async () => {
    const duel = { id: newId(), questionIds: [newId(), newId(), newId()] };
    const { ensureBodies } = cloudSource([], (ids) => ({
      ready: ids.slice(0, 2),
      denied: [{ id: ids[2] ?? '', reason: 'daily_limit' }],
      quota: null,
      offline: false,
    }));
    const claim = vi.fn(() => Promise.resolve('started' as const));
    const { api: dataApi, recorded } = api();
    expect(await startDuel(dataApi, USER, duel, claim)).toBe('unavailable');
    expect(ensureBodies).toHaveBeenCalledWith(duel.questionIds, 'duel');
    expect(claim).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
  });

  it('con todas las versiones bajadas registra el inicio y abre la práctica del duelo', async () => {
    const duel = { id: newId(), questionIds: [newId(), newId()] };
    cloudSource([], (ids) => ({ ready: [...ids], denied: [], quota: null, offline: false }));
    const claim = vi.fn(() => Promise.resolve('started' as const));
    expect(await startDuel(api().api, USER, duel, claim)).toBe('started');
    expect(claim).toHaveBeenCalledOnce();
    expect(usePractice.getState()).toMatchObject({
      duelId: duel.id,
      questionIds: duel.questionIds,
    });
  });
});
