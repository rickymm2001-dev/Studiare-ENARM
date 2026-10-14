// Supabase simulado para las pruebas de nube de Playwright. Vive en memoria dentro del proceso de la
// prueba y atiende, con context.route, todo lo que la app le pide al proyecto falso de
// fakeSupabaseConfig.ts. Imita las formas exactas que esperan supabase-js y la app, auth (otp,
// verify, user, logout, refresh), PostgREST (tablas con filtros y las funciones rpc de las
// migraciones de supabase/migrations) y las Edge Functions de pago, más la pasarela y el portal de
// Stripe simulados que esas funciones devuelven. Los correos no existen. La prueba lee del servidor
// el código de un solo uso y el enlace que "se mandaron" a cada correo.
//
// Lo que NO simula queda dicho en tests/e2e/cloud/README.md. Reglas que sí hace cumplir, iguales a
// las de la base: un solo dispositivo activo por cuenta con su límite de cambios (DV001), el plan lo
// decide el servidor con el pago, el mes gratis por referido llega con el primer pago, borrar la
// cuenta se rechaza con una suscripción de Stripe activa (FR002), y Party en la nube (B7) con sus
// grupos, códigos, topes y duelos, que atiende el mismo doble de las pruebas unitarias
// (src/data/testing/fakePartyServer.ts). De Storage atiende el bucket de la foto de perfil (B2) y, con
// attachBank, el del catálogo de mazos (B11).
//
// Banco en la nube (B11). attachBank(server, store) engancha el modelo en memoria de fakeBankStore.ts.
// Desde ahí las rpc del banco, la función bank-sync y el bucket deck-catalog van al banco. En el Paso 0
// de B11 responden vacío. Los paquetes B y C de B11 cambian bankRpc, bankFunction y bankStorage para
// que llamen a fakeBank.ts y a fakeEditorial.ts. Sin attachBank todo sigue como antes.
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Request, Route } from '@playwright/test';
import type { PlanKey } from '@/config/billing';
import type { Role } from '@/data/schemas/common';
import { createFakePartyServer, type FakePartyServer } from '@/data/testing/fakePartyServer';
import {
  GATEWAY_CANCEL_PATH,
  GATEWAY_PAY_PATH,
  PORTAL_CANCEL_SUBSCRIPTION_PATH,
  gatewayPage,
  portalPage,
} from './fakeGateway';
import {
  CLOUD_PREVIEW_URL,
  FAKE_GATEWAY_ORIGIN,
  FAKE_PORTAL_ORIGIN,
  FAKE_SUPABASE_ANON_KEY,
  FAKE_SUPABASE_URL,
} from './fakeSupabaseConfig';
import {
  DECK_CATALOG_BUCKET,
  bankOpen,
  fakeStudyDay,
  fakeStudyDayResetsAt,
  isBankRpc,
  isTeam,
  type BankRpc,
  type FakeBankCaller,
  type FakeBankReply,
  type FakeBankStore,
} from './fakeBankStore';

export type PaidPlan = Exclude<PlanKey, 'free'>;
export type Provider = 'stripe' | 'mercadopago';
type Json = Record<string, unknown>;

export interface FakeUser {
  id: string;
  email: string;
  alias: string;
  role: Role;
  createdAt: string;
}

interface Session {
  /** Va en el token como session_id, que es lo que amarra la cuenta al dispositivo */
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** Lo que "llegó" a un correo. El enlace abre sesión en el navegador que lo abre y el código en cualquiera */
export interface FakeEmail {
  to: string;
  code: string;
  link: string;
  sentAt: string;
}

export interface FakeSubscription {
  plan: PlanKey;
  status: 'active' | 'past_due' | 'canceled' | 'none';
  provider: Provider | null;
  /** ISO 8601 o null si la suscripción no tiene fin de periodo */
  currentPeriodEnd: string | null;
}

export interface DeviceLimits {
  maxChanges: number;
  windowHours: number;
}

/** Lo que create-checkout contesta en lugar de abrir el pago, para probar cada aviso de la app */
export type CheckoutFailure = 'founder_full' | 'already_subscribed' | 'not_configured' | 'provider';

/**
 * Un aviso de pago verificado de la pasarela, como lo recibe apply_payment_notice. Sirve para mandar la
 * factura de 0 pesos de una prueba gratis o repetir un aviso (B7 del plan del cambio)
 */
export interface FakePaymentNotice {
  eventId: string;
  email: string;
  plan: PaidPlan;
  /** El id del cobro en la pasarela, la factura en Stripe */
  paymentId: string;
  amountMxn: number;
}
export type FakeNoticeResult = 'applied' | 'duplicate' | 'ignored';
export type PortalFailure = 'no_customer' | 'not_configured' | 'provider';

export interface RecordedCall {
  method: string;
  /** Ruta con su consulta, por ejemplo /rest/v1/rpc/claim_device */
  path: string;
  body: unknown;
  status: number;
}

export interface FakeSupabaseOptions {
  /** Tope de cambios de dispositivo. El de la base es 3 cada 24 horas */
  deviceLimits?: DeviceLimits;
  /** Lugares del plan Fundador. El de la base es 100 */
  founderSeats?: number;
  /** Con un valor, create-checkout siempre contesta ese error */
  checkoutError?: CheckoutFailure | null;
  /** Dirección pública de la app, con la que se arman las URL de regreso del pago */
  appUrl?: string;
}

export interface FakeSupabaseServer {
  readonly url: string;
  /** Atiende también las peticiones de otro contexto, como si fuera otro navegador con la misma nube */
  attach(context: BrowserContext): Promise<void>;
  createUser(input: { email: string; alias?: string; role?: Role }): FakeUser;
  userByEmail(email: string): FakeUser | undefined;
  /**
   * Un enlace del correo listo para abrir, como si el alumno hubiera pedido entrar y leído su correo.
   * Crea la cuenta si no existe. Cada llamada abre una sesión nueva, igual que cada correo de verdad
   */
  issueMagicLink(email: string, alias?: string): string;
  /** Todos los correos "enviados", en orden */
  readonly emails: readonly FakeEmail[];
  /** El último correo que se "mandó" a esa dirección */
  lastEmail(email: string): FakeEmail | undefined;
  deviceSessionOf(
    email: string,
  ): { deviceId: string; label: string; sessionId: string | null } | null;
  /** Hora, en milisegundos, hasta la que el servidor rechaza cambios de dispositivo. null si no hay tope activo */
  deviceLimitRetryAt(email: string): number | null;
  subscriptionOf(email: string): FakeSubscription | null;
  /** Deja una suscripción como la habría dejado un aviso de pago ya aplicado */
  setSubscription(email: string, subscription: FakeSubscription): void;
  referralCodeOf(email: string): string;
  referralsOf(email: string): { pending: number; completed: number };
  /** Aplica un aviso de pago como apply_payment_notice y devuelve lo que contestaría la base */
  paymentNotice(notice: FakePaymentNotice): FakeNoticeResult;
  /** El último aviso de pago que se aplicó a esa cuenta, por ejemplo el del botón Pagar */
  lastPaymentNotice(email: string): FakePaymentNotice | null;
  readonly calls: readonly RecordedCall[];
  rpcCalls(name: string): RecordedCall[];
  /** Party en la nube, para revisar desde la prueba los grupos, los miembros y los duelos */
  readonly party: FakePartyServer;
  /** El id de la cuenta con ese correo, como lo ve el servidor */
  userIdOf(email: string): string | undefined;
  deviceLimits: DeviceLimits;
  founderSeats: number;
  checkoutError: CheckoutFailure | null;
  portalError: PortalFailure | null;
  /** El banco en la nube enganchado con attachBank (B11). null sin banco */
  bank: FakeBankStore | null;
}

// ---------------------------------------------------------------------------------------------
// Respuestas

interface Reply {
  status: number;
  /** Bytes para los archivos de Storage, texto para todo lo demás */
  body?: string | Buffer;
  contentType?: string;
  headers?: Record<string, string>;
}

const json = (value: unknown, status = 200): Reply => ({
  status,
  body: JSON.stringify(value),
  contentType: 'application/json; charset=utf-8',
});
const empty = (status: number): Reply => ({ status });
const html = (page: string): Reply => ({
  status: 200,
  body: page,
  contentType: 'text/html; charset=utf-8',
});
const redirect = (location: string): Reply => ({ status: 303, headers: { location } });

/** Cómo PostgREST traduce el código SQLSTATE de una excepción a un estado HTTP */
function pgStatus(code: string): number {
  if (code === '42501' || code === '28000') return 403;
  if (code === 'PGRST116') return 406;
  if (code === 'PGRST202') return 404;
  if (code === 'PGRST301') return 401;
  return 400;
}

/** Un error con la forma que devuelve PostgREST y que supabase-js entrega tal cual en error */
const pgError = (
  code: string,
  message: string,
  details: string | null = null,
  hint: string | null = null,
): Reply => json({ code, message, details, hint }, pgStatus(code));

/** Un error con la forma de Supabase Auth. El estado HTTP es lo que la app revisa */
const authError = (status: number, errorCode: string, message: string): Reply =>
  json({ code: status, error_code: errorCode, msg: message }, status);

const NO_SESSION = pgError('28000', 'Hace falta iniciar sesión');
const NOT_ACTIVE_DEVICE = pgError('42501', 'Este dispositivo no es el activo de la cuenta');

const SESSION_SECONDS = 3600;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY_MS = 86_400_000;
const SYNC_KINDS = ['deck', 'note', 'card', 'outline', 'widget_layout'];
const ROLES: readonly Role[] = ['student', 'physician', 'admin', 'owner'];
const PAID_PLANS: readonly PaidPlan[] = ['founder', 'monthly', 'annual'];
const PLAN_PRICES_MXN: Record<PaidPlan, number> = { founder: 79, monthly: 149, annual: 1499 };

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
/** El texto que vino, o el respaldo si no vino nada o vino vacío */
const nonEmpty = (value: string | null | undefined, fallback: string): string =>
  value === undefined || value === null || value === '' ? fallback : value;
/** Un valor como texto para compararlo con un filtro. Los objetos se comparan por su JSON */
function text(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'undefined':
      return '';
    default:
      return value === null ? '' : JSON.stringify(value);
  }
}
const isPaidPlan = (value: unknown): value is PaidPlan =>
  typeof value === 'string' && (PAID_PLANS as readonly string[]).includes(value);
const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);
const normalizeEmail = (value: unknown): string | null => {
  const email = asString(value)?.trim().toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Token de acceso con la forma de Supabase. La firma es fija porque nadie la verifica */
function accessTokenFor(user: FakeUser, sessionId: string, expiresAt: number): string {
  const issuedAt = Math.floor(expiresAt / 1000) - SESSION_SECONDS;
  return [
    base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    base64Url(
      JSON.stringify({
        iss: `${FAKE_SUPABASE_URL}/auth/v1`,
        sub: user.id,
        aud: 'authenticated',
        exp: Math.floor(expiresAt / 1000),
        iat: issuedAt,
        email: user.email,
        role: 'authenticated',
        aal: 'aal1',
        amr: [{ method: 'otp', timestamp: issuedAt }],
        session_id: sessionId,
        is_anonymous: false,
      }),
    ),
    base64Url(`firma simulada ${randomUUID()}`),
  ].join('.');
}

/** Fecha en el formato que usa el detalle del error DV001, segundos en UTC */
function isoSeconds(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseJsonBody(request: Request): unknown {
  try {
    return request.postDataJSON() as unknown;
  } catch {
    return null;
  }
}

/** Un error con la forma de la API de Storage, que responde 400 y pone el estado real en statusCode */
const storageError = (statusCode: string, error: string, message: string): Reply =>
  json({ statusCode, error, message }, 400);

/**
 * El archivo de una subida a Storage. supabase-js lo manda como la parte con nombre de archivo de un
 * formulario multipart. Sin formulario, el cuerpo es el archivo
 */
function uploadedFile(request: Request): Buffer | null {
  const body = request.postDataBuffer();
  if (!body) return null;
  const type = request.headers()['content-type'] ?? '';
  const boundary = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(type);
  const marker = boundary?.[1] ?? boundary?.[2];
  if (!marker) return body;
  const delimiter = Buffer.from(`--${marker}`);
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const next = body.indexOf(delimiter, start + delimiter.length);
    if (next === -1) return null;
    const part = body.subarray(start + delimiter.length, next);
    const headersEnd = part.indexOf('\r\n\r\n');
    if (headersEnd !== -1 && /filename=/i.test(part.subarray(0, headersEnd).toString('latin1'))) {
      // Sin el salto de línea que la separa del siguiente delimitador
      return part.subarray(headersEnd + 4, part.length - 2);
    }
    start = next;
  }
  return null;
}

/** Qué columnas pidió select. null es todas */
function selectedColumns(url: URL): string[] | null {
  const select = url.searchParams.get('select');
  if (!select || select === '*') return null;
  return select.split(',').map((column) => column.trim());
}

function project(row: Json, columns: string[] | null): Json {
  if (columns === null) return row;
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? null]));
}

/** Aplica un filtro de PostgREST, como user_id=eq.<id> o server_seq=gt.0 */
function matches(actual: unknown, op: string, value: string): boolean {
  if (op === 'is') {
    if (value === 'null') return actual === null || actual === undefined;
    return String(actual) === value;
  }
  if (typeof actual === 'number' && Number.isFinite(Number(value))) {
    const right = Number(value);
    switch (op) {
      case 'eq':
        return actual === right;
      case 'neq':
        return actual !== right;
      case 'gt':
        return actual > right;
      case 'gte':
        return actual >= right;
      case 'lt':
        return actual < right;
      case 'lte':
        return actual <= right;
      default:
        return false;
    }
  }
  const left = text(actual);
  switch (op) {
    case 'eq':
      return left === value;
    case 'neq':
      return left !== value;
    case 'gt':
      return left > value;
    case 'gte':
      return left >= value;
    case 'lt':
      return left < value;
    case 'lte':
      return left <= value;
    default:
      return false;
  }
}

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'columns', 'on_conflict']);

function applyQuery(rows: Json[], url: URL): Json[] {
  let out = rows;
  for (const [key, raw] of url.searchParams) {
    if (RESERVED_PARAMS.has(key)) continue;
    const dot = raw.indexOf('.');
    const op = dot === -1 ? 'eq' : raw.slice(0, dot);
    const value = dot === -1 ? raw : raw.slice(dot + 1);
    out = out.filter((row) => matches(row[key], op, value));
  }
  const order = url.searchParams.get('order');
  if (order) {
    const [column = '', direction = 'asc'] = order.split(',')[0]?.split('.') ?? [];
    const sign = direction === 'desc' ? -1 : 1;
    out = [...out].sort((a, b) => {
      const left = a[column];
      const right = b[column];
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * sign;
      return text(left).localeCompare(text(right)) * sign;
    });
  }
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = url.searchParams.get('limit');
  if (offset > 0) out = out.slice(offset);
  if (limit !== null) out = out.slice(0, Number(limit));
  return out;
}

/**
 * Entrega filas como PostgREST. Con Accept de objeto (single) devuelve una sola fila o 406. En los
 * demás casos devuelve el arreglo, y supabase-js resuelve maybeSingle con su largo
 */
function rowsReply(rows: Json[], request: Request, url: URL): Reply {
  const accept = request.headers().accept ?? '';
  const projected = applyQuery(rows, url).map((row) => project(row, selectedColumns(url)));
  if (!accept.includes('application/vnd.pgrst.object+json')) return json(projected);
  if (projected.length === 1) return json(projected[0]);
  return pgError(
    'PGRST116',
    'JSON object requested, multiple (or no) rows returned',
    `The result contains ${projected.length} rows`,
  );
}

// ---------------------------------------------------------------------------------------------
// Estado

interface DeviceRow {
  deviceId: string;
  label: string;
  sessionId: string | null;
  claimedAt: number;
}

interface DeviceClaim {
  userId: string;
  deviceId: string;
  label: string;
  at: number;
  kind: 'first' | 'switch' | 'refresh' | 'release';
  rejected: boolean;
}

interface Otp {
  email: string;
  code: string;
  expiresAt: number;
}

interface CheckoutSession {
  id: string;
  userId: string;
  plan: PaidPlan;
  provider: Provider;
  successUrl: string;
  cancelUrl: string;
  status: 'open' | 'paid' | 'canceled';
}

interface PortalSession {
  id: string;
  userId: string;
  returnUrl: string;
}

interface Payment {
  id: string;
  userId: string;
  plan: PaidPlan;
  provider: Provider;
  /** El id del cobro en la pasarela. El mismo cobro no se cuenta dos veces */
  providerPaymentId: string;
  amountMxn: number;
  paidAt: string;
}

interface Referral {
  id: string;
  referrerId: string;
  referredId: string;
  code: string;
  status: 'pending' | 'completed';
  createdAt: string;
  completedAt: string | null;
}

interface Grant {
  id: string;
  userId: string;
  kind: 'referral' | 'admin';
  referralId: string | null;
  startsAt: string;
  endsAt: string;
}

interface SyncRecordRow extends Json {
  user_id: string;
  kind: string;
  record_id: string;
  data: Json;
  updated_at: string;
  deleted_at: string | null;
  server_seq: number;
}

interface EventRow extends Json {
  id: string;
  user_id: string;
  type: string;
  at: string;
  tz: string;
  session_id: string | null;
  payload: Json;
  schema_version: number;
  seq: number;
}

interface ClientErrorRow extends Json {
  day: string;
  fingerprint: string;
  kind: string;
  message: string;
  stack: string | null;
  screen: string;
  version: string;
  occurrences: number;
  first_seen: string;
  last_seen: string;
}

type Auth =
  { kind: 'anon' } | { kind: 'invalid' } | { kind: 'user'; user: FakeUser; session: Session };

const REFERRAL_RULES = { rewardDays: 30, maxRewards: 12, redeemWindowDays: 14 };

export function createFakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabaseServer {
  const appUrl = options.appUrl ?? CLOUD_PREVIEW_URL;
  const now = () => Date.now();

  const users = new Map<string, FakeUser>();
  const accounts = new Map<string, Json>();
  const sessions = new Map<string, Session>();
  const otps = new Map<string, Otp>();
  const emails: FakeEmail[] = [];
  const deviceSessions = new Map<string, DeviceRow>();
  const deviceClaims: DeviceClaim[] = [];
  const settings = new Map<string, { value: unknown; updatedAt: string }>([
    [
      'plans',
      {
        value: {
          free: { priceMxn: 0, dailyQuestions: 20 },
          founder: { priceMxn: 79 },
          monthly: { priceMxn: 149 },
          annual: { priceMxn: 1499 },
        },
        updatedAt: new Date().toISOString(),
      },
    ],
    ['founder_seats', { value: { total: 100 }, updatedAt: new Date().toISOString() }],
    ['referral_rules', { value: REFERRAL_RULES, updatedAt: new Date().toISOString() }],
    [
      'device_limits',
      { value: { maxChanges: 3, windowHours: 24 }, updatedAt: new Date().toISOString() },
    ],
  ]);
  const subscriptions = new Map<string, FakeSubscription>();
  const payments: Payment[] = [];
  const stripeCustomers = new Map<string, string>();
  const checkouts = new Map<string, CheckoutSession>();
  const portals = new Map<string, PortalSession>();
  const referralCodes = new Map<string, string>();
  const referrals: Referral[] = [];
  const grants: Grant[] = [];
  // Avisos de pago ya aplicados, por procesador e id de evento, y el último de cada cuenta
  const noticeEvents = new Set<string>();
  const lastNotices = new Map<
    string,
    Omit<FakePaymentNotice, 'email'> & { userId: string; provider: Provider }
  >();
  const syncRecords = new Map<string, SyncRecordRow>();
  const events: EventRow[] = [];
  const privacyAcceptances: Json[] = [];
  const clientErrors: ClientErrorRow[] = [];
  /** Fotos de perfil del bucket avatars, por ruta <id>/avatar.jpg */
  const avatarObjects = new Map<string, Buffer>();
  const calls: RecordedCall[] = [];
  // Party en la nube. El alias sale de profiles, como en la base
  // Party es de los planes de pago, como party_open en la base (B8, 20261021000001_free_plan_locks.sql)
  const party = createFakePartyServer({
    aliasOf: (userId) => users.get(userId)?.alias ?? null,
    isOpen: (userId) => userPlan(userId) !== 'free',
  });
  let counter = 0;
  let serverSeq = 0;
  let eventSeq = 0;

  const server = {
    deviceLimits: options.deviceLimits ?? { maxChanges: 3, windowHours: 24 },
    founderSeats: options.founderSeats ?? 100,
    checkoutError: options.checkoutError ?? null,
    portalError: null as PortalFailure | null,
    bank: null as FakeBankStore | null,
  };

  const nextId = (prefix: string) => {
    counter += 1;
    return `${prefix}_${String(counter).padStart(4, '0')}`;
  };

  // ------------------------------------------------------------------ cuentas y sesiones

  const userByEmail = (email: string): FakeUser | undefined =>
    [...users.values()].find((user) => user.email === email.trim().toLowerCase());

  function createUser(input: { email: string; alias?: string; role?: Role }): FakeUser {
    const email = normalizeEmail(input.email);
    if (!email) throw new Error(`Correo inválido para el Supabase simulado: ${input.email}`);
    const existing = userByEmail(email);
    if (existing) return existing;
    const user: FakeUser = {
      id: randomUUID(),
      email,
      alias: nonEmpty(input.alias?.trim(), 'Alumno'),
      role: input.role ?? 'student',
      createdAt: new Date(now()).toISOString(),
    };
    users.set(user.id, user);
    // Lo mismo que hace el trigger handle_new_user
    accounts.set(user.id, {
      user_id: user.id,
      email,
      birth_year: null,
      sex: null,
      state: null,
      situation: null,
      attempt: null,
      target_specialty: null,
      avatar: { kind: 'initials' },
      avatar_changed_at: null,
      updated_at: user.createdAt,
    });
    return user;
  }

  function createSession(user: FakeUser): Session {
    const id = randomUUID();
    const expiresAt = now() + SESSION_SECONDS * 1000;
    const session: Session = {
      id,
      userId: user.id,
      accessToken: accessTokenFor(user, id, expiresAt),
      refreshToken: `rt_${randomUUID()}`,
      expiresAt,
    };
    sessions.set(session.accessToken, session);
    return session;
  }

  function rotateSession(session: Session): Session {
    const user = users.get(session.userId);
    if (!user) throw new Error('Sesión sin usuario');
    sessions.delete(session.accessToken);
    const expiresAt = now() + SESSION_SECONDS * 1000;
    const next: Session = {
      ...session,
      accessToken: accessTokenFor(user, session.id, expiresAt),
      refreshToken: `rt_${randomUUID()}`,
      expiresAt,
    };
    sessions.set(next.accessToken, next);
    return next;
  }

  function userJson(user: FakeUser): Json {
    return {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      email_confirmed_at: user.createdAt,
      phone: '',
      confirmed_at: user.createdAt,
      last_sign_in_at: new Date(now()).toISOString(),
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { alias: user.alias, email: user.email, email_verified: true, sub: user.id },
      identities: [],
      created_at: user.createdAt,
      updated_at: user.createdAt,
      is_anonymous: false,
    };
  }

  function sessionJson(session: Session, user: FakeUser): Json {
    return {
      access_token: session.accessToken,
      token_type: 'bearer',
      expires_in: SESSION_SECONDS,
      expires_at: Math.floor(session.expiresAt / 1000),
      refresh_token: session.refreshToken,
      user: userJson(user),
    };
  }

  function magicLink(session: Session, redirectTo: string): string {
    const params = new URLSearchParams({
      access_token: session.accessToken,
      expires_at: String(Math.floor(session.expiresAt / 1000)),
      expires_in: String(SESSION_SECONDS),
      refresh_token: session.refreshToken,
      token_type: 'bearer',
      type: 'magiclink',
    });
    return `${redirectTo}#${params.toString()}`;
  }

  /** "Manda" el correo con enlace y código. Un código nuevo invalida el anterior, como en Supabase */
  function sendEmail(user: FakeUser, redirectTo: string): FakeEmail {
    const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
    otps.set(user.email, { email: user.email, code, expiresAt: now() + SESSION_SECONDS * 1000 });
    const email: FakeEmail = {
      to: user.email,
      code,
      link: magicLink(createSession(user), redirectTo),
      sentAt: new Date(now()).toISOString(),
    };
    emails.push(email);
    return email;
  }

  function authenticate(request: Request): Auth {
    const header = request.headers().authorization ?? '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (token === '' || token === FAKE_SUPABASE_ANON_KEY) return { kind: 'anon' };
    const session = sessions.get(token);
    if (!session || session.expiresAt <= now()) return { kind: 'invalid' };
    const user = users.get(session.userId);
    if (!user) return { kind: 'invalid' };
    return { kind: 'user', user, session };
  }

  const isAdmin = (user: FakeUser) => user.role === 'admin' || user.role === 'owner';

  function deleteUser(userId: string): void {
    party.forgetUser(userId);
    users.delete(userId);
    accounts.delete(userId);
    for (const [token, session] of sessions) if (session.userId === userId) sessions.delete(token);
    deviceSessions.delete(userId);
    subscriptions.delete(userId);
    stripeCustomers.delete(userId);
    referralCodes.delete(userId);
    for (const key of [...syncRecords.keys()]) {
      if (key.startsWith(`${userId}|`)) syncRecords.delete(key);
    }
    const keep = (list: { userId: string }[]) => {
      const left = list.filter((item) => item.userId !== userId);
      list.length = 0;
      list.push(...left);
    };
    keep(payments);
    keep(grants);
    keep(deviceClaims);
    const stillReferrals = referrals.filter(
      (referral) => referral.referrerId !== userId && referral.referredId !== userId,
    );
    referrals.length = 0;
    referrals.push(...stillReferrals);
    const stillEvents = events.filter((event) => event.user_id !== userId);
    events.length = 0;
    events.push(...stillEvents);
    const stillAcceptances = privacyAcceptances.filter((row) => row.user_id !== userId);
    privacyAcceptances.length = 0;
    privacyAcceptances.push(...stillAcceptances);
  }

  // ------------------------------------------------------------------ dispositivo único

  function isActiveDevice(user: FakeUser, session: Session): boolean {
    if (isAdmin(user)) return true;
    const row = deviceSessions.get(user.id);
    const held = row?.sessionId;
    if (held === undefined || held === null) return true;
    return held === session.id;
  }

  function deviceLimitStatus(userId: string): { blocked: boolean; retryAt: number | null } {
    const { maxChanges, windowHours } = server.deviceLimits;
    const windowMs = windowHours * 3_600_000;
    const lastRelease = Math.max(
      Number.NEGATIVE_INFINITY,
      ...deviceClaims
        .filter((claim) => claim.userId === userId && claim.kind === 'release')
        .map((claim) => claim.at),
    );
    const windowStart = Math.max(now() - windowMs, lastRelease);
    const switches = deviceClaims
      .filter(
        (claim) =>
          claim.userId === userId &&
          claim.kind === 'switch' &&
          !claim.rejected &&
          claim.at > windowStart,
      )
      .sort((a, b) => a.at - b.at);
    const blocked = switches.length >= maxChanges;
    const pivot = blocked ? switches[switches.length - maxChanges] : undefined;
    return {
      blocked,
      retryAt: pivot ? Math.floor((pivot.at + windowMs) / 1000) * 1000 + 1000 : null,
    };
  }

  function validDeviceInput(args: Json): { deviceId: string; label: string } | Reply {
    const deviceId = asString(args.p_device_id) ?? '';
    const label = asString(args.p_label) ?? '';
    if (deviceId.trim() === '' || deviceId.length > 80) {
      return pgError('22023', 'El id del dispositivo debe tener entre 1 y 80 caracteres');
    }
    if (label.length > 80) {
      return pgError('22023', 'La etiqueta del dispositivo no puede pasar de 80 caracteres');
    }
    return { deviceId, label };
  }

  function claimDevice(user: FakeUser, session: Session, args: Json): Reply {
    const input = validDeviceInput(args);
    if ('status' in input) return input;
    const held = deviceSessions.get(user.id);
    const kind: DeviceClaim['kind'] = !held
      ? 'first'
      : held.deviceId === input.deviceId
        ? 'refresh'
        : 'switch';
    if (kind === 'switch') {
      const limit = deviceLimitStatus(user.id);
      if (limit.blocked) {
        return pgError(
          'DV001',
          'Cambiaste de dispositivo demasiadas veces en poco tiempo',
          limit.retryAt === null ? null : isoSeconds(limit.retryAt),
          'Vuelve a intentarlo a la hora indicada o pide ayuda para que liberen tu cuenta',
        );
      }
    }
    // Como en la SQL (coalesce(sid, held.session_id)), en un refresh gana la sesión del token actual
    // y la guardada es solo respaldo. Los tokens del simulado siempre traen session_id, así que aquí
    // se reduce a la del token. Salir y volver a entrar en el mismo navegador registra el refresh
    const sessionId = session.id;
    deviceSessions.set(user.id, {
      deviceId: input.deviceId,
      label: input.label,
      sessionId,
      claimedAt: now(),
    });
    if (kind !== 'refresh' || held?.sessionId !== sessionId) {
      deviceClaims.push({
        userId: user.id,
        deviceId: input.deviceId,
        label: input.label,
        at: now(),
        kind,
        rejected: false,
      });
    }
    return empty(204);
  }

  function logRejectedClaim(user: FakeUser, args: Json): Reply {
    const input = validDeviceInput(args);
    if ('status' in input) return input;
    const held = deviceSessions.get(user.id);
    if (!held || held.deviceId === input.deviceId) return json(false);
    if (!deviceLimitStatus(user.id).blocked) return json(false);
    const repeated = deviceClaims.some(
      (claim) =>
        claim.userId === user.id &&
        claim.deviceId === input.deviceId &&
        claim.rejected &&
        claim.at > now() - 5 * 60_000,
    );
    if (repeated) return json(false);
    deviceClaims.push({
      userId: user.id,
      deviceId: input.deviceId,
      label: input.label,
      at: now(),
      kind: 'switch',
      rejected: true,
    });
    return json(true);
  }

  // ------------------------------------------------------------------ planes, pagos y referidos

  function subscriptionInForce(userId: string): FakeSubscription | null {
    const row = subscriptions.get(userId);
    if (!row || row.plan === 'free') return null;
    if (!['active', 'past_due', 'canceled'].includes(row.status)) return null;
    if (row.currentPeriodEnd === null) return row.status === 'active' ? row : null;
    return Date.parse(row.currentPeriodEnd) > now() ? row : null;
  }

  const activeGrantEnd = (userId: string): string | null =>
    grants
      .filter(
        (grant) =>
          grant.userId === userId &&
          Date.parse(grant.startsAt) <= now() &&
          Date.parse(grant.endsAt) > now(),
      )
      .map((grant) => grant.endsAt)
      .sort()
      .at(-1) ?? null;

  function userPlan(userId: string): PlanKey {
    const inForce = subscriptionInForce(userId);
    if (inForce) return inForce.plan;
    return activeGrantEnd(userId) === null ? 'free' : 'monthly';
  }

  function myPlan(user: FakeUser): Reply {
    const plan = userPlan(user.id);
    const row = subscriptions.get(user.id);
    const inForce = subscriptionInForce(user.id);
    return json({
      plan,
      source: plan === 'free' ? 'none' : inForce?.plan === plan ? 'payment' : 'referral',
      status: row?.status ?? 'none',
      provider: row?.provider ?? null,
      periodEnd:
        plan === 'free'
          ? null
          : row?.plan === plan
            ? row.currentPeriodEnd
            : activeGrantEnd(user.id),
    });
  }

  function completeReferral(referredId: string): void {
    const referral = referrals.find(
      (item) => item.referredId === referredId && item.status === 'pending',
    );
    if (!referral) return;
    referral.status = 'completed';
    referral.completedAt = new Date(now()).toISOString();
    const earned = grants.filter(
      (grant) => grant.userId === referral.referrerId && grant.kind === 'referral',
    ).length;
    if (earned >= REFERRAL_RULES.maxRewards) return;
    // Los meses regalados se encadenan, no se encimen
    const latest = grants
      .filter((grant) => grant.userId === referral.referrerId && Date.parse(grant.endsAt) > now())
      .map((grant) => Date.parse(grant.endsAt))
      .reduce((max, value) => Math.max(max, value), now());
    grants.push({
      id: randomUUID(),
      userId: referral.referrerId,
      kind: 'referral',
      referralId: referral.id,
      startsAt: new Date(latest).toISOString(),
      endsAt: new Date(latest + REFERRAL_RULES.rewardDays * DAY_MS).toISOString(),
    });
  }

  /**
   * Lo que haría apply_payment_notice con un aviso de pago verificado (20261019000001). Un aviso
   * repetido se reconoce por su id, la factura de 0 pesos de una prueba gratis no es un cobro, el mismo
   * cobro no se cuenta dos veces y el referido se concreta con el primer cobro, una sola vez
   */
  function applyNotice(
    notice: Omit<FakePaymentNotice, 'email'> & { userId: string; provider: Provider },
  ): FakeNoticeResult {
    const key = `${notice.provider}:${notice.eventId}`;
    if (noticeEvents.has(key)) return 'duplicate';
    noticeEvents.add(key);
    lastNotices.set(notice.userId, notice);
    if (notice.amountMxn <= 0) return 'ignored';
    const periodDays = notice.plan === 'annual' ? 365 : 30;
    subscriptions.set(notice.userId, {
      plan: notice.plan,
      status: 'active',
      provider: notice.provider,
      currentPeriodEnd: new Date(now() + periodDays * DAY_MS).toISOString(),
    });
    const counted = payments.some(
      (payment) =>
        payment.provider === notice.provider && payment.providerPaymentId === notice.paymentId,
    );
    if (!counted) {
      payments.push({
        id: nextId('pay'),
        userId: notice.userId,
        plan: notice.plan,
        provider: notice.provider,
        providerPaymentId: notice.paymentId,
        amountMxn: notice.amountMxn,
        paidAt: new Date(now()).toISOString(),
      });
    }
    if (notice.provider === 'stripe' && !stripeCustomers.has(notice.userId)) {
      stripeCustomers.set(notice.userId, nextId('cus_fake'));
    }
    completeReferral(notice.userId);
    return 'applied';
  }

  /** El botón Pagar de la pasarela simulada. Cobra el precio del plan con un aviso propio */
  function applyPayment(checkout: CheckoutSession): void {
    applyNotice({
      eventId: `evt_${checkout.id}`,
      userId: checkout.userId,
      plan: checkout.plan,
      provider: checkout.provider,
      paymentId: `in_${checkout.id}`,
      amountMxn: PLAN_PRICES_MXN[checkout.plan],
    });
    checkout.status = 'paid';
  }

  function referralCodeOf(userId: string): string {
    const existing = referralCodes.get(userId);
    if (existing) return existing;
    let code: string;
    do {
      code = Array.from(
        { length: 8 },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)] ?? 'A',
      ).join('');
    } while ([...referralCodes.values()].includes(code));
    referralCodes.set(userId, code);
    return code;
  }

  function redeemReferral(user: FakeUser, args: Json): Reply {
    const code = (asString(args.p_code) ?? '').trim().toUpperCase();
    const referrer = [...referralCodes.entries()].find(([, value]) => value === code)?.[0];
    if (referrer === undefined) return json('invalid');
    if (referrer === user.id) return json('own');
    if (referrals.some((referral) => referral.referredId === user.id)) return json('already');
    // Dos alumnos no se refieren entre sí (20261019000001)
    if (
      referrals.some(
        (referral) => referral.referrerId === user.id && referral.referredId === referrer,
      )
    ) {
      return json('circular');
    }
    // Quien ya tuvo un cobro no entra como referido. Una prueba sin cobro no cuenta (20261019000001)
    if (payments.some((payment) => payment.userId === user.id && payment.amountMxn > 0)) {
      return json('already_paid');
    }
    if (Date.parse(user.createdAt) < now() - REFERRAL_RULES.redeemWindowDays * DAY_MS) {
      return json('too_late');
    }
    referrals.push({
      id: randomUUID(),
      referrerId: referrer,
      referredId: user.id,
      code,
      status: 'pending',
      createdAt: new Date(now()).toISOString(),
      completedAt: null,
    });
    return json('ok');
  }

  function myReferrals(user: FakeUser): Reply {
    const mine = referrals.filter((referral) => referral.referrerId === user.id);
    return json({
      pending: mine.filter((referral) => referral.status === 'pending').length,
      completed: mine.filter((referral) => referral.status === 'completed').length,
      monthsEarned: grants.filter((grant) => grant.userId === user.id && grant.kind === 'referral')
        .length,
      grantedUntil: activeGrantEnd(user.id),
      referredBy: referrals.some((referral) => referral.referredId === user.id),
    });
  }

  // ------------------------------------------------------------------ sincronización

  function pushRecords(user: FakeUser, args: Json): Reply {
    const records = args.p_records;
    if (!Array.isArray(records)) return pgError('22023', 'Se esperaba un arreglo de registros');
    if (records.length > 500) return pgError('22023', 'Máximo 500 registros por subida');
    let changed = 0;
    for (const raw of records as unknown[]) {
      if (!isRecord(raw)) return pgError('22023', 'Registro de sincronización inválido');
      const kind = asString(raw.kind);
      const id = asString(raw.id);
      const updatedAt = asString(raw.updatedAt);
      if (!kind || !SYNC_KINDS.includes(kind) || !id || id.length > 64 || !isRecord(raw.data)) {
        return pgError('22023', 'Registro de sincronización inválido');
      }
      if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) {
        return pgError('22023', 'Falta updatedAt');
      }
      if (Date.parse(updatedAt) > now() + 10 * 60_000) {
        return pgError('SY002', 'updatedAt está en el futuro');
      }
      const key = `${user.id}|${kind}|${id}`;
      const current = syncRecords.get(key);
      const deletedAt = asString(raw.deletedAt);
      // En Gratis un apunte no se crea ni se cambia en la nube y el lote sigue. Solo entra la marca de
      // borrado de uno que ya estaba, sobre lo que ya tenía la nube y con sus dos fechas dentro de data.
      // Una marca posterior al cambio no es una fecha de borrado (B8, 20261021000001_free_plan_locks.sql)
      const freeOutline = kind === 'outline' && userPlan(user.id) === 'free';
      if (freeOutline && deletedAt && Date.parse(deletedAt) > Date.parse(updatedAt)) {
        return pgError('22023', 'La marca de borrado no es una fecha válida');
      }
      if (current && Date.parse(current.updated_at) >= Date.parse(updatedAt)) continue;
      if (freeOutline && (!current || !deletedAt)) continue;
      const data =
        freeOutline && current
          ? {
              ...current.data,
              deletedAt: new Date(Date.parse(deletedAt ?? updatedAt)).toISOString(),
              updatedAt: new Date(Date.parse(updatedAt)).toISOString(),
            }
          : raw.data;
      serverSeq += 1;
      syncRecords.set(key, {
        user_id: user.id,
        kind,
        record_id: id,
        data,
        updated_at: new Date(Date.parse(updatedAt)).toISOString(),
        deleted_at: deletedAt ? new Date(Date.parse(deletedAt)).toISOString() : null,
        server_seq: serverSeq,
      });
      changed += 1;
    }
    return json(changed);
  }

  function pushEvents(user: FakeUser, args: Json): Reply {
    const list = args.p_events;
    if (!Array.isArray(list)) return pgError('22023', 'Se esperaba un arreglo de eventos');
    if (list.length > 500) return pgError('22023', 'Máximo 500 eventos por subida');
    let added = 0;
    for (const raw of list as unknown[]) {
      if (!isRecord(raw)) return pgError('22023', 'Evento de sincronización inválido');
      const id = asString(raw.id);
      const type = asString(raw.type);
      const tz = asString(raw.tz);
      const at = asString(raw.at);
      if (!id || id.length > 64 || !type || type.length > 64 || !tz || !isRecord(raw.payload)) {
        return pgError('22023', 'Evento de sincronización inválido');
      }
      if (!at || Number.isNaN(Date.parse(at))) return pgError('22023', 'Falta at');
      if (Date.parse(at) > now() + 10 * 60_000) return pgError('SY002', 'at está en el futuro');
      if (events.some((event) => event.id === id)) continue;
      eventSeq += 1;
      const sessionId = asString(raw.sessionId);
      const schemaVersion = raw.schemaVersion;
      events.push({
        id,
        user_id: user.id,
        type,
        at: new Date(Date.parse(at)).toISOString(),
        tz,
        session_id: sessionId === null || sessionId === '' ? null : sessionId,
        payload: raw.payload,
        schema_version: typeof schemaVersion === 'number' ? schemaVersion : 1,
        seq: eventSeq,
      });
      added += 1;
    }
    return json(added);
  }

  // ------------------------------------------------------------------ privacidad, admin y errores

  function deleteMyData(user: FakeUser): Reply {
    let records = 0;
    for (const [key, row] of syncRecords) {
      if (row.user_id === user.id) {
        syncRecords.delete(key);
        records += 1;
      }
    }
    const before = events.length;
    const left = events.filter((event) => event.user_id !== user.id);
    events.length = 0;
    events.push(...left);
    // Borrar las membresías se lleva en cascada lo de Party de esa cuenta
    const memberships = party.forgetMemberships(user.id);
    return json({
      events: before - left.length,
      records,
      artifacts: 0,
      reports: 0,
      memberships,
      decks: 0,
    });
  }

  function deleteMyAccount(user: FakeUser): Reply {
    if (user.role === 'owner') {
      return pgError('42501', 'El dueño no puede borrar su propia cuenta');
    }
    const row = subscriptions.get(user.id);
    const stripeActive =
      row?.provider === 'stripe' &&
      (row.status === 'active' || row.status === 'past_due') &&
      (row.currentPeriodEnd === null || Date.parse(row.currentPeriodEnd) > now());
    if (stripeActive) {
      return pgError('FR002', 'Cancela tu suscripción antes de eliminar tu cuenta');
    }
    deleteUser(user.id);
    return empty(204);
  }

  function adminListUsers(user: FakeUser, args: Json): Reply {
    if (!isAdmin(user)) return pgError('42501', 'Solo un administrador puede ver los usuarios');
    const query = asString(args.p_query)?.trim().toLowerCase() ?? '';
    const role = isRole(args.p_role) ? args.p_role : null;
    const limit = Math.min(Math.max(typeof args.p_limit === 'number' ? args.p_limit : 50, 1), 100);
    const offset = Math.max(typeof args.p_offset === 'number' ? args.p_offset : 0, 0);
    const order: Record<Role, number> = { owner: 0, admin: 1, physician: 2, student: 3 };
    const matched = [...users.values()]
      .filter((item) => role === null || item.role === role)
      .filter(
        (item) =>
          query === '' ||
          item.alias.toLowerCase().includes(query) ||
          item.email.toLowerCase().includes(query),
      )
      .sort(
        (a, b) =>
          order[a.role] - order[b.role] ||
          b.createdAt.localeCompare(a.createdAt) ||
          a.id.localeCompare(b.id),
      );
    return json(
      matched.slice(offset, offset + limit).map((item) => ({
        user_id: item.id,
        alias: item.alias,
        email: item.email,
        role: item.role,
        plan: userPlan(item.id),
        created_at: item.createdAt,
        total: matched.length,
      })),
    );
  }

  function setUserRole(user: FakeUser, args: Json): Reply {
    const target = asString(args.target);
    const next = args.new_role;
    if (!isAdmin(user)) return pgError('42501', 'Solo un administrador puede cambiar roles');
    if (target === user.id) return pgError('42501', 'Nadie cambia su propio rol');
    if (!isRole(next)) return pgError('22P02', 'invalid input value for enum app_role');
    if (next === 'owner') return pgError('42501', 'El rol de dueño no se asigna desde la app');
    const other = target === null ? undefined : users.get(target);
    if (other?.role === 'owner') return pgError('42501', 'Nadie puede quitar al dueño');
    if ((other?.role === 'admin' || next === 'admin') && user.role !== 'owner') {
      return pgError('42501', 'Solo el dueño nombra o quita administradores');
    }
    if (other) other.role = next;
    return empty(204);
  }

  function reportClientError(args: Json): Reply {
    const fingerprint = asString(args.p_fingerprint) ?? '';
    const kind = asString(args.p_kind) ?? '';
    const message = (asString(args.p_message) ?? '').trim().slice(0, 300);
    if (!/^[0-9a-f]{8,64}$/.test(fingerprint) || !['error', 'rejection', 'render'].includes(kind)) {
      return json('invalid');
    }
    if (message === '') return json('invalid');
    const day = new Date(now()).toISOString().slice(0, 10);
    const existing = clientErrors.find((row) => row.day === day && row.fingerprint === fingerprint);
    if (existing) {
      existing.occurrences += 1;
      existing.last_seen = new Date(now()).toISOString();
      return json('counted');
    }
    clientErrors.push({
      day,
      fingerprint,
      kind,
      message,
      stack: asString(args.p_stack)?.slice(0, 1500) ?? null,
      screen: (asString(args.p_screen) ?? '').slice(0, 80),
      version: (asString(args.p_version) ?? '').slice(0, 40),
      occurrences: 1,
      first_seen: new Date(now()).toISOString(),
      last_seen: new Date(now()).toISOString(),
    });
    return json('recorded');
  }

  // ------------------------------------------------------------------ Party

  /** Las funciones party_* con el doble compartido, con la forma de error de PostgREST */
  function partyReply(name: string, user: FakeUser, args: Json): Reply {
    const reply = party.call(name, user.id, args);
    if (reply === null) {
      return pgError('PGRST202', `Could not find the function public.${name} in the schema cache`);
    }
    return 'error' in reply ? pgError(reply.error.code, reply.error.message) : json(reply.data);
  }

  // ------------------------------------------------------------------ banco (B11)

  /** Lo que el banco necesita saber de quien llama, como lo ven las funciones de la base */
  function bankCaller(user: FakeUser, session: Session): FakeBankCaller {
    const flags = settings.get('feature_flags')?.value;
    return {
      userId: user.id,
      role: user.role,
      alias: user.alias,
      activeDevice: isActiveDevice(user, session),
      plan: userPlan(user.id),
      flags: isRecord(flags)
        ? Object.fromEntries(
            Object.entries(flags).filter((entry): entry is [string, boolean] => {
              return typeof entry[1] === 'boolean';
            }),
          )
        : {},
    };
  }

  // ------------------------------------------------------------------ rpc

  function handleRpc(name: string, auth: Auth, body: unknown): Reply {
    const args: Json = isRecord(body) ? body : {};
    if (auth.kind === 'invalid') return pgError('PGRST301', 'JWT expired');
    // Las únicas funciones que anon puede ejecutar
    if (name === 'report_client_error') return reportClientError(args);
    if (name === 'sync_clock') {
      if (auth.kind !== 'user')
        return pgError('42501', 'permission denied for function sync_clock');
      return json(new Date(now()).toISOString());
    }
    if (auth.kind !== 'user') return NO_SESSION;
    const { user, session } = auth;
    const requireActiveDevice = (): Reply | null =>
      isActiveDevice(user, session) ? null : NOT_ACTIVE_DEVICE;
    if (server.bank && isBankRpc(name)) {
      return fromBankReply(bankRpc(server.bank, name, bankCaller(user, session), args));
    }
    switch (name) {
      case 'claim_device':
        return claimDevice(user, session, args);
      case 'log_rejected_claim':
        return logRejectedClaim(user, args);
      case 'my_plan':
        return requireActiveDevice() ?? myPlan(user);
      case 'sync_push_records':
        return requireActiveDevice() ?? pushRecords(user, args);
      case 'sync_push_events':
        return requireActiveDevice() ?? pushEvents(user, args);
      case 'my_referral_code':
        return requireActiveDevice() ?? json(referralCodeOf(user.id));
      case 'my_referrals':
        return requireActiveDevice() ?? myReferrals(user);
      case 'redeem_referral_code':
        return requireActiveDevice() ?? redeemReferral(user, args);
      case 'delete_my_data':
        return requireActiveDevice() ?? deleteMyData(user);
      case 'delete_my_account':
        return requireActiveDevice() ?? deleteMyAccount(user);
      case 'admin_list_users':
        return adminListUsers(user, args);
      case 'set_user_role':
        return setUserRole(user, args);
      case 'party_open':
      case 'party_overview':
      case 'party_create_group':
      case 'party_join_group':
      case 'party_leave_group':
      case 'party_leave_all':
      case 'party_publish':
      case 'party_create_challenge':
      case 'party_create_duel':
      case 'party_start_duel':
      case 'party_submit_duel_result':
      case 'party_rotate_code':
      case 'party_remove_member':
      case 'party_delete_challenge':
      case 'party_export_mine':
        return requireActiveDevice() ?? partyReply(name, user, args);
      default:
        return pgError(
          'PGRST202',
          `Could not find the function public.${name} in the schema cache`,
          null,
          null,
        );
    }
  }

  // ------------------------------------------------------------------ tablas

  /** Las filas que las políticas por fila dejan ver a quien llama */
  function visibleRows(table: string, auth: Auth): Json[] | null {
    const user = auth.kind === 'user' ? auth.user : null;
    const active = auth.kind === 'user' && isActiveDevice(auth.user, auth.session);
    const own = <T extends { userId: string }>(list: T[]) =>
      user ? list.filter((item) => item.userId === user.id) : [];
    switch (table) {
      case 'platform_settings':
        return [...settings.entries()].map(([key, item]) => ({
          key,
          value: item.value,
          updated_at: item.updatedAt,
        }));
      case 'user_roles':
        return (user ? (isAdmin(user) ? [...users.values()] : [user]) : []).map((item) => ({
          user_id: item.id,
          role: item.role,
          updated_at: item.createdAt,
          updated_by: null,
        }));
      case 'profiles':
        // Por columnas la API solo lee id y alias de cualquier perfil (20261018000001)
        return (user ? (isAdmin(user) ? [...users.values()] : [user]) : []).map((item) => ({
          id: item.id,
          alias: item.alias,
        }));
      case 'private_accounts':
        return user && active ? [accounts.get(user.id) ?? {}] : [];
      case 'device_sessions': {
        const row = user ? deviceSessions.get(user.id) : undefined;
        return user && row
          ? [
              {
                user_id: user.id,
                device_id: row.deviceId,
                label: row.label,
                session_id: row.sessionId,
                claimed_at: new Date(row.claimedAt).toISOString(),
              },
            ]
          : [];
      }
      case 'privacy_acceptances':
        return user ? privacyAcceptances.filter((row) => row.user_id === user.id) : [];
      case 'sync_records':
        return user && active
          ? [...syncRecords.values()].filter((row) => row.user_id === user.id)
          : [];
      case 'events':
        return user && active ? events.filter((row) => row.user_id === user.id) : [];
      case 'subscriptions': {
        const row = user ? subscriptions.get(user.id) : undefined;
        return user && active && row
          ? [
              {
                user_id: user.id,
                plan: row.plan,
                status: row.status,
                provider: row.provider,
                current_period_end: row.currentPeriodEnd,
              },
            ]
          : [];
      }
      case 'payments':
        return own(payments).map((payment) => ({
          id: payment.id,
          user_id: payment.userId,
          plan: payment.plan,
          provider: payment.provider,
          amount_mxn: payment.amountMxn,
          paid_at: payment.paidAt,
        }));
      case 'referral_codes':
        return user && active && referralCodes.has(user.id)
          ? [{ user_id: user.id, code: referralCodes.get(user.id) }]
          : [];
      case 'referrals':
        return user && active
          ? referrals
              .filter((item) => item.referrerId === user.id || item.referredId === user.id)
              .map((item) => ({
                id: item.id,
                referrer_id: item.referrerId,
                referred_id: item.referredId,
                code: item.code,
                status: item.status,
                created_at: item.createdAt,
                completed_at: item.completedAt,
              }))
          : [];
      case 'subscription_grants':
        return active
          ? own(grants).map((grant) => ({
              id: grant.id,
              user_id: grant.userId,
              kind: grant.kind,
              referral_id: grant.referralId,
              starts_at: grant.startsAt,
              ends_at: grant.endsAt,
            }))
          : [];
      case 'client_errors':
        return user && isAdmin(user) ? clientErrors : [];
      default:
        return null;
    }
  }

  function handleTable(table: string, auth: Auth, request: Request, url: URL): Reply {
    if (auth.kind === 'invalid') return pgError('PGRST301', 'JWT expired');
    const method = request.method();
    const body = parseJsonBody(request);
    const prefer = request.headers().prefer ?? '';
    if (method === 'GET' || method === 'HEAD') {
      const rows = visibleRows(table, auth);
      if (rows === null) {
        return pgError(
          'PGRST205',
          `Could not find the table 'public.${table}' in the schema cache`,
        );
      }
      return rowsReply(rows, request, url);
    }
    const user = auth.kind === 'user' ? auth.user : null;
    const active = auth.kind === 'user' && isActiveDevice(auth.user, auth.session);
    const stamp = new Date(now()).toISOString();
    if (table === 'privacy_acceptances' && method === 'POST' && user) {
      const incoming = Array.isArray(body) ? (body as unknown[]) : [body];
      const inserted: Json[] = [];
      for (const raw of incoming) {
        if (!isRecord(raw) || raw.user_id !== user.id) {
          return pgError('42501', 'new row violates row-level security policy');
        }
        const row: Json = {
          id: privacyAcceptances.length + 1,
          user_id: user.id,
          notice_version: raw.notice_version,
          accepted_at: stamp,
          marketing_opt_out: raw.marketing_opt_out === true,
        };
        privacyAcceptances.push(row);
        inserted.push(row);
      }
      return prefer.includes('return=representation') ? json(inserted, 201) : empty(201);
    }
    if (table === 'private_accounts' && method === 'PATCH' && user && isRecord(body)) {
      const current = accounts.get(user.id);
      const filtered = applyQuery(current ? [current] : [], url);
      if (current && filtered.length > 0 && active) {
        accounts.set(user.id, { ...current, ...body, user_id: user.id, email: current.email });
      }
      return empty(204);
    }
    if (table === 'profiles' && method === 'PATCH' && user && isRecord(body)) {
      const filtered = applyQuery([{ id: user.id }], url);
      const alias = asString(body.alias)?.trim();
      if (filtered.length > 0 && alias) user.alias = alias.slice(0, 40);
      return empty(204);
    }
    if (table === 'platform_settings' && user && isAdmin(user)) {
      if (method === 'POST' && isRecord(body) && typeof body.key === 'string') {
        settings.set(body.key, { value: body.value, updatedAt: stamp });
        return empty(201);
      }
      if (method === 'DELETE') {
        const key = url.searchParams.get('key')?.replace(/^eq\./, '');
        if (key !== undefined) settings.delete(key);
        return empty(204);
      }
    }
    // Las demás tablas no se escriben desde la API. La base lo rechaza con el permiso por fila
    return pgError('42501', `permission denied for table ${table}`);
  }

  // ------------------------------------------------------------------ auth

  function handleAuth(path: string, auth: Auth, request: Request, url: URL): Reply {
    const body = parseJsonBody(request);
    const args: Json = isRecord(body) ? body : {};
    if (path === '/otp' && request.method() === 'POST') {
      const email = normalizeEmail(args.email);
      if (!email) {
        return authError(
          422,
          'validation_failed',
          'Unable to validate email address: invalid format',
        );
      }
      let user = userByEmail(email);
      if (!user) {
        if (args.create_user === false) {
          return authError(422, 'otp_disabled', 'Signups not allowed for otp');
        }
        const alias = isRecord(args.data) ? asString(args.data.alias) : null;
        user = createUser({ email, alias: alias ?? undefined });
      }
      sendEmail(user, url.searchParams.get('redirect_to') ?? `${appUrl}/`);
      return json({});
    }
    if (path === '/verify' && request.method() === 'POST') {
      const email = normalizeEmail(args.email);
      const token = asString(args.token);
      const type = asString(args.type);
      if (!email || !token || !['email', 'magiclink', 'signup'].includes(type ?? '')) {
        return authError(400, 'validation_failed', 'Verify requires an email and a token');
      }
      const otp = otps.get(email);
      const user = userByEmail(email);
      if (!otp || !user || otp.code !== token || otp.expiresAt <= now()) {
        return authError(403, 'otp_expired', 'Token has expired or is invalid');
      }
      otps.delete(email);
      return json(sessionJson(createSession(user), user));
    }
    if (path === '/user' && request.method() === 'GET') {
      if (auth.kind === 'user') return json(userJson(auth.user));
      return authError(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');
    }
    if (path === '/logout' && request.method() === 'POST') {
      if (auth.kind === 'user') {
        const scope = url.searchParams.get('scope') ?? 'global';
        for (const [token, session] of sessions) {
          if (session.userId !== auth.user.id) continue;
          const mine = token === auth.session.accessToken;
          if (scope === 'global' || (scope === 'local' && mine) || (scope === 'others' && !mine)) {
            sessions.delete(token);
          }
        }
      }
      return empty(204);
    }
    if (path === '/token' && request.method() === 'POST') {
      if (url.searchParams.get('grant_type') !== 'refresh_token') {
        return authError(400, 'unsupported_grant_type', 'unsupported_grant_type');
      }
      const refreshToken = asString(args.refresh_token);
      const session = [...sessions.values()].find((item) => item.refreshToken === refreshToken);
      const user = session ? users.get(session.userId) : undefined;
      if (!session || !user) {
        return authError(
          400,
          'refresh_token_not_found',
          'Invalid Refresh Token: Refresh Token Not Found',
        );
      }
      const next = rotateSession(session);
      return json(sessionJson(next, user));
    }
    return authError(404, 'not_found', `Ruta de auth sin simular: ${path}`);
  }

  // ------------------------------------------------------------------ edge functions

  /**
   * Storage, solo el bucket privado avatars de la foto de perfil (B2), con sus políticas reducidas a
   * lo propio. Cada alumno con sesión sube, baja y quita solo su <id>/avatar.jpg desde su dispositivo
   * activo. Como la API real, quitar lo que no existe o lo ajeno responde una lista vacía y bajar lo
   * que no se ve responde 400 con not_found. Borrar la cuenta no quita la foto, porque Storage no deja
   * que la base lo haga. La quita la app antes con la API
   */
  function handleStorage(path: string, auth: Auth, request: Request): Reply {
    const deckPrefix = `/object/${DECK_CATALOG_BUCKET}/`;
    if (server.bank && path.startsWith(deckPrefix)) {
      const caller = auth.kind === 'user' ? bankCaller(auth.user, auth.session) : null;
      const objectName = decodeURIComponent(path.slice(deckPrefix.length));
      return fromBankReply(
        bankStorage(server.bank, caller, request.method(), objectName, uploadedFile(request)),
      );
    }
    const own =
      auth.kind === 'user' && isActiveDevice(auth.user, auth.session)
        ? `${auth.user.id}/avatar.jpg`
        : null;
    const method = request.method();
    if (method === 'DELETE' && path === '/object/avatars') {
      const body = parseJsonBody(request);
      const prefixes: unknown[] =
        isRecord(body) && Array.isArray(body.prefixes) ? body.prefixes : [];
      const removed = prefixes.filter(
        (name): name is string =>
          typeof name === 'string' && name === own && avatarObjects.delete(name),
      );
      return json(removed.map((name) => ({ name, bucket_id: 'avatars' })));
    }
    const match = /^\/object\/avatars\/(.+)$/.exec(path);
    const name = match?.[1] ? decodeURIComponent(match[1]) : null;
    if (name !== null && method === 'GET') {
      const file = name === own ? avatarObjects.get(name) : undefined;
      return file
        ? { status: 200, body: file, contentType: 'image/jpeg' }
        : storageError('404', 'not_found', 'Object not found');
    }
    if (name !== null && (method === 'POST' || method === 'PUT')) {
      if (name !== own) {
        return storageError('403', 'Unauthorized', 'new row violates row-level security policy');
      }
      const file = uploadedFile(request);
      if (!file) return storageError('400', 'InvalidRequest', 'No llegó el archivo');
      avatarObjects.set(name, file);
      return json({ Id: randomUUID(), Key: `avatars/${name}` });
    }
    return storageError('404', 'not_found', `Ruta de Storage sin simular: ${method} ${path}`);
  }

  function handleFunction(name: string, auth: Auth, request: Request): Reply {
    if (request.method() !== 'POST') return json({ error: 'method' }, 405);
    if (name === 'bank-sync' && server.bank) {
      const caller = auth.kind === 'user' ? bankCaller(auth.user, auth.session) : null;
      return fromBankReply(bankFunction(server.bank, caller, parseJsonBody(request)));
    }
    if (auth.kind !== 'user') return json({ error: 'unauthorized' }, 401);
    const { user } = auth;
    const body = parseJsonBody(request);
    if (name === 'create-checkout') {
      const args: Json = isRecord(body) ? body : {};
      const plan = args.plan;
      const provider = args.provider;
      if (!isPaidPlan(plan) || (provider !== 'stripe' && provider !== 'mercadopago')) {
        return json({ error: 'invalid' }, 400);
      }
      if (server.checkoutError) {
        const status =
          server.checkoutError === 'not_configured'
            ? 503
            : server.checkoutError === 'provider'
              ? 502
              : 409;
        return json({ error: server.checkoutError }, status);
      }
      if (subscriptionInForce(user.id)) return json({ error: 'already_subscribed' }, 409);
      if (plan === 'founder') {
        const taken = [...subscriptions.values()].filter((row) => row.plan === 'founder').length;
        if (server.founderSeats - taken <= 0) return json({ error: 'founder_full' }, 409);
      }
      const back = (result: 'ok' | 'cancelado') => `${appUrl}/suscripcion?pago=${result}`;
      const checkout: CheckoutSession = {
        id: nextId('cs_test_fake'),
        userId: user.id,
        plan,
        provider,
        successUrl: back('ok'),
        cancelUrl: back('cancelado'),
        status: 'open',
      };
      checkouts.set(checkout.id, checkout);
      return json({ url: `${FAKE_GATEWAY_ORIGIN}/c/pay/${checkout.id}` });
    }
    if (name === 'create-portal-session') {
      if (server.portalError) {
        const status =
          server.portalError === 'no_customer'
            ? 404
            : server.portalError === 'not_configured'
              ? 503
              : 502;
        return json({ error: server.portalError }, status);
      }
      if (!stripeCustomers.has(user.id)) return json({ error: 'no_customer' }, 404);
      const portal: PortalSession = {
        id: nextId('bps_fake'),
        userId: user.id,
        returnUrl: `${appUrl}/suscripcion`,
      };
      portals.set(portal.id, portal);
      return json({ url: `${FAKE_PORTAL_ORIGIN}/p/session/${portal.id}` });
    }
    return json({ error: 'not_found' }, 404);
  }

  // ------------------------------------------------------------------ pasarela y portal

  function formField(request: Request, name: string): string | null {
    return new URLSearchParams(request.postData() ?? '').get(name);
  }

  function handleGateway(request: Request, url: URL): Reply {
    const payMatch = /^\/c\/pay\/([^/]+)$/.exec(url.pathname);
    if (payMatch && request.method() === 'GET') {
      const checkout = checkouts.get(payMatch[1] ?? '');
      if (!checkout)
        return { status: 404, body: 'Sesión de pago desconocida', contentType: 'text/plain' };
      return html(gatewayPage({ sessionId: checkout.id, plan: checkout.plan }));
    }
    if (request.method() === 'POST') {
      const checkout = checkouts.get(formField(request, 'session') ?? '');
      if (!checkout)
        return { status: 404, body: 'Sesión de pago desconocida', contentType: 'text/plain' };
      if (url.pathname === GATEWAY_PAY_PATH) {
        if (checkout.status === 'open') applyPayment(checkout);
        return redirect(checkout.successUrl);
      }
      if (url.pathname === GATEWAY_CANCEL_PATH) {
        checkout.status = 'canceled';
        return redirect(checkout.cancelUrl);
      }
    }
    return { status: 404, body: 'Página sin simular', contentType: 'text/plain' };
  }

  function handlePortal(request: Request, url: URL): Reply {
    const match = /^\/p\/session\/([^/]+)$/.exec(url.pathname);
    if (match && request.method() === 'GET') {
      const portal = portals.get(match[1] ?? '');
      const row = portal ? subscriptions.get(portal.userId) : undefined;
      if (!portal || !row || row.plan === 'free') {
        return { status: 404, body: 'Sesión del portal desconocida', contentType: 'text/plain' };
      }
      return html(
        portalPage({ sessionId: portal.id, plan: row.plan, returnUrl: portal.returnUrl }),
      );
    }
    if (request.method() === 'POST' && url.pathname === PORTAL_CANCEL_SUBSCRIPTION_PATH) {
      const portal = portals.get(formField(request, 'session') ?? '');
      if (!portal)
        return { status: 404, body: 'Sesión del portal desconocida', contentType: 'text/plain' };
      const row = subscriptions.get(portal.userId);
      // Cancelar desde el portal conserva el plan hasta el fin del periodo ya pagado, como Stripe
      if (row) subscriptions.set(portal.userId, { ...row, status: 'canceled' });
      return redirect(portal.returnUrl);
    }
    return { status: 404, body: 'Página sin simular', contentType: 'text/plain' };
  }

  // ------------------------------------------------------------------ enrutado

  function corsHeaders(request: Request): Record<string, string> {
    const origin = request.headers().origin;
    return {
      'access-control-allow-origin': origin ?? '*',
      'access-control-allow-credentials': 'true',
      'access-control-expose-headers': 'content-range, x-supabase-api-version',
      vary: 'origin',
    };
  }

  function preflight(request: Request): Reply {
    return {
      status: 204,
      headers: {
        ...corsHeaders(request),
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers':
          request.headers()['access-control-request-headers'] ??
          'authorization, apikey, content-type, prefer, accept, accept-profile, content-profile, x-client-info, x-supabase-api-version',
        'access-control-max-age': '600',
      },
    };
  }

  function handleSupabase(request: Request): Reply {
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') return preflight(request);
    const apiKey = request.headers().apikey ?? url.searchParams.get('apikey');
    if (apiKey !== FAKE_SUPABASE_ANON_KEY) {
      return json(
        {
          message: 'No API key found in request',
          hint: 'No `apikey` request header or url param was found.',
        },
        401,
      );
    }
    const auth = authenticate(request);
    const path = url.pathname;
    if (path.startsWith('/auth/v1/'))
      return handleAuth(path.slice('/auth/v1'.length), auth, request, url);
    if (path.startsWith('/rest/v1/rpc/')) {
      return handleRpc(path.slice('/rest/v1/rpc/'.length), auth, parseJsonBody(request));
    }
    if (path.startsWith('/rest/v1/')) {
      return handleTable(path.slice('/rest/v1/'.length), auth, request, url);
    }
    if (path.startsWith('/functions/v1/')) {
      return handleFunction(path.slice('/functions/v1/'.length), auth, request);
    }
    if (path.startsWith('/storage/v1/')) {
      return handleStorage(path.slice('/storage/v1'.length), auth, request);
    }
    return json({ message: `Ruta sin simular: ${path}` }, 404);
  }

  async function fulfill(
    route: Route,
    handler: (request: Request, url: URL) => Reply,
    withCors: boolean,
  ): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    let reply: Reply;
    try {
      reply = handler(request, url);
    } catch (error) {
      reply = json({ message: error instanceof Error ? error.message : String(error) }, 500);
    }
    calls.push({
      method: request.method(),
      path: `${url.pathname}${url.search}`,
      body: parseJsonBody(request),
      status: reply.status,
    });
    try {
      await route.fulfill({
        status: reply.status,
        headers: { ...(withCors ? corsHeaders(request) : {}), ...reply.headers },
        ...(reply.body === undefined ? {} : { body: reply.body }),
        ...(reply.contentType === undefined ? {} : { contentType: reply.contentType }),
      });
    } catch (error) {
      // La página ya cerró o navegó y la petición se fue. Se intenta abortar para que no quede
      // colgada esperando una respuesta, y si tampoco se puede, no hay nada que atender
      console.warn(`Supabase simulado no pudo responder ${url.pathname}. ${String(error)}`);
      await route.abort().catch(() => undefined);
    }
  }

  const emailOf = (email: string): FakeUser | undefined => userByEmail(email);

  return {
    url: FAKE_SUPABASE_URL,
    async attach(context) {
      await context.route(`${FAKE_SUPABASE_URL}/**`, (route) =>
        fulfill(route, (request) => handleSupabase(request), true),
      );
      await context.route(`${FAKE_GATEWAY_ORIGIN}/**`, (route) =>
        fulfill(route, handleGateway, false),
      );
      await context.route(`${FAKE_PORTAL_ORIGIN}/**`, (route) =>
        fulfill(route, handlePortal, false),
      );
    },
    createUser,
    userByEmail,
    issueMagicLink(email, alias) {
      const user = createUser({ email, ...(alias === undefined ? {} : { alias }) });
      return sendEmail(user, `${appUrl}/`).link;
    },
    emails,
    lastEmail(email) {
      const wanted = email.trim().toLowerCase();
      return [...emails].reverse().find((item) => item.to === wanted);
    },
    deviceSessionOf(email) {
      const user = emailOf(email);
      const row = user ? deviceSessions.get(user.id) : undefined;
      return row ? { deviceId: row.deviceId, label: row.label, sessionId: row.sessionId } : null;
    },
    deviceLimitRetryAt(email) {
      const user = emailOf(email);
      return user ? deviceLimitStatus(user.id).retryAt : null;
    },
    subscriptionOf(email) {
      const user = emailOf(email);
      return (user && subscriptions.get(user.id)) ?? null;
    },
    setSubscription(email, subscription) {
      const user = emailOf(email) ?? createUser({ email });
      subscriptions.set(user.id, subscription);
      if (subscription.provider === 'stripe' && !stripeCustomers.has(user.id)) {
        stripeCustomers.set(user.id, nextId('cus_fake'));
      }
    },
    referralCodeOf(email) {
      const user = emailOf(email) ?? createUser({ email });
      return referralCodeOf(user.id);
    },
    referralsOf(email) {
      const user = emailOf(email);
      const mine = referrals.filter((referral) => referral.referrerId === user?.id);
      return {
        pending: mine.filter((referral) => referral.status === 'pending').length,
        completed: mine.filter((referral) => referral.status === 'completed').length,
      };
    },
    paymentNotice(notice) {
      const user = emailOf(notice.email);
      if (!user) throw new Error(`No hay una cuenta con el correo ${notice.email}`);
      return applyNotice({
        eventId: notice.eventId,
        userId: user.id,
        plan: notice.plan,
        provider: 'stripe',
        paymentId: notice.paymentId,
        amountMxn: notice.amountMxn,
      });
    },
    lastPaymentNotice(email) {
      const user = emailOf(email);
      const notice = user ? lastNotices.get(user.id) : undefined;
      return user && notice
        ? {
            eventId: notice.eventId,
            email: user.email,
            plan: notice.plan,
            paymentId: notice.paymentId,
            amountMxn: notice.amountMxn,
          }
        : null;
    },
    calls,
    rpcCalls(name) {
      return calls.filter((call) => call.path.startsWith(`/rest/v1/rpc/${name}`));
    },
    party,
    userIdOf(email) {
      return emailOf(email)?.id;
    },
    get deviceLimits() {
      return server.deviceLimits;
    },
    set deviceLimits(value) {
      server.deviceLimits = value;
    },
    get founderSeats() {
      return server.founderSeats;
    },
    set founderSeats(value) {
      server.founderSeats = value;
    },
    get checkoutError() {
      return server.checkoutError;
    },
    set checkoutError(value) {
      server.checkoutError = value;
    },
    get portalError() {
      return server.portalError;
    },
    set portalError(value) {
      server.portalError = value;
    },
    get bank() {
      return server.bank;
    },
    set bank(value) {
      server.bank = value;
    },
  };
}

/** Crea el servidor falso y lo pone a atender las peticiones del contexto */
export async function installFakeSupabase(
  context: BrowserContext,
  options: FakeSupabaseOptions = {},
): Promise<FakeSupabaseServer> {
  const server = createFakeSupabase(options);
  await server.attach(context);
  return server;
}

// ---------------------------------------------------------------------------------------------
// Banco en la nube (B11)

/** Engancha el banco en memoria al Supabase simulado. Desde aquí las rutas del banco van a él */
export function attachBank(server: FakeSupabaseServer, store: FakeBankStore): void {
  server.bank = store;
}

function fromBankReply(reply: FakeBankReply): Reply {
  if ('bytes' in reply) {
    return { status: reply.status, body: reply.bytes, contentType: reply.contentType };
  }
  return json(reply.json, reply.status);
}

const bankError = (code: string, message: string): FakeBankReply => ({
  status: pgStatus(code),
  json: { code, message, details: null, hint: null },
});

/** La cuota vacía de bank_quota, con el plan de quien llama */
function emptyQuota(store: FakeBankStore, caller: FakeBankCaller) {
  const team = isTeam(caller);
  const free = !team && caller.plan === 'free';
  return {
    open: team || bankOpen(caller),
    plan: team ? caller.role : caller.plan,
    limit: free ? store.settings.freeDaily : null,
    used: 0,
    left: free ? store.settings.freeDaily : null,
    day: fakeStudyDay(store),
    resetsAt: fakeStudyDayResetsAt(store),
    brake: { retryAt: null },
  };
}

const NOT_ACTIVE: FakeBankReply = bankError(
  '42501',
  'Este dispositivo no es el activo de la cuenta',
);
const TEAM_ONLY: FakeBankReply = bankError('42501', 'Solo el equipo médico');

/**
 * Las rpc del banco. Paso 0 de B11. Responden vacío con las formas de src/data/bank/contracts.ts. El
 * paquete B manda las del alumno a fakeBank.ts y el paquete C las del equipo a fakeEditorial.ts
 */
function bankRpc(
  store: FakeBankStore,
  name: BankRpc,
  caller: FakeBankCaller,
  args: Record<string, unknown>,
): FakeBankReply {
  const ok = (value: unknown): FakeBankReply => ({ status: 200, json: value });
  switch (name) {
    case 'catalog_changes': {
      if (!caller.activeDevice) return NOT_ACTIVE;
      const since = typeof args.p_since === 'number' ? args.p_since : 0;
      return ok({
        open: isTeam(caller) || bankOpen(caller),
        rows: [],
        nextSince: since,
        done: true,
      });
    }
    case 'fetch_questions': {
      if (!caller.activeDevice) return NOT_ACTIVE;
      const open = isTeam(caller) || bankOpen(caller);
      const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
      const asked = [...listOf(args.p_question_ids), ...listOf(args.p_version_ids)].filter(
        (id): id is string => typeof id === 'string',
      );
      return ok({
        questions: [],
        cases: [],
        denied: asked.map((id) => ({ id, reason: open ? 'not_found' : 'closed' })),
        quota: emptyQuota(store, caller),
      });
    }
    case 'bank_quota':
      return caller.activeDevice ? ok(emptyQuota(store, caller)) : NOT_ACTIVE;
    case 'report_question':
      return caller.activeDevice ? ok({ status: 'not_found', reportId: null }) : NOT_ACTIVE;
    case 'bias_agreement_summary':
      return ok({
        pairs: 0,
        kappa: null,
        vocabulary: 'trap',
        calibrating: true,
        minPairs: 30,
        minKappa: 0.4,
      });
    case 'deck_catalog_list':
      if (!caller.activeDevice) return NOT_ACTIVE;
      return ok({ canDownload: isTeam(caller) || caller.plan !== 'free', decks: [] });
    case 'record_deck_download':
      return caller.activeDevice ? ok(null) : NOT_ACTIVE;
    default:
      break;
  }
  if (!isTeam(caller)) return TEAM_ONLY;
  switch (name) {
    case 'editor_list':
      return ok({ total: 0, items: [] });
    case 'editor_reports':
    case 'editor_distractor_queue':
    case 'editor_label_pairs':
    case 'admin_bank_sync_runs':
    case 'admin_bank_sync_rows':
    case 'admin_review_report':
    case 'admin_review_report_detail':
    case 'admin_bank_read_alerts':
      return ok([]);
    case 'admin_bank_overview':
      return ok({
        goal: store.settings.bankGoal.approvedToOpen,
        published: 0,
        approved: 0,
        byBranch: [],
        drafts: 0,
        incomplete: 0,
        inReview: 0,
        conflicts: 0,
        missing: 0,
        open: caller.flags.cloudBank === true,
      });
    case 'editor_set_report_status':
    case 'admin_assign_questions':
    case 'admin_confirm_missing':
      return ok(0);
    default:
      return bankError('PGRST202', `El banco simulado todavía no atiende ${name}`);
  }
}

/** La función bank-sync. Paso 0 de B11. Solo el admin, y la corrida sale como apagada */
function bankFunction(
  _store: FakeBankStore,
  caller: FakeBankCaller | null,
  _body: unknown,
): FakeBankReply {
  if (!caller || (caller.role !== 'admin' && caller.role !== 'owner')) {
    return { status: 401, json: { error: 'unauthorized' } };
  }
  return { status: 200, json: { runId: null, status: 'skipped', reason: 'disabled' } };
}

/** El bucket deck-catalog. Paso 0 de B11. No hay objetos y nadie sube */
function bankStorage(
  _store: FakeBankStore,
  caller: FakeBankCaller | null,
  method: string,
  objectName: string,
  _file: Buffer | null,
): FakeBankReply {
  const storageReply = (statusCode: string, error: string, message: string): FakeBankReply => ({
    status: Number(statusCode),
    json: { statusCode, error, message },
  });
  if (!caller)
    return storageReply('400', 'Unauthorized', 'new row violates row-level security policy');
  if (method === 'GET') return storageReply('404', 'not_found', `Object not found: ${objectName}`);
  return storageReply('403', 'Unauthorized', 'new row violates row-level security policy');
}
