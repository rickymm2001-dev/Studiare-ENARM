import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import type { ReminderPrefs } from '../cloud/engagementContracts';
import type { MySurveyResponse } from '../cloud/survey';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { exportUserData } from './exportData';
import { createOutline, saveOutline } from './outlines';

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

it('exporta lo que el alumno creó y nada de lo de otra persona', async () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  const other = makeUser();
  await api.repos.users.put(user);
  const mine = await createOutline(api, user, { title: 'Mío' });
  await saveOutline(api, user, {
    outlineId: mine.id,
    nodes: [{ id: newId(), text: 'A >> B', children: [] }],
  });
  const theirs = await createOutline(api, other, { title: 'De otra persona' });
  await saveOutline(api, other, {
    outlineId: theirs.id,
    nodes: [{ id: newId(), text: 'C >> D', children: [] }],
  });

  const data = await exportUserData(api.repos, user.id);
  expect(data.format).toBe('enarm-prototipo-export-v2');
  expect(data.content.outlines.map((page) => page.title)).toEqual(['Mío']);
  expect(data.content.notes).toHaveLength(1);
  expect(data.content.cards).toHaveLength(1);
  // El mazo raíz Apuntes y el del apunte
  expect(data.content.decks.map((deck) => deck.name).sort()).toEqual(['Apuntes', 'Mío']);
  expect(JSON.stringify(data)).not.toContain('De otra persona');
});

it('incluye lo de Party que vive solo en la nube, y sin la nube el archivo sale igual', async () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  await api.repos.users.put(user);

  // Sin la nube conectada no hay nada de Party en la nube
  expect((await exportUserData(api.repos, user.id)).partyCloud).toBeNull();
  expect(
    (await exportUserData(api.repos, user.id, { partyCloud: () => Promise.resolve(null) }))
      .partyCloud,
  ).toBeNull();

  // Con la nube, las filas propias de Party
  const data = {
    memberships: [
      {
        groupId: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        groupName: 'Guardia',
        isOwner: true,
        joinedAt: '2026-10-12T15:00:00.000+00:00',
        leftAt: null,
      },
    ],
    weeklyXp: [],
    challengeContributions: [],
    challengesCreated: [],
    duels: [],
  };
  const included = await exportUserData(api.repos, user.id, {
    partyCloud: () => Promise.resolve({ status: 'included', data }),
  });
  expect(included.partyCloud).toEqual({ status: 'included', data });
  expect(included.user?.id).toBe(user.id);

  // Si la nube falla, el resto del archivo sale y dice por qué falta Party
  const failed = await exportUserData(api.repos, user.id, {
    partyCloud: () => Promise.reject(new Error('sin red')),
  });
  expect(failed.partyCloud).toEqual({ status: 'unavailable', reason: 'network' });
  expect(failed.user?.id).toBe(user.id);
});

it('incluye los recordatorios por correo de la nube, y sin la nube o si falla el archivo sale igual', async () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  await api.repos.users.put(user);

  // Sin la nube conectada no hay recordatorios que pedir
  expect((await exportUserData(api.repos, user.id)).remindersCloud).toBeNull();

  const prefs: ReminderPrefs = {
    available: true,
    enabled: true,
    hour: 20,
    days: [1, 2, 3, 4, 5],
    frequency: 'weekdays',
    onlyWhenDue: true,
    timeZone: 'America/Merida',
    unsubscribed: false,
  };
  const included = await exportUserData(api.repos, user.id, {
    remindersCloud: () => Promise.resolve({ status: 'included', data: prefs }),
  });
  expect(included.remindersCloud).toEqual({ status: 'included', data: prefs });
  // Ni la ficha de baja ni el correo viajan en el archivo
  expect(JSON.stringify(included)).not.toMatch(/unsubscribe_token|@/);

  // Si la nube falla, el resto del archivo sale y dice que no se pudieron leer
  const failed = await exportUserData(api.repos, user.id, {
    remindersCloud: () => Promise.reject(new Error('sin red')),
  });
  expect(failed.remindersCloud).toEqual({ status: 'unavailable' });
  expect(failed.user?.id).toBe(user.id);
});

it('incluye la respuesta a la encuesta de los primeros días con su código, sin cuenta, correo ni fecha de cuenta (B18)', async () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  const user = makeUser();
  await api.repos.users.put(user);

  // Sin la nube conectada no hay encuesta que pedir
  expect((await exportUserData(api.repos, user.id)).surveyCloud).toBeNull();

  const mine: MySurveyResponse = {
    surveyId: 'first-week-v1',
    code: 'R1A2B3C',
    daysSinceSignup: 8,
    answers: {
      days_used: 'd5_6',
      used: ['review', 'practice'],
      clarity: 4,
      ease: 5,
      useful: 4,
      blockers: ['slow'],
      recommend: 'yes',
    },
    comment: 'Me costó ubicar Simular',
    answeredAt: '2026-11-02T10:00:00Z',
  };
  const included = await exportUserData(api.repos, user.id, {
    surveyCloud: () => Promise.resolve({ status: 'included', data: mine }),
  });
  expect(included.surveyCloud).toEqual({ status: 'included', data: mine });
  expect(JSON.stringify(included.surveyCloud)).not.toMatch(/@|user_id/);

  // Quien no la contestó la ve incluida y vacía, y no como algo que falló
  const empty = await exportUserData(api.repos, user.id, {
    surveyCloud: () => Promise.resolve({ status: 'included', data: null }),
  });
  expect(empty.surveyCloud).toEqual({ status: 'included', data: null });

  // Si la nube falla, el resto del archivo sale y dice que no se pudo leer
  const failed = await exportUserData(api.repos, user.id, {
    surveyCloud: () => Promise.reject(new Error('sin red')),
  });
  expect(failed.surveyCloud).toEqual({ status: 'unavailable' });
  expect(failed.user?.id).toBe(user.id);
});
