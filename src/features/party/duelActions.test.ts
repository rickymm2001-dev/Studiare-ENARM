import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { usePractice } from '../simulator/practice';
import { event } from '../tutor/testing/fixtures';
import { activeDuelSessionOf, startDuel, type DuelStartClaim } from './duelActions';

// El banco de demostración no hace falta. Las preguntas del duelo están o no según cada prueba
vi.mock('@/data/usecases/bank', () => ({ ensureDemoBank: () => Promise.resolve(0) }));

const USER = { id: newId(), timeZone: 'America/Merida' };
const DUEL = { id: newId(), questionIds: [newId(), newId(), newId()] };

/** Una bitácora y un banco en memoria, lo único que usa startDuel */
function fakeApi(input: { events?: AppEvent[]; missing?: string[] } = {}) {
  const events = [...(input.events ?? [])];
  const recorded: AppEvent[] = [];
  const api = {
    repos: {
      events: { query: () => Promise.resolve([...events, ...recorded]) },
      questions: {
        get: (id: string) =>
          Promise.resolve(input.missing?.includes(id) ? undefined : { id, prompt: 'Pregunta' }),
      },
    },
    recordEvent: (item: AppEvent) => {
      recorded.push(item);
      return Promise.resolve(item);
    },
  };
  return { api: api as never, recorded };
}

const claim = (answer: DuelStartClaim) => vi.fn(() => Promise.resolve(answer));

beforeEach(() => {
  usePractice.getState().set({ sessionId: null, userId: null, duelId: null, kind: 'practice' });
});

afterEach(() => {
  usePractice.getState().set({ sessionId: null, userId: null, duelId: null, kind: 'practice' });
});

describe('empezar un duelo', () => {
  it('registra el inicio en el servidor y abre la práctica del duelo', async () => {
    const { api, recorded } = fakeApi();
    const start = claim('started');
    expect(await startDuel(api, USER, DUEL, start)).toBe('started');
    expect(start).toHaveBeenCalledOnce();
    expect(recorded.map((item) => item.type)).toEqual(['session_started']);
    const practice = usePractice.getState();
    expect(practice).toMatchObject({
      userId: USER.id,
      kind: 'challenge',
      duelId: DUEL.id,
      questionIds: DUEL.questionIds,
      ended: false,
    });
    expect(activeDuelSessionOf(practice, USER.id)).toBe(recorded[0]?.sessionId);
  });

  it('es un solo intento. Con una sesión del duelo en la bitácora no se abre otra', async () => {
    const earlier = event(
      'session_started',
      { kind: 'challenge', config: { duelId: DUEL.id, count: 3 } },
      Date.now() - 60_000,
      newId(),
    );
    const { api, recorded } = fakeApi({ events: [earlier] });
    const start = claim('started');
    expect(await startDuel(api, USER, DUEL, start)).toBe('already_started');
    // Ni siquiera le pregunta al servidor
    expect(start).not.toHaveBeenCalled();
    expect(recorded).toEqual([]);
    expect(usePractice.getState().duelId).toBeNull();
  });

  it('si el servidor dice que ya lo empezó en otro dispositivo, no lo abre', async () => {
    const { api, recorded } = fakeApi();
    expect(await startDuel(api, USER, DUEL, claim('already'))).toBe('already_started');
    expect(recorded).toEqual([]);
  });

  it('sin respuesta del servidor no lo abre, para no jugar un intento que no cuenta', async () => {
    const { api, recorded } = fakeApi();
    expect(await startDuel(api, USER, DUEL, claim('failed'))).toBe('failed');
    expect(recorded).toEqual([]);
  });

  it('sin todas sus preguntas en este dispositivo no se juega ni se registra el inicio', async () => {
    const { api, recorded } = fakeApi({ missing: [DUEL.questionIds[1] ?? ''] });
    const start = claim('started');
    expect(await startDuel(api, USER, DUEL, start)).toBe('unavailable');
    expect(start).not.toHaveBeenCalled();
    expect(await startDuel(api, USER, { id: DUEL.id, questionIds: [] }, start)).toBe('unavailable');
    expect(recorded).toEqual([]);
  });

  it('la demostración no pasa por el servidor', async () => {
    const { api, recorded } = fakeApi();
    expect(await startDuel(api, USER, DUEL)).toBe('started');
    expect(recorded).toHaveLength(1);
  });
});

describe('el duelo abierto en esta pestaña', () => {
  const base = {
    sessionId: 'sesion',
    userId: USER.id,
    kind: 'challenge' as const,
    duelId: DUEL.id,
    ended: false,
  };

  it('es la práctica de tipo reto que no ha terminado, de este alumno', () => {
    expect(activeDuelSessionOf(base, USER.id)).toBe('sesion');
    expect(activeDuelSessionOf({ ...base, ended: true }, USER.id)).toBeNull();
    expect(activeDuelSessionOf({ ...base, kind: 'practice', duelId: null }, USER.id)).toBeNull();
    expect(activeDuelSessionOf(base, newId())).toBeNull();
  });
});
