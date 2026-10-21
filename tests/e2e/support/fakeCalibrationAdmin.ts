// Las funciones del equipo de la calibración nocturna para el Supabase simulado (B14, paquete C, 8.4 del plan
// de B14). admin_calibration_runs, que usa la pantalla Calibración del admin, y editor_agreement_history, que
// usa el historial de Acuerdo del médico. Leen el modelo en memoria de fakeModelStore.ts, que es el único
// modelo, y devuelven las formas de src/data/model/contracts.ts. Imitan 20261028000003_model_reads.sql, con los
// mismos códigos de error, y el historial que arma seedRuns de ese archivo.
//
// Dos maneras de usarlas.
//   1. adminCalibrationRunsFor y agreementHistoryFor son funciones puras. fakeSupabase.ts (paquete B) las llama
//      desde modelRpc para sus casos admin_calibration_runs y editor_agreement_history, después de revisar el
//      rol, y tests/integration/calibration-admin-fake.test.ts las prueba contra la app sin navegador.
//   2. attachCalibrationAdmin las engancha con context.route por encima de la ruta general, como hace fakeAi.ts
//      con la función de IA, para que las specs corran aunque fakeSupabase.ts todavía no las llame. También
//      refleja en el modelo en memoria lo que el admin guarda en model_settings, y deja esa clave publicada en
//      platform_settings, así la pantalla Calibración y Plataforma ven siempre lo mismo.
// La calibración nocturna no corre en las e2e. Todo es simulado y nunca se mezcla con datos reales.
import type { BrowserContext, Request, Route } from '@playwright/test';
import type { AdminCalibrationRuns, AgreementHistory } from '@/data/model/contracts';
import type { FakeSupabaseServer } from './fakeSupabase';
import { FAKE_SUPABASE_URL } from './fakeSupabaseConfig';
import type { FakeModelStore } from './fakeModelStore';

/** Los topes de las funciones de la base: p_limit se acota entre 1 y esto */
const RUNS_MAX = 200;
const NIGHTS_MAX = 365;
/** Alumnos por dato de la población: el piso de privacidad, nunca menos de 30 */
const MIN_STUDENTS = 30;

const clamp = (value: unknown, fallback: number, max: number): number =>
  Math.min(
    Math.max(typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback, 1),
    max,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ===================================================================== Las respuestas

/** model_settings tal como lo lee el servidor: con sus respaldos y el piso de 30 en minGroupSize */
export function modelSettingsJson(store: FakeModelStore): Record<string, unknown> {
  return {
    calibration: { ...store.settings.calibration },
    features: { ...store.settings.features },
    thresholds: {
      minGroupSize: Math.max(store.settings.minGroupSize, MIN_STUDENTS),
      comparisonWindowDays: store.settings.windowDays,
    },
  };
}

/** admin_calibration_runs. Las corridas, la publicación vigente y lo que dejó la última corrida buena */
export function adminCalibrationRunsFor(
  store: FakeModelStore,
  limit = 30,
  settings: Record<string, unknown> = modelSettingsJson(store),
): AdminCalibrationRuns {
  const runs = [...store.runs]
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, clamp(limit, 30, RUNS_MAX));
  const good = [...store.runs]
    .filter((run) => (run.status === 'ok' || run.status === 'partial') && run.finishedAt !== null)
    .sort((a, b) => Date.parse(b.finishedAt ?? '') - Date.parse(a.finishedAt ?? ''))[0];
  const latestNight = [...store.agreement].sort((a, b) => b.studyDay.localeCompare(a.studyDay))[0];
  const { population } = store;
  return {
    lastOkAt: good?.finishedAt ?? null,
    publication: store.publication
      ? { runId: store.publication.runId, at: store.publication.at }
      : null,
    settings,
    runs,
    overview: {
      items: { ...store.itemCounts },
      // Solo temas con 30 alumnos o más, los de menor acierto primero
      hardestTopics: Object.entries(population.topics)
        .filter(([, topic]) => topic.students >= MIN_STUDENTS)
        .sort((a, b) => a[1].accuracy - b[1].accuracy || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([key, topic]) => ({ key, students: topic.students, accuracy: topic.accuracy })),
      // Solo ramas con 30 reportes o más
      motives: Object.fromEntries(
        Object.entries(population.motives).filter(
          ([, shares]) => (shares.reports ?? 0) >= MIN_STUDENTS,
        ),
      ),
      fatigue: { ...population.fatigue },
      agreement: latestNight ? { kappa: latestNight.kappa, parity: latestNight.parity } : null,
    },
  };
}

/** editor_agreement_history. Una línea por noche del acuerdo del etiquetado, la más reciente primero */
export function agreementHistoryFor(store: FakeModelStore, limit = 60): AgreementHistory {
  return {
    nights: [...store.agreement]
      .sort((a, b) => b.studyDay.localeCompare(a.studyDay) || b.at.localeCompare(a.at))
      .slice(0, clamp(limit, 60, NIGHTS_MAX)),
  };
}

// ===================================================================== Con el navegador

/** Cada llamada que atendió, con el rol de quien la hizo y el estado que contestó */
export interface CalibrationAdminCall {
  name: 'admin_calibration_runs' | 'editor_agreement_history';
  args: Record<string, unknown>;
  role: string | null;
  status: number;
}

export interface CalibrationAdminHooks {
  readonly calls: readonly CalibrationAdminCall[];
  /** Cada valor que el admin guardó en model_settings, tal como llegó, el último al final */
  readonly savedSettings: readonly Record<string, unknown>[];
}

const SETTINGS_KEY = 'model_settings';

/** Refleja en el modelo en memoria lo que el admin guardó en model_settings. Lo que no entiende se ignora */
export function applySavedSettings(store: FakeModelStore, value: unknown): void {
  if (!isRecord(value)) return;
  const { calibration, features, thresholds } = value;
  if (isRecord(calibration)) {
    if (typeof calibration.enabled === 'boolean')
      store.settings.calibration.enabled = calibration.enabled;
    if (calibration.mode === 'dry_run' || calibration.mode === 'apply') {
      store.settings.calibration.mode = calibration.mode;
    }
    if (typeof calibration.minNoticeVersion === 'string') {
      store.settings.calibration.minNoticeVersion = calibration.minNoticeVersion;
    }
  }
  if (isRecord(features)) {
    if (typeof features.comparison === 'boolean')
      store.settings.features.comparison = features.comparison;
    if (typeof features.adaptive === 'boolean')
      store.settings.features.adaptive = features.adaptive;
  }
  if (isRecord(thresholds)) {
    // Como la base: minGroupSize nunca baja de 30 aunque alguien escriba menos
    if (typeof thresholds.minGroupSize === 'number') {
      store.settings.minGroupSize = Math.max(Math.trunc(thresholds.minGroupSize), MIN_STUDENTS);
    }
    if (typeof thresholds.comparisonWindowDays === 'number') {
      store.settings.windowDays = Math.trunc(thresholds.comparisonWindowDays);
    }
  }
}

const bearerOf = (request: Request): string | null => {
  const header = request.headers().authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
};

function corsHeaders(request: Request): Record<string, string> {
  return {
    'access-control-allow-origin': request.headers().origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'content-range, x-supabase-api-version',
    vary: 'origin',
  };
}

const pgError = (code: string, message: string) => ({
  status: code === '42501' || code === '28000' ? 403 : 400,
  body: { code, message, details: null, hint: null },
});

/**
 * Engancha las dos funciones al Supabase simulado de la prueba y deja model_settings publicada en
 * platform_settings. Se llama después de installFakeSupabase, porque las rutas que se registran al final son
 * las que Playwright prueba primero. Lo que no es de aquí pasa a la ruta general con fallback
 */
export async function attachCalibrationAdmin(
  context: BrowserContext,
  server: FakeSupabaseServer,
  store: FakeModelStore,
): Promise<CalibrationAdminHooks> {
  const calls: CalibrationAdminCall[] = [];
  const savedSettings: Record<string, unknown>[] = [];
  // Lo último que guardó el admin, para no perder los números que el modelo en memoria no lleva
  let saved: Record<string, unknown> = {};
  const section = (key: string): Record<string, unknown> => {
    const value = saved[key];
    return isRecord(value) ? value : {};
  };
  /** model_settings como lo tiene el servidor: lo guardado, con encima lo que dice el modelo en memoria */
  const document = (): Record<string, unknown> => {
    const fromStore = modelSettingsJson(store);
    return {
      ...saved,
      calibration: { ...section('calibration'), ...(fromStore.calibration as object) },
      features: { ...section('features'), ...(fromStore.features as object) },
      thresholds: { ...section('thresholds'), ...(fromStore.thresholds as object) },
    };
  };
  // Se publica en cada lectura, así una prueba que cambia el modelo en memoria no tiene que avisar a nadie
  const publish = () => {
    server.setSetting(SETTINGS_KEY, document());
  };
  publish();

  await context.route(`${FAKE_SUPABASE_URL}/rest/v1/**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (url.pathname === '/rest/v1/platform_settings') {
      // Cada lectura ve model_settings al día con el modelo en memoria
      if (method === 'GET') publish();
      // Lo que el admin guarda se refleja en el modelo, y la base lo guarda como siempre
      if (method === 'POST' || method === 'PATCH') {
        const body: unknown = request.postDataJSON();
        const rows = Array.isArray(body) ? body : [body];
        for (const row of rows) {
          if (isRecord(row) && row.key === SETTINGS_KEY && isRecord(row.value)) {
            saved = row.value;
            savedSettings.push(row.value);
            applySavedSettings(store, row.value);
          }
        }
      }
      await route.fallback();
      return;
    }

    const name = url.pathname.startsWith('/rest/v1/rpc/')
      ? url.pathname.slice('/rest/v1/rpc/'.length)
      : null;
    if (
      method !== 'POST' ||
      (name !== 'admin_calibration_runs' && name !== 'editor_agreement_history')
    ) {
      await route.fallback();
      return;
    }

    const body: unknown = request.postDataJSON();
    const args = isRecord(body) ? body : {};
    const token = bearerOf(request);
    const who = token === null ? null : server.aiIdentity.whoAmI(token);
    let reply: { status: number; body: unknown };
    let role: string | null = null;
    if (who === null || (!who.ok && who.failure === 'unauthenticated')) {
      reply = pgError('28000', 'Hace falta iniciar sesión');
    } else if (!who.ok) {
      reply = pgError('42501', 'Este dispositivo no es el activo de la cuenta');
    } else {
      role = who.caller.role;
      if (name === 'admin_calibration_runs') {
        reply =
          role === 'admin' || role === 'owner'
            ? {
                status: 200,
                body: adminCalibrationRunsFor(store, Number(args.p_limit ?? 30), document()),
              }
            : pgError('42501', 'Solo un administrador puede ver la calibración');
      } else {
        reply =
          role === 'student'
            ? pgError('42501', 'Solo el equipo médico')
            : { status: 200, body: agreementHistoryFor(store, Number(args.p_limit ?? 60)) };
      }
    }
    calls.push({ name, args, role, status: reply.status });
    await route.fulfill({
      status: reply.status,
      contentType: 'application/json; charset=utf-8',
      headers: corsHeaders(request),
      body: JSON.stringify(reply.body),
    });
  });

  return { calls, savedSettings };
}
