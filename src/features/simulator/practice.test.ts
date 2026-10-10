// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRACTICE_STORAGE_KEY } from './practice';

const answer = {
  questionVersionId: 'qv1',
  optionVersionId: 'ov1',
  correct: true,
  confidence: null,
  msToAnswer: 4200,
  xp: 10,
  shownOptionIds: ['ov1', 'ov2', 'ov3', 'ov4'],
  eliminatedOptionIds: ['ov3'],
  correctPosition: 0,
  sentToReview: false,
};

const saved = {
  sessionId: 's1',
  userId: 'u1',
  questionIds: ['q1', 'q2', 'q3'],
  index: 1,
  answers: [answer],
  startedAt: 1_700_000_000_000,
  ended: false,
  kind: 'practice' as const,
  duelId: null,
  targetTags: [],
};

/** Importa el módulo de nuevo para que la tienda lea lo que haya en la sesión de la pestaña */
async function freshStore() {
  vi.resetModules();
  return (await import('./practice')).usePractice;
}

describe('práctica guardada en la sesión de la pestaña', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('guarda cada cambio y lo retoma al recargar', async () => {
    const first = await freshStore();
    first.getState().set(saved);
    const raw = sessionStorage.getItem(PRACTICE_STORAGE_KEY);
    expect(raw).not.toBeNull();
    // La función de la tienda no se guarda, solo los datos
    expect(raw).not.toContain('"set"');

    const second = await freshStore();
    const state = second.getState();
    expect(state.sessionId).toBe('s1');
    expect(state.index).toBe(1);
    expect(state.answers).toEqual([answer]);
    expect(state.questionIds).toEqual(['q1', 'q2', 'q3']);
  });

  it('no guarda nombres ni correos, solo identificadores', async () => {
    const store = await freshStore();
    store.getState().set(saved);
    const raw = sessionStorage.getItem(PRACTICE_STORAGE_KEY) ?? '';
    expect(raw).not.toMatch(/@/);
    expect(raw).not.toMatch(/alias|email|name/i);
  });

  it('descarta lo guardado si no tiene la forma esperada', async () => {
    sessionStorage.setItem(
      PRACTICE_STORAGE_KEY,
      JSON.stringify({ state: { ...saved, index: -3, answers: 'no es una lista' }, version: 1 }),
    );
    const state = (await freshStore()).getState();
    expect(state.sessionId).toBeNull();
    expect(state.answers).toEqual([]);
    expect(state.index).toBe(0);
  });

  it('arranca vacía si lo guardado no es JSON válido', async () => {
    sessionStorage.setItem(PRACTICE_STORAGE_KEY, '{ esto no es json');
    const state = (await freshStore()).getState();
    expect(state.sessionId).toBeNull();
    expect(state.questionIds).toEqual([]);
  });

  it('sigue funcionando en memoria si la sesión de la pestaña no está disponible', async () => {
    vi.resetModules();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    try {
      const store = (await import('./practice')).usePractice;
      expect(() => {
        store.getState().set(saved);
      }).not.toThrow();
      expect(store.getState().sessionId).toBe('s1');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});
