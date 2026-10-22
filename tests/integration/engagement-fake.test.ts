// El doble de recordatorios, foto de vencidas, identidad de la analítica y funciones de B15 contra los
// contratos de src/data/cloud/engagementContracts.ts (paso 0 de B15). Comprueba sin navegador que lo que
// contesta fakeEngagement.ts cumple las formas que validará la app, y que cumple las reglas de las
// migraciones que protegen la privacidad. Así las e2e de la nube fallan por la app y no por el doble.
// Todo es simulado
import { describe, expect, it } from 'vitest';
import {
  AnalyticsIdentitySchema,
  ADMIN_EMAIL_OVERVIEW_RPC,
  ENGAGEMENT_RPC,
  EmailOverviewSchema,
  EmailUnsubscribeReplySchema,
  MonitoringTestReplySchema,
  ReminderPrefsSchema,
  UNSUBSCRIBE_TOKEN,
} from '@/data/cloud/engagementContracts';
import {
  ENGAGEMENT_STUDENT_RPCS,
  createFakeEngagementStore,
  fakeEmailUnsubscribe,
  fakeEngagementRpc,
  fakeMonitoringTest,
  forgetEngagementUser,
  isEngagementRpc,
  unsubscribeTokenOf,
  type ENGAGEMENT_ADMIN_RPCS,
  type FakeEngagementCaller,
  type FakeEngagementStore,
} from '../e2e/support/fakeEngagement';

const ana: FakeEngagementCaller = { userId: 'ana', activeDevice: true, isAdmin: false };
const admin: FakeEngagementCaller = { userId: 'jefe', activeDevice: true, isAdmin: true };
const APP = 'http://127.0.0.1:4174';

const call = (
  store: FakeEngagementStore,
  name: (typeof ENGAGEMENT_STUDENT_RPCS)[number] | (typeof ENGAGEMENT_ADMIN_RPCS)[number],
  args: Record<string, unknown> = {},
  caller: FakeEngagementCaller = ana,
) => fakeEngagementRpc(store, name, caller, args);

const SAVE = {
  p_enabled: true,
  p_hour: 20,
  p_days: [1, 2, 3, 4, 5],
  p_only_when_due: true,
  p_time_zone: 'America/Merida',
};

describe('recordatorios', () => {
  it('sin guardar nada devuelve la forma del contrato, apagado y a las 8 de la noche', () => {
    const store = createFakeEngagementStore();
    const reply = call(store, ENGAGEMENT_RPC.reminderPrefs);
    expect(reply.status).toBe(200);
    expect(ReminderPrefsSchema.parse(reply.json)).toMatchObject({
      available: true,
      enabled: false,
      hour: 20,
      frequency: 'daily',
      onlyWhenDue: true,
      unsubscribed: false,
    });
  });

  it('guardar devuelve lo guardado, con la frecuencia que salen de los días', () => {
    const store = createFakeEngagementStore();
    const saved = ReminderPrefsSchema.parse(
      call(store, ENGAGEMENT_RPC.setReminderPrefs, SAVE).json,
    );
    expect(saved).toMatchObject({
      enabled: true,
      hour: 20,
      days: [1, 2, 3, 4, 5],
      frequency: 'weekdays',
    });
    expect(ReminderPrefsSchema.parse(call(store, ENGAGEMENT_RPC.reminderPrefs).json)).toEqual(
      saved,
    );
    const custom = ReminderPrefsSchema.parse(
      call(store, ENGAGEMENT_RPC.setReminderPrefs, { ...SAVE, p_days: [6, 0, 6] }).json,
    );
    expect(custom).toMatchObject({ days: [0, 6], frequency: 'custom' });
  });

  it('valida la hora, los días, la zona y los booleanos como set_reminder_prefs', () => {
    const store = createFakeEngagementStore();
    const bad: Record<string, unknown>[] = [
      { ...SAVE, p_hour: 4 },
      { ...SAVE, p_hour: 24 },
      { ...SAVE, p_hour: 20.5 },
      { ...SAVE, p_days: [] },
      { ...SAVE, p_days: [7] },
      { ...SAVE, p_time_zone: 'Marte/Olimpo' },
      { ...SAVE, p_enabled: 'si' },
      { ...SAVE, p_only_when_due: null },
    ];
    for (const args of bad) {
      expect(call(store, ENGAGEMENT_RPC.setReminderPrefs, args).status, JSON.stringify(args)).toBe(
        400,
      );
    }
    expect(store.prefs.size).toBe(0);
  });

  it('pide dispositivo activo, y sin las migraciones las funciones no existen', () => {
    const store = createFakeEngagementStore();
    const inactive = { ...ana, activeDevice: false };
    for (const name of ENGAGEMENT_STUDENT_RPCS) {
      expect(call(store, name, SAVE, inactive).status, name).toBe(403);
    }
    store.deployed = false;
    for (const name of ENGAGEMENT_STUDENT_RPCS) {
      expect(call(store, name, SAVE).status, name).toBe(404);
    }
  });

  it('la foto de vencidas solo trae fechas y números, y una con otra cosa se rechaza', () => {
    const store = createFakeEngagementStore();
    const snapshot = {
      computedAt: '2026-10-20T15:00:00.000Z',
      timeZone: 'America/Merida',
      days: [{ day: '2026-10-20', due: 37 }],
      newAvailable: 10,
    };
    expect(call(store, ENGAGEMENT_RPC.putDueSnapshot, { p_snapshot: snapshot }).status).toBe(204);
    expect(store.snapshots.get('ana')).toEqual(snapshot);
    const withText = { ...snapshot, days: [{ day: '2026-10-20', due: 1, title: 'Mi tarjeta' }] };
    expect(call(store, ENGAGEMENT_RPC.putDueSnapshot, { p_snapshot: withText }).status).toBe(400);
  });
});

describe('baja de un clic', () => {
  const saved = () => {
    const store = createFakeEngagementStore();
    call(store, ENGAGEMENT_RPC.setReminderPrefs, SAVE);
    const token = unsubscribeTokenOf(store, 'ana');
    if (token === null) throw new Error('sin ficha');
    return { store, token };
  };
  const request = (
    token: string | null,
    init: { method?: string; json?: unknown; form?: boolean },
  ) => ({
    method: init.method ?? 'POST',
    queryToken: token,
    contentType:
      init.form === true
        ? 'application/x-www-form-urlencoded'
        : init.json === undefined
          ? null
          : 'application/json',
    json: init.json ?? null,
    appUrl: APP,
  });

  it('la ficha tiene la forma de la base, 36 caracteres en hexadecimal, y cambia al volver a prender', () => {
    const { store, token } = saved();
    expect(token).toMatch(UNSUBSCRIBE_TOKEN);
    call(store, ENGAGEMENT_RPC.setReminderPrefs, { ...SAVE, p_hour: 9 });
    // Guardar otra hora sin apagar no cambia la ficha
    expect(unsubscribeTokenOf(store, 'ana')).toBe(token);
    call(store, ENGAGEMENT_RPC.setReminderPrefs, { ...SAVE, p_enabled: false });
    call(store, ENGAGEMENT_RPC.setReminderPrefs, SAVE);
    const next = unsubscribeTokenOf(store, 'ana');
    expect(next).toMatch(UNSUBSCRIBE_TOKEN);
    expect(next).not.toBe(token);
  });

  it('el POST de un clic del correo apaga el recordatorio y siempre contesta 200 en blanco', () => {
    const { store, token } = saved();
    const reply = fakeEmailUnsubscribe(store, request(token, { form: true }));
    expect(reply).toEqual({ status: 200 });
    expect(store.prefs.get('ana')?.prefs).toMatchObject({ enabled: false, unsubscribed: true });
    // Con una ficha falsa o sin ficha contesta igual, para no revelar nada
    expect(fakeEmailUnsubscribe(store, request('0'.repeat(36), { form: true }))).toEqual({
      status: 200,
    });
    expect(fakeEmailUnsubscribe(store, request(null, { form: true }))).toEqual({ status: 200 });
  });

  it('el POST de la página dice done, already o invalid', () => {
    const { store, token } = saved();
    const ask = (value: string) =>
      EmailUnsubscribeReplySchema.parse(
        fakeEmailUnsubscribe(store, request(null, { json: { token: value } })).json,
      ).result;
    expect(ask(token)).toBe('done');
    expect(ask(token)).toBe('already');
    expect(ask('no-es-una-ficha')).toBe('invalid');
    expect(ask('a'.repeat(36))).toBe('invalid');
    // Volver a prender los recordatorios quita la baja
    call(store, ENGAGEMENT_RPC.setReminderPrefs, SAVE);
    expect(store.prefs.get('ana')?.prefs).toMatchObject({ enabled: true, unsubscribed: false });
    expect(ask(token)).toBe('invalid');
  });

  it('el GET manda a la página de la app con la ficha, porque una función no sirve HTML', () => {
    const { store, token } = saved();
    const reply = fakeEmailUnsubscribe(store, request(token, { method: 'GET' }));
    expect(reply.status).toBe(302);
    expect(reply.headers?.location).toBe(`${APP}/correo/baja?t=${token}`);
    // Un GET no da de baja a nadie, así los revisores de enlaces no la activan
    expect(store.prefs.get('ana')?.prefs.enabled).toBe(true);
    expect(fakeEmailUnsubscribe(store, request(null, { method: 'PUT' })).status).toBe(405);
  });
});

describe('identidad de la analítica', () => {
  it('crea un id aleatorio la primera vez, lo repite y empieza sin permiso', () => {
    const store = createFakeEngagementStore();
    const first = AnalyticsIdentitySchema.parse(call(store, ENGAGEMENT_RPC.analyticsIdentity).json);
    expect(first.consent).toBe(false);
    expect(
      AnalyticsIdentitySchema.parse(call(store, ENGAGEMENT_RPC.analyticsIdentity).json),
    ).toEqual(first);
    const other = AnalyticsIdentitySchema.parse(
      call(store, ENGAGEMENT_RPC.analyticsIdentity, {}, { ...ana, userId: 'beto' }).json,
    );
    expect(other.analyticsId).not.toBe(first.analyticsId);
  });

  it('retirar el permiso cambia el id, y darlo otra vez conserva el nuevo', () => {
    const store = createFakeEngagementStore();
    const before = AnalyticsIdentitySchema.parse(
      call(store, ENGAGEMENT_RPC.analyticsIdentity).json,
    );
    const granted = AnalyticsIdentitySchema.parse(
      call(store, ENGAGEMENT_RPC.setAnalyticsConsent, { p_granted: true }).json,
    );
    expect(granted).toEqual({ analyticsId: before.analyticsId, consent: true });
    const revoked = AnalyticsIdentitySchema.parse(
      call(store, ENGAGEMENT_RPC.setAnalyticsConsent, { p_granted: false }).json,
    );
    expect(revoked.consent).toBe(false);
    expect(revoked.analyticsId).not.toBe(before.analyticsId);
    const again = AnalyticsIdentitySchema.parse(
      call(store, ENGAGEMENT_RPC.setAnalyticsConsent, { p_granted: true }).json,
    );
    expect(again).toEqual({ analyticsId: revoked.analyticsId, consent: true });
    expect(call(store, ENGAGEMENT_RPC.setAnalyticsConsent, { p_granted: 'si' }).status).toBe(400);
  });
});

describe('admin y error de prueba', () => {
  it('admin_email_overview es solo del admin y trae todos los tipos, también los de cero', () => {
    const store = createFakeEngagementStore();
    expect(call(store, ADMIN_EMAIL_OVERVIEW_RPC).status).toBe(403);
    const overview = EmailOverviewSchema.parse(
      call(store, ADMIN_EMAIL_OVERVIEW_RPC, {}, admin).json,
    );
    expect(overview.kinds.map((item) => item.kind)).toContain('daily_review_reminder');
    expect(
      overview.kinds.every((item) => item.queued + item.sent + item.skipped + item.failed === 0),
    ).toBe(true);
  });

  it('monitoring-test pide sesión y admin, y dice si la función tiene DSN', () => {
    const store = createFakeEngagementStore();
    expect(fakeMonitoringTest(store, null).status).toBe(401);
    expect(fakeMonitoringTest(store, ana).status).toBe(403);
    expect(store.monitoring.calls).toBe(0);
    expect(MonitoringTestReplySchema.parse(fakeMonitoringTest(store, admin).json).result).toBe(
      'sent',
    );
    store.monitoring.dsn = false;
    expect(MonitoringTestReplySchema.parse(fakeMonitoringTest(store, admin).json).result).toBe(
      'missing_dsn',
    );
    expect(store.monitoring.calls).toBe(2);
  });
});

describe('borrar mis datos', () => {
  it('quita los recordatorios, la foto y el id de la analítica de esa cuenta y de ninguna otra', () => {
    const store = createFakeEngagementStore();
    const beto = { ...ana, userId: 'beto' };
    for (const caller of [ana, beto]) {
      call(store, ENGAGEMENT_RPC.setReminderPrefs, SAVE, caller);
      call(store, ENGAGEMENT_RPC.analyticsIdentity, {}, caller);
      call(
        store,
        ENGAGEMENT_RPC.putDueSnapshot,
        {
          p_snapshot: {
            computedAt: '2026-10-20T15:00:00.000Z',
            timeZone: 'America/Merida',
            days: [],
            newAvailable: 0,
          },
        },
        caller,
      );
    }
    forgetEngagementUser(store, 'ana');
    expect(
      [...store.prefs.keys(), ...store.snapshots.keys(), ...store.identities.keys()].sort(),
    ).toEqual(['beto', 'beto', 'beto']);
  });

  it('el doble solo atiende las funciones de B15', () => {
    expect(isEngagementRpc('my_reminder_prefs')).toBe(true);
    expect(isEngagementRpc('admin_email_overview')).toBe(true);
    expect(isEngagementRpc('my_plan')).toBe(false);
  });
});
