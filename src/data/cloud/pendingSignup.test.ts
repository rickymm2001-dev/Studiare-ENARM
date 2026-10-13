// @vitest-environment jsdom
// Lo que el alumno llenó en Crear cuenta mientras va a Google y regresa (B9)
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_DETAILS } from '../usecases/account';
import {
  PENDING_SIGNUP_KEY,
  PENDING_SIGNUP_TTL_MS,
  clearPendingSignup,
  savePendingSignup,
  takePendingSignup,
} from './pendingSignup';

const SIGNUP = {
  alias: 'Ricky',
  dailyGoal: { metric: 'cards' as const, value: 20 },
  details: { ...EMPTY_DETAILS, targetSpecialty: 'pediatrics' },
  adultConfirmedAt: '2026-10-13T09:00:00.000Z',
  heardFrom: { channel: 'friend' as const, influencerCode: null },
  consents: { party: true },
};

afterEach(() => {
  sessionStorage.clear();
});

describe('registro pendiente con Google', () => {
  it('se guarda en la pestaña, se toma una sola vez y se borra', () => {
    expect(savePendingSignup(SIGNUP)).toBe(true);
    expect(sessionStorage.getItem(PENDING_SIGNUP_KEY)).not.toBeNull();
    // Nunca en localStorage, que viviría más allá de la pestaña
    expect(localStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
    const taken = takePendingSignup();
    expect(taken).toMatchObject(SIGNUP);
    expect(takePendingSignup()).toBeNull();
  });

  it('caduca en una hora y lo que no se entiende se descarta', () => {
    savePendingSignup(SIGNUP);
    expect(takePendingSignup(Date.now() + PENDING_SIGNUP_TTL_MS + 1)).toBeNull();
    sessionStorage.setItem(PENDING_SIGNUP_KEY, '{"alias":""}');
    expect(takePendingSignup()).toBeNull();
    sessionStorage.setItem(PENDING_SIGNUP_KEY, '{ no es json');
    expect(takePendingSignup()).toBeNull();
    expect(sessionStorage.getItem(PENDING_SIGNUP_KEY)).toBeNull();
  });

  it('no guarda algo que no cumple el formato y se puede borrar a mano', () => {
    expect(savePendingSignup({ ...SIGNUP, alias: '' })).toBe(false);
    expect(
      savePendingSignup({
        ...SIGNUP,
        heardFrom: { channel: 'friend', influencerCode: 'con espacio' },
      }),
    ).toBe(false);
    savePendingSignup(SIGNUP);
    clearPendingSignup();
    expect(takePendingSignup()).toBeNull();
  });
});
