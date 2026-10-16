import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { PRIVACY_NOTICE_VERSION } from '@/config/legal';
import { createEvent } from '../events/createEvent';
import type { AppEvent } from '../schemas/events';
import { emptySyncState } from '../schemas/sync';
import type { User } from '../schemas/people';
import { UserSettingsSchema } from '../schemas/people';
import { makeFakeCloud } from '../testing/fakeCloud';
import { makeUser, newId, testApi } from '../testing/fixtures';
import { linkCloudIdentity, resolveCloudSignup } from '../usecases/cloudLink';
import { currentConsents, setConsent } from '../usecases/profile';
import { submitOfficialScore, changeConsent } from '../usecases/privacy';
import { reconcileProfile } from './reconcileProfile';
import { runSync } from './runSync';
import { createMemoryServer, memoryTransport, type MemoryServer } from './testing/memoryTransport';

const AUTH = 'cuenta-de-prueba';
const BASE = Date.parse('2026-10-15T12:00:00.000Z');
const at = (seconds: number) => new Date(BASE + seconds * 1000);

interface Device {
  api: ReturnType<typeof testApi>;
  user: User;
  clock: { seconds: number };
  sync: () => ReturnType<typeof runSync>;
  /** Cambia un ajuste a la hora de este dispositivo, con su evento, como updateProfile */
  change: (key: string, value: unknown) => Promise<void>;
  settings: () => Promise<User>;
}

const disposers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});

async function device(server: MemoryServer, overrides: Partial<User> = {}): Promise<Device> {
  const api = testApi('real');
  disposers.push(() => api.dispose());
  const user = makeUser({ examDate: null, dailyMinutes: null, ...overrides });
  await api.repos.users.put(user);
  const clock = { seconds: 1000 };
  const now = () => at(clock.seconds);
  return {
    api,
    user,
    clock,
    sync: () =>
      runSync({
        api,
        transport: memoryTransport(server, now),
        userId: user.id,
        authId: AUTH,
        now,
      }),
    async change(key, value) {
      const current = (await api.repos.users.get(user.id)) as User;
      const next: User =
        key === 'examDate'
          ? { ...current, examDate: value as string | null }
          : key === 'dailyMinutes'
            ? { ...current, dailyMinutes: value as number | null }
            : {
                ...current,
                settings: UserSettingsSchema.parse({
                  ...current.settings,
                  [key.slice('settings.'.length)]: value,
                }),
              };
      await api.repos.users.put(next);
      await api.recordEvent(
        createEvent(
          'settings_changed',
          { key, value: value as never },
          { userId: user.id, tz: user.timeZone, clock: { now } },
        ),
      );
    },
    settings: async () => (await api.repos.users.get(user.id)) as User,
  };
}

/** Un evento de otro dispositivo, directo en el servidor, para valores que la app nunca escribiría */
function plantEvent(server: MemoryServer, seconds: number, key: string, value: unknown): void {
  const event = createEvent(
    'settings_changed',
    { key, value: 1 },
    { userId: newId(), tz: 'America/Merida', clock: { now: () => at(seconds) } },
  );
  server.seq += 1;
  server.events.set(event.id, {
    event: {
      id: event.id,
      type: event.type,
      at: event.at,
      tz: event.tz,
      sessionId: null,
      schemaVersion: 1,
      payload: { key, value },
    },
    seq: server.seq,
  });
}

const eventsOf = (d: Device, type: AppEvent['type']) =>
  d.api.repos.events.query({ userId: d.user.id, types: [type] });

describe('ajustes entre dos dispositivos', () => {
  it('un dispositivo nuevo recibe los ajustes, la fecha del ENARM y los mazos que sigue en la misma corrida', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    a.clock.seconds = 1100;
    await a.change('settings.newCardsPerDay', 35);
    await a.change('settings.dailyGoal', { metric: 'questions', value: 30 });
    await a.change('settings.followedDecks', ['cardiologia', 'pediatria']);
    await a.change('examDate', '2027-09-13');
    await a.change('dailyMinutes', 90);
    await a.sync();

    b.clock.seconds = 1200;
    expect((await b.sync()).status).toBe('ok');
    const user = await b.settings();
    expect(user.settings.newCardsPerDay).toBe(35);
    expect(user.settings.dailyGoal).toEqual({ metric: 'questions', value: 30 });
    expect(user.settings.followedDecks).toEqual(['cardiologia', 'pediatria']);
    expect(user.examDate).toBe('2027-09-13');
    expect(user.dailyMinutes).toBe(90);
    // Lo que no cambió en A se queda como estaba en B
    expect(user.settings.reviewsPerDay).toBe(200);
  });

  it('gana el cambio más reciente, en los dos sentidos', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    a.clock.seconds = 1100;
    await a.change('settings.reviewsPerDay', 100);
    b.clock.seconds = 1200;
    await b.change('settings.reviewsPerDay', 150);
    await a.sync();
    await b.sync();
    await a.sync();
    expect((await a.settings()).settings.reviewsPerDay).toBe(150);
    expect((await b.settings()).settings.reviewsPerDay).toBe(150);
    // Y si A cambia después, B lo recibe
    a.clock.seconds = 1300;
    await a.change('settings.reviewsPerDay', 80);
    await a.sync();
    await b.sync();
    expect((await b.settings()).settings.reviewsPerDay).toBe(80);
  });

  it('un cambio más viejo que el que ya hay no lo pisa', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    a.clock.seconds = 1300;
    await a.change('settings.reviewsPerDay', 90);
    await a.sync();
    // B cambió antes, offline, y recién sincroniza
    b.clock.seconds = 1100;
    await b.change('settings.reviewsPerDay', 120);
    b.clock.seconds = 1400;
    await b.sync();
    expect((await b.settings()).settings.reviewsPerDay).toBe(90);
    await a.sync();
    expect((await a.settings()).settings.reviewsPerDay).toBe(90);
  });

  it('un valor que no cumple el campo, o una clave que no conoce, se ignora', async () => {
    const server = createMemoryServer();
    const b = await device(server);
    plantEvent(server, 1100, 'settings.desiredRetention', 0.5);
    plantEvent(server, 1110, 'settings.clave_nueva', true);
    plantEvent(server, 1120, 'settings.optionsShown', 6);
    plantEvent(server, 1130, 'alias', 'Otro nombre');
    expect((await b.sync()).status).toBe('ok');
    const user = await b.settings();
    expect(user.settings.desiredRetention).toBe(0.9);
    expect(user.settings.optionsShown).toBe(6);
    expect(user.alias).toBe(b.user.alias);
  });

  it('el cambio de este dispositivo que se hizo mientras se reconciliaba se queda', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    a.clock.seconds = 1100;
    await a.change('settings.reviewsPerDay', 60);
    await a.sync();
    const b = await device(server);
    // Ya con la bitácora leída y el plan hecho, el alumno cambia la misma clave. Eso pasa mientras se
    // lee el puntaje, que es lo último que se consulta antes de escribir
    let reads = 0;
    const wrapped = {
      ...b.api,
      repos: {
        ...b.api.repos,
        officialScores: {
          ...b.api.repos.officialScores,
          async get(id: string) {
            reads += 1;
            if (reads === 1) {
              b.clock.seconds = 1500;
              await b.change('settings.reviewsPerDay', 45);
            }
            return b.api.repos.officialScores.get(id);
          },
        },
      },
    };
    await b.sync();
    const synced = await b.settings();
    expect(synced.settings.reviewsPerDay).toBe(60);
    // Se regresa a lo de antes y se reconcilia con el cambio en medio
    await b.api.repos.users.put({
      ...synced,
      settings: UserSettingsSchema.parse({ ...synced.settings, reviewsPerDay: 200 }),
    });
    await reconcileProfile(
      { api: wrapped, userId: b.user.id, authId: AUTH, now: () => at(1600) },
      { ...emptySyncState(b.user.id, AUTH), baselineAt: at(1000).toISOString() },
      { profileEvents: true, records: false },
    );
    expect(reads).toBe(1);
    // El 45 de B es más nuevo que el 60 de A y no lo pisa lo que ya se había planeado
    expect((await b.settings()).settings.reviewsPerDay).toBe(45);
  });

  it('sin novedades no toca el perfil, y sin el perfil no hace nada', async () => {
    const server = createMemoryServer();
    const b = await device(server);
    await b.sync();
    const before = await b.settings();
    // Un cambio local que todavía no sube. La siguiente sincronización no trae eventos de ajustes
    b.clock.seconds = 1500;
    await b.change('settings.optionsShown', 7);
    await b.sync();
    expect({ ...(await b.settings()), settings: undefined }).toEqual({
      ...before,
      settings: undefined,
    });
    expect((await b.settings()).settings.optionsShown).toBe(7);
    // Sin el perfil local no hay nada que reconciliar
    const state = emptySyncState('01J0000000000000000000NONE', AUTH);
    await expect(
      reconcileProfile(
        { api: b.api, userId: state.userId, authId: AUTH, now: () => at(1600) },
        state,
        { profileEvents: true, records: false },
      ),
    ).resolves.toEqual(state);
  });
});

describe('permisos entre dos dispositivos', () => {
  it('lo que se prende en uno se ve prendido en el otro, sin duplicar las filas del que lo hizo', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await setConsent(a.api, a.user, 'party', true);
    await setConsent(a.api, a.user, 'anonymized_improvement', true);
    const rowsA = (await a.api.repos.consents.list()).length;
    await a.sync();
    await b.sync();
    expect(await currentConsents(b.api, b.user.id)).toEqual({
      party: true,
      ai_analysis: false,
      anonymized_improvement: true,
    });
    // Cada fila de B es la de un evento, con el id del evento
    const eventIds = new Set((await eventsOf(b, 'consent_changed')).map((event) => event.id));
    const rowsB = await b.api.repos.consents.list();
    expect(rowsB).toHaveLength(2);
    expect(rowsB.every((row) => eventIds.has(row.id))).toBe(true);
    expect(rowsB[0]?.noticeVersion).toBe(PRIVACY_NOTICE_VERSION);
    // Repetir las sincronizaciones no duplica nada, ni en B ni en A
    await a.sync();
    await b.sync();
    await a.sync();
    expect(await b.api.repos.consents.list()).toHaveLength(2);
    expect(await a.api.repos.consents.list()).toHaveLength(rowsA);
  });

  it('un dispositivo nuevo que acepta el aviso de la cuenta no apaga los permisos que ya se dieron en otro', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    await setConsent(a.api, a.user, 'party', true);
    await setConsent(a.api, a.user, 'anonymized_improvement', true);
    await a.sync();

    // B entra por primera vez con la cuenta. Nace sin formulario y la nube dice que ya aceptó el aviso
    const b = testApi('real');
    disposers.push(() => b.dispose());
    const identity = {
      authId: AUTH,
      email: 'rick@example.com',
      role: 'student' as const,
      alias: 'Rick',
    };
    const linked = await linkCloudIdentity(b, identity);
    const fake = makeFakeCloud();
    fake.remoteAccount = { adult_confirmed_at: '2026-10-12T09:00:00.000Z' };
    fake.acceptances = [PRIVACY_NOTICE_VERSION];
    expect(await resolveCloudSignup(b, fake.cloud, AUTH, linked.userId)).toBe('complete');
    // Entrar así no es una decisión del alumno y no deja ningún evento
    expect(await b.repos.events.query({ userId: linked.userId })).toEqual([]);
    expect(await currentConsents(b, linked.userId)).toEqual({
      party: false,
      ai_analysis: false,
      anonymized_improvement: false,
    });

    const now = () => at(1200);
    const bTransport = memoryTransport(server, now);
    await runSync({ api: b, transport: bTransport, userId: linked.userId, authId: AUTH, now });
    expect(await currentConsents(b, linked.userId)).toEqual({
      party: true,
      ai_analysis: false,
      anonymized_improvement: true,
    });
    // Y sigue así en A, que no recibió nada de B
    await a.sync();
    expect(await currentConsents(a.api, a.user.id)).toEqual({
      party: true,
      ai_analysis: false,
      anonymized_improvement: true,
    });
    expect(
      [...server.events.values()].filter((row) => row.event.type === 'consent_changed'),
    ).toHaveLength(2);
  });

  it('retirar un permiso en un dispositivo lo retira en el otro', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await setConsent(a.api, a.user, 'ai_analysis', true);
    await a.sync();
    await b.sync();
    expect((await currentConsents(b.api, b.user.id)).ai_analysis).toBe(true);
    // Un instante después
    await new Promise((resolve) => setTimeout(resolve, 5));
    await setConsent(b.api, b.user, 'ai_analysis', false);
    await b.sync();
    await a.sync();
    expect((await currentConsents(a.api, a.user.id)).ai_analysis).toBe(false);
  });

  it('retirar la mejora anónima en otro dispositivo borra el puntaje oficial de este', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await changeConsent(a.api, a.user, 'anonymized_improvement', true);
    await submitOfficialScore(a.api, a.user, { year: 2026, score: 71.5 });
    await a.sync();
    await b.sync();
    // El puntaje no viaja. Solo el año está en la bitácora y B no tiene el número
    expect(await b.api.repos.officialScores.get(b.user.id)).toBeUndefined();
    const sent = JSON.stringify([...server.events.values()].map((row) => row.event.payload));
    expect(sent).not.toContain('71.5');
    expect((await currentConsents(b.api, b.user.id)).anonymized_improvement).toBe(true);
    // B retira el permiso. A lo recibe y su puntaje se borra
    await new Promise((resolve) => setTimeout(resolve, 5));
    await changeConsent(b.api, b.user, 'anonymized_improvement', false);
    await b.sync();
    expect(await a.api.repos.officialScores.get(a.user.id)).toBeDefined();
    await a.sync();
    expect(await a.api.repos.officialScores.get(a.user.id)).toBeUndefined();
    expect((await currentConsents(a.api, a.user.id)).anonymized_improvement).toBe(false);
  });

  it('un puntaje capturado después del retiro se queda', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    const b = await device(server);
    await changeConsent(b.api, b.user, 'anonymized_improvement', false);
    await b.sync();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await changeConsent(a.api, a.user, 'anonymized_improvement', true);
    await submitOfficialScore(a.api, a.user, { year: 2026, score: 64 });
    await a.sync();
    expect(await a.api.repos.officialScores.get(a.user.id)).toMatchObject({ score: 64 });
  });
});

describe('línea base de los ajustes que nacieron sin evento', () => {
  it('deja un evento por ajuste distinto de fábrica, una sola vez, y sube en la misma corrida', async () => {
    const server = createMemoryServer();
    const a = await device(server, {
      settings: UserSettingsSchema.parse({ dailyGoal: { metric: 'questions', value: 30 } }),
      examDate: '2027-09-13',
    });
    expect((await a.sync()).status).toBe('ok');
    const keys = (await eventsOf(a, 'settings_changed')).map((event) =>
      event.type === 'settings_changed' ? event.payload.key : '',
    );
    expect(keys.sort()).toEqual(['examDate', 'settings.dailyGoal']);
    // Subieron en esa misma corrida
    const onServer = [...server.events.values()].map((row) => row.event.payload.key);
    expect(onServer.sort()).toEqual(['examDate', 'settings.dailyGoal']);
    const state = await a.api.repos.syncState.get(a.user.id);
    expect(state?.baselineAt).toBeDefined();
    // La segunda corrida no vuelve a registrar nada
    await a.sync();
    expect(await eventsOf(a, 'settings_changed')).toHaveLength(2);
  });

  it('otro dispositivo recibe esos ajustes aunque nacieran sin evento', async () => {
    const server = createMemoryServer();
    const a = await device(server, {
      settings: UserSettingsSchema.parse({ dailyGoal: { metric: 'focusMinutes', value: 45 } }),
    });
    await a.sync();
    const b = await device(server);
    await b.sync();
    expect((await b.settings()).settings.dailyGoal).toEqual({ metric: 'focusMinutes', value: 45 });
  });

  it('no pisa un cambio que otro dispositivo ya registró', async () => {
    const server = createMemoryServer();
    const a = await device(server);
    a.clock.seconds = 1100;
    await a.change('settings.newCardsPerDay', 30);
    await a.sync();
    // B es un perfil de antes de B14, con un valor distinto y sin ningún evento
    const b = await device(server, {
      settings: UserSettingsSchema.parse({ newCardsPerDay: 50, optionsShown: 6 }),
    });
    b.clock.seconds = 1200;
    await b.sync();
    const user = await b.settings();
    expect(user.settings.newCardsPerDay).toBe(30);
    // Lo que ningún dispositivo registró sí queda registrado
    expect(user.settings.optionsShown).toBe(6);
    const fromB = (await eventsOf(b, 'settings_changed')).flatMap((event) =>
      event.type === 'settings_changed' &&
      event.userId === b.user.id &&
      event.at === at(1200).toISOString()
        ? [event.payload.key]
        : [],
    );
    expect(fromB).toEqual(['settings.optionsShown']);
  });

  it('con otra cuenta en el mismo dispositivo la línea base se vuelve a hacer', async () => {
    const server = createMemoryServer();
    const a = await device(server, {
      settings: UserSettingsSchema.parse({ reviewsPerDay: 150 }),
    });
    await a.sync();
    expect((await a.api.repos.syncState.get(a.user.id))?.authId).toBe(AUTH);
    await runSync({
      api: a.api,
      transport: memoryTransport(createMemoryServer(), () => at(a.clock.seconds)),
      userId: a.user.id,
      authId: 'otra-cuenta',
      now: () => at(a.clock.seconds),
    });
    const state = await a.api.repos.syncState.get(a.user.id);
    expect(state?.authId).toBe('otra-cuenta');
    expect(state?.baselineAt).toBeDefined();
  });
});
