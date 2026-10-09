import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { testApi } from '../testing/fixtures';
import { exportUserData } from './exportData';
import {
  OfficialScoreError,
  changeConsent,
  removeOfficialScore,
  submitOfficialScore,
} from './privacy';
import { createProfile, currentConsents } from './profile';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function setup() {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = await createProfile(api, {
    alias: 'Ana',
    dailyGoal: { metric: 'cards', value: 20 },
  });
  return { api, user };
}

const reasonOf = async (action: Promise<unknown>) => {
  try {
    await action;
  } catch (error) {
    return error instanceof OfficialScoreError ? error.reason : 'otro';
  }
  return 'sin error';
};

describe('consentimientos', () => {
  it('retirar y volver a dar un permiso cambia el estado vigente y deja un evento cada vez', async () => {
    const { api, user } = await setup();
    await changeConsent(api, user, 'party', false);
    expect((await currentConsents(api, user.id)).party).toBe(false);
    await changeConsent(api, user, 'party', true);
    expect((await currentConsents(api, user.id)).party).toBe(true);

    const changes = (await api.repos.events.query({ userId: user.id, types: ['consent_changed'] }))
      .flatMap((event) => (event.type === 'consent_changed' ? [event.payload] : []))
      .filter((payload) => payload.purpose === 'party');
    // Uno al crear el perfil y uno por cada cambio
    expect(changes.map((payload) => payload.status)).toEqual(['granted', 'revoked', 'granted']);
  });

  it('retirar la mejora anónima borra el puntaje oficial y retirar otro permiso no lo toca', async () => {
    const { api, user } = await setup();
    await submitOfficialScore(api, user, { year: 2025, score: 71.5 });

    await changeConsent(api, user, 'party', false);
    expect(await api.repos.officialScores.get(user.id)).toBeDefined();

    await changeConsent(api, user, 'anonymized_improvement', false);
    expect(await api.repos.officialScores.get(user.id)).toBeUndefined();
  });
});

describe('puntaje oficial', () => {
  it('se guarda ligado al consentimiento vigente y deja un evento sin identidad', async () => {
    const { api, user } = await setup();
    const saved = await submitOfficialScore(
      api,
      user,
      { year: 2025, score: 71.456 },
      new Date('2026-10-09T12:00:00Z'),
    );
    expect(saved.score).toBe(71.46);
    expect(saved.submittedAt).toBe('2026-10-09T12:00:00.000Z');
    const consents = await api.repos.consents.list();
    expect(consents.find((consent) => consent.id === saved.consentId)?.purpose).toBe(
      'anonymized_improvement',
    );
    const [event] = await api.repos.events.query({
      userId: user.id,
      types: ['official_score_submitted'],
    });
    expect(event?.payload).toEqual({ year: 2025, score: 71.46 });
  });

  it('el segundo reemplaza al primero, porque se guarda uno por alumno', async () => {
    const { api, user } = await setup();
    await submitOfficialScore(api, user, { year: 2024, score: 60 });
    await submitOfficialScore(api, user, { year: 2025, score: 72 });
    const all = await api.repos.officialScores.list();
    expect(all.map((score) => [score.year, score.score])).toEqual([[2025, 72]]);
  });

  it('no se guarda sin el permiso de mejora anónima', async () => {
    const { api, user } = await setup();
    await changeConsent(api, user, 'anonymized_improvement', false);
    expect(await reasonOf(submitOfficialScore(api, user, { year: 2025, score: 70 }))).toBe(
      'no_consent',
    );
    expect(await api.repos.officialScores.list()).toEqual([]);
  });

  it('rechaza años y puntajes fuera de rango', async () => {
    const { api, user } = await setup();
    expect(await reasonOf(submitOfficialScore(api, user, { year: 1999, score: 70 }))).toBe(
      'invalid_year',
    );
    expect(await reasonOf(submitOfficialScore(api, user, { year: 2025.5, score: 70 }))).toBe(
      'invalid_year',
    );
    expect(await reasonOf(submitOfficialScore(api, user, { year: 2025, score: -1 }))).toBe(
      'invalid_score',
    );
    expect(await reasonOf(submitOfficialScore(api, user, { year: 2025, score: 100.5 }))).toBe(
      'invalid_score',
    );
    expect(await reasonOf(submitOfficialScore(api, user, { year: 2025, score: Number.NaN }))).toBe(
      'invalid_score',
    );
    expect(await api.repos.officialScores.list()).toEqual([]);
  });

  it('quitarlo no cambia el consentimiento y entra al archivo que el alumno exporta', async () => {
    const { api, user } = await setup();
    await submitOfficialScore(api, user, { year: 2025, score: 70 });
    expect((await exportUserData(api.repos, user.id)).officialScore?.score).toBe(70);

    await removeOfficialScore(api, user.id);
    expect((await exportUserData(api.repos, user.id)).officialScore).toBeNull();
    expect((await currentConsents(api, user.id)).anonymized_improvement).toBe(true);
  });

  it('el puntaje de otra persona no entra al archivo exportado', async () => {
    const { api, user } = await setup();
    const other = await createProfile(api, {
      alias: 'Beto',
      dailyGoal: { metric: 'cards', value: 20 },
    });
    await submitOfficialScore(api, other, { year: 2025, score: 88 });
    expect((await exportUserData(api.repos, user.id)).officialScore).toBeNull();
  });
});
