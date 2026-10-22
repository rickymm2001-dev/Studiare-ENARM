// Recordatorios, foto de vencidas, identidad de la analítica y pruebas de alertas del Supabase simulado
// (B15, paso 0, 6.4 del plan de B15). Imita lo que publican supabase/migrations/20261029000001_email_reminders.sql
// y 20261029000002_product_analytics.sql, con las formas de src/data/cloud/engagementContracts.ts, y las
// dos funciones de B15 que atiende el navegador, email-unsubscribe (sin verificación de JWT) y
// monitoring-test (solo admin con segundo factor). fakeSupabase.ts lo engancha. Está siempre, como en el
// servidor real, y con deployed en false imita un proyecto sin las migraciones, donde las funciones no
// existen y la app tiene que seguir sin recordatorios.
//
// En el paso 0 hace lo mínimo y con sentido, guarda lo que la app manda y lo devuelve con la forma buena.
// El paquete B de B15 lo completa con lo que necesiten sus specs. Todo es simulado y nunca se mezcla con
// datos reales. Nunca guarda un correo, y la ficha de baja es solo un texto al azar
import { randomBytes, randomUUID } from 'node:crypto';
import {
  ALL_WEEK_DAYS,
  ADMIN_EMAIL_OVERVIEW_RPC,
  DEFAULT_REMINDER_HOUR,
  DueSnapshotSchema,
  EMAIL_UNSUBSCRIBE_FUNCTION,
  ENGAGEMENT_RPC,
  MONITORING_TEST_FUNCTION,
  REMINDER_HOURS,
  UNSUBSCRIBE_PAGE_PATH,
  UNSUBSCRIBE_TOKEN,
  frequencyOf,
  type AnalyticsIdentity,
  type DueSnapshot,
  type EmailOverview,
  type EmailUnsubscribeReply,
  type MonitoringTestReply,
  type ReminderPrefs,
} from '@/data/cloud/engagementContracts';
import { DEFAULT_TIME_ZONE } from '@/data/schemas/common';

/** Las funciones de la base que atiende el doble para cualquier alumno con su dispositivo activo */
export const ENGAGEMENT_STUDENT_RPCS = [
  ENGAGEMENT_RPC.reminderPrefs,
  ENGAGEMENT_RPC.setReminderPrefs,
  ENGAGEMENT_RPC.putDueSnapshot,
  ENGAGEMENT_RPC.analyticsIdentity,
  ENGAGEMENT_RPC.setAnalyticsConsent,
] as const;
/** La del admin, con segundo factor */
export const ENGAGEMENT_ADMIN_RPCS = [ADMIN_EMAIL_OVERVIEW_RPC] as const;
export type EngagementRpc =
  (typeof ENGAGEMENT_STUDENT_RPCS)[number] | (typeof ENGAGEMENT_ADMIN_RPCS)[number];

const RPC_SET: ReadonlySet<string> = new Set<string>([
  ...ENGAGEMENT_STUDENT_RPCS,
  ...ENGAGEMENT_ADMIN_RPCS,
]);
export const isEngagementRpc = (name: string): name is EngagementRpc => RPC_SET.has(name);

/** Los correos que mandan los recordatorios de B15 y los avisos que ya encolan B10, B11 y B14 */
export const FAKE_EMAIL_KINDS = [
  'trial_ending',
  'pass_expiring',
  'invoice_requested',
  'content_report',
  'distractor_flags',
  'daily_review_reminder',
] as const;

// ===================================================================== Estado

interface StoredPrefs {
  prefs: ReminderPrefs;
  /** La ficha de baja de este alumno. Cambia al volver a prender los recordatorios */
  token: string;
}

export interface FakeEngagementStore {
  /** false imita un proyecto sin las migraciones de B15, donde las funciones no existen */
  deployed: boolean;
  /** Los recordatorios de cada alumno, por el id de su cuenta */
  prefs: Map<string, StoredPrefs>;
  /** La última foto de vencidas de cada alumno */
  snapshots: Map<string, DueSnapshot>;
  /** El identificador seudónimo de cada alumno y si dio el permiso, en el servidor */
  identities: Map<string, AnalyticsIdentity>;
  /** Lo que devuelve admin_email_overview */
  overview: EmailOverview;
  /** monitoring-test. dsn en false es una función sin SENTRY_DSN. calls cuenta las veces que se llamó */
  monitoring: { dsn: boolean; calls: number };
}

/** Un doble recién abierto. Sin recordatorios, sin fotos, sin identidades y con todos los tipos en cero */
export function createFakeEngagementStore(): FakeEngagementStore {
  return {
    deployed: true,
    prefs: new Map(),
    snapshots: new Map(),
    identities: new Map(),
    overview: emptyEmailOverview(),
    monitoring: { dsn: true, calls: 0 },
  };
}

/**
 * Quita lo de una cuenta, como delete_my_data v4 y el on delete cascade de delete_my_account (B15, 3.8). Los
 * recordatorios con su ficha de baja, la foto de vencidas y el identificador de la analítica con su permiso
 */
export function forgetEngagementUser(store: FakeEngagementStore, userId: string): void {
  store.prefs.delete(userId);
  store.snapshots.delete(userId);
  store.identities.delete(userId);
}

export function emptyEmailOverview(days = 7): EmailOverview {
  return {
    days,
    kinds: FAKE_EMAIL_KINDS.map((kind) => ({ kind, queued: 0, sent: 0, skipped: 0, failed: 0 })),
  };
}

/** Los recordatorios de quien nunca los ha guardado. Apagados, a las 8 de la noche y todos los días */
export function defaultReminderPrefs(): ReminderPrefs {
  return {
    available: true,
    enabled: false,
    hour: DEFAULT_REMINDER_HOUR,
    days: [...ALL_WEEK_DAYS],
    frequency: 'daily',
    onlyWhenDue: true,
    timeZone: DEFAULT_TIME_ZONE,
    unsubscribed: false,
  };
}

/** La ficha de baja, 18 bytes al azar en hexadecimal (36 caracteres), como encode(gen_random_bytes(18), 'hex') */
const newToken = (): string => randomBytes(18).toString('hex');

/** Lo que el doble sabe de quien llama. El dispositivo activo y el rol salen del Supabase simulado */
export interface FakeEngagementCaller {
  userId: string;
  activeDevice: boolean;
  /** Admin o dueño con su segundo factor */
  isAdmin: boolean;
}

export interface FakeEngagementReply {
  status: number;
  /** Sin json, la respuesta va en blanco (204 de una función que no devuelve nada) */
  json?: unknown;
  headers?: Record<string, string>;
}

const ok = (value: unknown): FakeEngagementReply => ({ status: 200, json: value });
const blank = (status: number): FakeEngagementReply => ({ status });
const fail = (code: string, message: string, status: number): FakeEngagementReply => ({
  status,
  json: { code, message, details: null, hint: null },
});
const NOT_ACTIVE = fail('42501', 'Este dispositivo no es el activo de la cuenta', 403);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function validTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone === '') return false;
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// ===================================================================== Funciones de la base

/** Las funciones rpc de B15, con las reglas de la migración. Quien llama ya tiene sesión */
export function fakeEngagementRpc(
  store: FakeEngagementStore,
  name: EngagementRpc,
  caller: FakeEngagementCaller,
  args: Record<string, unknown>,
): FakeEngagementReply {
  if (!store.deployed) {
    return fail('PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
  }
  if (name === ADMIN_EMAIL_OVERVIEW_RPC) {
    return caller.isAdmin
      ? ok(store.overview)
      : fail('42501', 'Solo un administrador puede ver los correos', 403);
  }
  if (!caller.activeDevice) return NOT_ACTIVE;
  const stored = store.prefs.get(caller.userId);
  switch (name) {
    case ENGAGEMENT_RPC.reminderPrefs:
      return ok(stored?.prefs ?? defaultReminderPrefs());
    case ENGAGEMENT_RPC.setReminderPrefs:
      return setReminderPrefs(store, caller.userId, args);
    case ENGAGEMENT_RPC.putDueSnapshot: {
      const parsed = DueSnapshotSchema.safeParse(args.p_snapshot);
      if (!parsed.success) return fail('22023', 'La foto de tarjetas vencidas no es válida', 400);
      store.snapshots.set(caller.userId, parsed.data);
      return blank(204);
    }
    case ENGAGEMENT_RPC.analyticsIdentity:
      return ok(identityOf(store, caller.userId));
    case ENGAGEMENT_RPC.setAnalyticsConsent:
      return typeof args.p_granted === 'boolean'
        ? ok(setConsent(store, caller.userId, args.p_granted))
        : fail('22023', 'Falta decir si das el permiso', 400);
  }
}

function setReminderPrefs(
  store: FakeEngagementStore,
  userId: string,
  args: Record<string, unknown>,
): FakeEngagementReply {
  const { p_enabled: enabled, p_hour: hour, p_days: days, p_time_zone: zone } = args;
  const onlyWhenDue = args.p_only_when_due;
  if (typeof enabled !== 'boolean' || typeof onlyWhenDue !== 'boolean') {
    return fail('22023', 'Faltan los datos del recordatorio', 400);
  }
  if (
    typeof hour !== 'number' ||
    !Number.isInteger(hour) ||
    hour < REMINDER_HOURS.min ||
    hour > REMINDER_HOURS.max
  ) {
    return fail('22023', 'La hora va de las 5 a las 23', 400);
  }
  const validDays =
    Array.isArray(days) &&
    days.length >= 1 &&
    days.length <= 7 &&
    days.every((day) => typeof day === 'number' && Number.isInteger(day) && day >= 0 && day <= 6);
  if (!validDays) return fail('22023', 'Los días van de 0 a 6', 400);
  if (!validTimeZone(zone)) return fail('22023', 'Esa zona horaria no existe', 400);
  const sorted = [...new Set(days as number[])].sort((a, b) => a - b);
  const before = store.prefs.get(userId);
  // Volver a prender cambia la ficha y quita la baja, como en la base
  const reenabled = enabled && (!before?.prefs.enabled || before.prefs.unsubscribed);
  const prefs: ReminderPrefs = {
    available: true,
    enabled,
    hour,
    days: sorted,
    frequency: frequencyOf(sorted),
    onlyWhenDue,
    timeZone: zone,
    unsubscribed: reenabled ? false : (before?.prefs.unsubscribed ?? false),
  };
  store.prefs.set(userId, {
    prefs,
    token: reenabled || !before ? newToken() : before.token,
  });
  return ok(prefs);
}

function identityOf(store: FakeEngagementStore, userId: string): AnalyticsIdentity {
  const found = store.identities.get(userId);
  if (found) return found;
  const created: AnalyticsIdentity = { analyticsId: randomUUID(), consent: false };
  store.identities.set(userId, created);
  return created;
}

/** Retirar el permiso cambia el identificador, así lo que se mida después no se une con lo de antes */
function setConsent(
  store: FakeEngagementStore,
  userId: string,
  granted: boolean,
): AnalyticsIdentity {
  const current = identityOf(store, userId);
  const next: AnalyticsIdentity =
    granted === current.consent
      ? current
      : { analyticsId: granted ? current.analyticsId : randomUUID(), consent: granted };
  store.identities.set(userId, next);
  return next;
}

// ===================================================================== Baja de un clic

/** La ficha de baja de un alumno, para que una prueba arme el enlace del correo. null si no tiene */
export function unsubscribeTokenOf(store: FakeEngagementStore, userId: string): string | null {
  return store.prefs.get(userId)?.token ?? null;
}

function unsubscribe(store: FakeEngagementStore, token: string): EmailUnsubscribeReply['result'] {
  if (!UNSUBSCRIBE_TOKEN.test(token)) return 'invalid';
  for (const [userId, stored] of store.prefs) {
    if (stored.token !== token) continue;
    if (stored.prefs.unsubscribed) return 'already';
    store.prefs.set(userId, {
      ...stored,
      prefs: { ...stored.prefs, enabled: false, unsubscribed: true },
    });
    return 'done';
  }
  return 'invalid';
}

export const EMAIL_UNSUBSCRIBE_PATH = `/functions/v1/${EMAIL_UNSUBSCRIBE_FUNCTION}`;

/** Lo que el doble necesita de la petición a email-unsubscribe, ya leída por el Supabase simulado */
export interface FakeUnsubscribeRequest {
  method: string;
  /** El valor de ?t=, o null si no vino */
  queryToken: string | null;
  contentType: string | null;
  /** El cuerpo ya leído como JSON, o null si no es JSON */
  json: unknown;
  /** La dirección pública de la app, a donde redirige el GET */
  appUrl: string;
}

/**
 * email-unsubscribe, sin verificación de JWT. El POST de un clic del correo (formulario, ficha en ?t=) se
 * da de baja y siempre recibe 200 en blanco. El POST de la página de la app (JSON con la ficha) recibe el
 * resultado. El GET manda a la página de la app, porque una función no puede servir HTML
 */
export function fakeEmailUnsubscribe(
  store: FakeEngagementStore,
  request: FakeUnsubscribeRequest,
): FakeEngagementReply {
  if (!store.deployed) return fail('NOT_FOUND', 'Requested function was not found', 404);
  if (request.method === 'GET') {
    const target = new URL(`${request.appUrl}${UNSUBSCRIBE_PAGE_PATH}`);
    if (request.queryToken) target.searchParams.set('t', request.queryToken);
    return { status: 302, headers: { location: target.toString() } };
  }
  if (request.method !== 'POST') return fail('METHOD', 'Solo POST', 405);
  const fromPage = request.contentType?.includes('application/json') === true;
  if (fromPage) {
    const token = isRecord(request.json) ? request.json.token : null;
    return ok({ result: typeof token === 'string' ? unsubscribe(store, token) : 'invalid' });
  }
  unsubscribe(store, request.queryToken ?? '');
  return blank(200);
}

// ===================================================================== Error de prueba

/** monitoring-test. Solo admin con segundo factor. Cuenta la llamada y dice si había DSN */
export function fakeMonitoringTest(
  store: FakeEngagementStore,
  caller: FakeEngagementCaller | null,
): FakeEngagementReply {
  if (!store.deployed) return fail('NOT_FOUND', 'Requested function was not found', 404);
  if (!caller) return { status: 401, json: { error: 'unauthorized' } };
  if (!caller.isAdmin) return { status: 403, json: { error: 'not_admin' } };
  store.monitoring.calls += 1;
  const reply: MonitoringTestReply = { result: store.monitoring.dsn ? 'sent' : 'missing_dsn' };
  return ok(reply);
}

export const MONITORING_TEST_PATH = `/functions/v1/${MONITORING_TEST_FUNCTION}`;
