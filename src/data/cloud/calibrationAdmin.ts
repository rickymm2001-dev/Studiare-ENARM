// Lo que el admin y el médico leen y cambian de la calibración nocturna (B14, 1.5, 1.8, 1.9 y 7.2 del plan de
// B14). admin_calibration_runs trae las corridas con sus conteos y lo que publicó la última buena, y
// editor_agreement_history el kappa de cada noche con su paridad. Los dos revisan el rol por dentro, y con
// B9 el admin también necesita el segundo factor, así que un 42501 avisa a onForbidden. Los ajustes viven
// en la clave model_settings de platform_settings, que todos leen y solo el admin escribe por el permiso
// por fila. Se escribe sin perder lo que esta versión no entiende, y cada valor tiene que pasar el mismo
// esquema que lee la app, así que minGroupSize y populationMinStudents nunca bajan de 30. Aquí solo se
// llama, se valida y se traducen los errores. Nada de esto va en el JavaScript inicial.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  MIN_PRIVACY_GROUP,
  MODEL_SETTINGS_KEY,
  readModelSettings,
  type ModelSettings,
} from '../../config/modelSettings.ts';
import { EditorialError, editorialCodeOf } from '../editorial/editorialRepo.ts';
import { callBankRpc, type ForbiddenHandler } from './editorial.ts';

type Rpc = Pick<SupabaseClient, 'rpc'>;
type Tables = Pick<SupabaseClient, 'from'>;

/** Los nombres de las funciones de la base que usa esta pantalla. Una prueba revisa que existan en la migración */
export const CALIBRATION_ADMIN_RPC = {
  runs: 'admin_calibration_runs',
  agreementHistory: 'editor_agreement_history',
} as const;

/** Corridas que pide la pantalla y noches de acuerdo que pide el historial */
export const RUNS_LIMIT = 30;
export const AGREEMENT_NIGHTS_LIMIT = 60;

// ===================================================================== GitHub

/**
 * El repositorio donde corre la calibración. Es público hasta B17 y después privado: el enlace sigue
 * sirviendo a quien tenga acceso. No es un secreto, ya está en la dirección de la app publicada
 */
export const CALIBRATION_REPOSITORY = 'rickymm2001-dev/Studiare-ENARM';
export const CALIBRATION_WORKFLOW_URL = `https://github.com/${CALIBRATION_REPOSITORY}/actions/workflows/calibration.yml`;

/** El número de una corrida de GitHub: solo dígitos, como lo manda el flujo. Cualquier otra cosa no es un número */
const GITHUB_RUN_ID = /^[0-9]{1,20}$/;

/** La dirección de una corrida de GitHub por su número, o null si el número no tiene la forma de uno */
export function calibrationRunUrl(runId: string | null): string | null {
  return runId !== null && GITHUB_RUN_ID.test(runId)
    ? `https://github.com/${CALIBRATION_REPOSITORY}/actions/runs/${runId}`
    : null;
}

// ===================================================================== Corridas

const count = z.number().int().min(0).catch(0);
const CountValue = z.union([z.number(), z.string(), z.boolean(), z.null()]);

const RunSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  mode: z.string(),
  status: z.string(),
  reason: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  /** Solo trae el número de la corrida de GitHub y el commit, y nada más */
  runner: z
    .object({ runId: z.string().optional(), sha: z.string().optional() })
    .nullable()
    .catch(null),
  counts: z.record(z.string(), CountValue).catch({}),
});
export type CalibrationRun = Omit<z.infer<typeof RunSchema>, 'runner'> & {
  /** El número de la corrida en GitHub, si la corrida lo mandó y tiene la forma de uno */
  githubRunId: string | null;
};

const OverviewSchema = z.object({
  items: z
    .object({ physician_estimate: count, provisional: count, calibrated: count })
    .catch({ physician_estimate: 0, provisional: 0, calibrated: 0 }),
  hardestTopics: z
    .array(z.object({ key: z.string(), students: count, accuracy: z.number() }))
    .catch([]),
  /** Por rama, el número de reportes y la parte de cada motivo. Solo ramas con 30 reportes o más */
  motives: z.record(z.string(), z.record(z.string(), z.number())).catch({}),
  fatigue: z
    .object({
      state: z.enum(['calibrating', 'validated', 'not_valid']),
      students: count,
      longSessions: count,
    })
    .catch({ state: 'calibrating', students: 0, longSessions: 0 }),
  agreement: z
    .object({ kappa: z.number().nullable(), parity: z.boolean().nullable() })
    .nullable()
    .catch(null),
});
export type CalibrationOverview = z.infer<typeof OverviewSchema>;

const AdminRunsSchema = z.object({
  lastOkAt: z.string().nullable(),
  publication: z.object({ runId: z.string(), at: z.string() }).nullable().catch(null),
  settings: z.unknown(),
  // Una corrida que no cumple el esquema se descarta sola, no tira la pantalla
  runs: z.array(z.unknown()),
  overview: OverviewSchema,
});

export interface AdminCalibration {
  /** Cuándo terminó la última corrida ok o partial. null si ninguna */
  lastOkAt: string | null;
  /** La corrida de la que leen los alumnos, y cuándo se publicó. null si todavía no hay */
  publication: { runId: string; at: string } | null;
  settings: ModelSettings;
  /** La más reciente primero */
  runs: CalibrationRun[];
  overview: CalibrationOverview;
}

/** Las últimas corridas con lo que publicó la última buena. Solo admin, y con B9 con segundo factor */
export async function readCalibrationRuns(
  cloud: Rpc,
  onForbidden?: ForbiddenHandler,
  limit: number = RUNS_LIMIT,
): Promise<AdminCalibration> {
  const raw = await callBankRpc(
    cloud,
    CALIBRATION_ADMIN_RPC.runs,
    { p_limit: limit },
    AdminRunsSchema,
    onForbidden,
  );
  const runs = raw.runs.flatMap((row): CalibrationRun[] => {
    const parsed = RunSchema.safeParse(row);
    if (!parsed.success) return [];
    const { runner, ...run } = parsed.data;
    const githubRunId =
      runner?.runId !== undefined && GITHUB_RUN_ID.test(runner.runId) ? runner.runId : null;
    return [{ ...run, githubRunId }];
  });
  return {
    lastOkAt: raw.lastOkAt,
    publication: raw.publication,
    settings: readModelSettings(raw.settings),
    runs,
    overview: raw.overview,
  };
}

// ===================================================================== Acuerdo por noche

const AgreementNightSchema = z.object({
  studyDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  at: z.string().nullable(),
  pairs: count,
  kappa: z.number().nullable(),
  observed: z.number().nullable(),
  expected: z.number().nullable(),
  /** true si el kappa de la noche es igual al del tablero del médico. null si no se comparó */
  parity: z.boolean().nullable(),
});
export type AgreementNight = z.infer<typeof AgreementNightSchema>;

const AgreementHistorySchema = z.object({ nights: z.array(z.unknown()) });

/** El acuerdo del etiquetado noche por noche, la más reciente primero. Médico, admin y dueño */
export async function readAgreementHistory(
  cloud: Rpc,
  onForbidden?: ForbiddenHandler,
  limit: number = AGREEMENT_NIGHTS_LIMIT,
): Promise<AgreementNight[]> {
  const raw = await callBankRpc(
    cloud,
    CALIBRATION_ADMIN_RPC.agreementHistory,
    { p_limit: limit },
    AgreementHistorySchema,
    onForbidden,
  );
  return raw.nights.flatMap((row) => {
    const parsed = AgreementNightSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

// ===================================================================== Ajustes del modelo

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface ModelSettingsDocument {
  /** Lo guardado tal cual, para no perder las llaves que esta versión no conoce */
  raw: Record<string, unknown>;
  /** Lo que la app entiende, con los valores de fábrica donde falte algo */
  settings: ModelSettings;
}

export type ModelThresholdsPatch = Partial<Omit<ModelSettings['thresholds'], 'fatigue'>> & {
  fatigue?: Partial<ModelSettings['thresholds']['fatigue']>;
};

/** Lo que se cambia. Todo lo que no se nombra se queda como está */
export interface ModelSettingsPatch {
  calibration?: Partial<Pick<ModelSettings['calibration'], 'enabled' | 'mode'>>;
  features?: Partial<ModelSettings['features']>;
  thresholds?: ModelThresholdsPatch;
}

/** Lee la clave model_settings. Todos la leen. Sin la clave quedan los valores de fábrica */
export async function readModelSettingsDocument(cloud: Tables): Promise<ModelSettingsDocument> {
  let reply: { data: unknown; error: { code?: string } | null };
  try {
    reply = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', MODEL_SETTINGS_KEY)
      .maybeSingle();
  } catch {
    throw new EditorialError('network');
  }
  if (reply.error) throw new EditorialError(editorialCodeOf(reply.error.code));
  const value = (reply.data as { value?: unknown } | null)?.value;
  const raw = isRecord(value) ? value : {};
  return { raw, settings: readModelSettings(raw) };
}

/** Une los cambios a lo guardado sección por sección, sin perder lo que no se toca */
export function mergeModelSettings(
  raw: Record<string, unknown>,
  patch: ModelSettingsPatch,
): Record<string, unknown> {
  const section = (key: string): Record<string, unknown> => {
    const current = raw[key];
    return isRecord(current) ? current : {};
  };
  const next: Record<string, unknown> = { ...raw };
  if (patch.calibration) next.calibration = { ...section('calibration'), ...patch.calibration };
  if (patch.features) next.features = { ...section('features'), ...patch.features };
  if (patch.thresholds) {
    const { fatigue, ...rest } = patch.thresholds;
    const current = section('thresholds');
    const currentFatigue = isRecord(current.fatigue) ? current.fatigue : {};
    next.thresholds = {
      ...current,
      ...rest,
      ...(fatigue ? { fatigue: { ...currentFatigue, ...fatigue } } : {}),
    };
  }
  return next;
}

/** Las hojas de un cambio con su ruta, para compararlas con lo que la app entiende */
function leavesOf(value: unknown, path: readonly string[] = []): [readonly string[], unknown][] {
  return isRecord(value)
    ? Object.entries(value).flatMap(([key, child]) => leavesOf(child, [...path, key]))
    : [[path, value]];
}

function valueAt(root: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), root);
}

/**
 * Cada valor que se va a escribir tiene que ser el que la app va a leer. El esquema de lectura reemplaza
 * por el de fábrica un valor fuera de rango, así que si el que se lee no es el que se escribió, el
 * cambio no es válido y no se guarda. Así los topes de un solo lugar, el esquema, valen también al escribir
 */
function assertAccepted(next: Record<string, unknown>, patch: ModelSettingsPatch): void {
  const accepted = readModelSettings(next);
  for (const [path, value] of leavesOf(patch)) {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new EditorialError('invalid');
    if (!Object.is(valueAt(accepted, path), value)) throw new EditorialError('invalid');
  }
  const { thresholds } = patch;
  if (
    (thresholds?.minGroupSize !== undefined && thresholds.minGroupSize < MIN_PRIVACY_GROUP) ||
    (thresholds?.populationMinStudents !== undefined &&
      thresholds.populationMinStudents < MIN_PRIVACY_GROUP)
  ) {
    throw new EditorialError('invalid');
  }
}

/**
 * Guarda los cambios en model_settings. Vuelve a leer lo guardado justo antes, así un cambio de otra
 * sección hecho desde otra pantalla no se pisa. Devuelve lo que quedó. Lanza invalid si un valor no es
 * aceptable, forbidden (y avisa a onForbidden) si no es admin o falta el segundo factor, y network
 */
export async function saveModelSettings(
  cloud: Tables,
  patch: ModelSettingsPatch,
  onForbidden?: ForbiddenHandler,
): Promise<ModelSettings> {
  const current = await readModelSettingsDocument(cloud);
  const next = mergeModelSettings(current.raw, patch);
  assertAccepted(next, patch);
  let reply: { error: { code?: string } | null };
  try {
    reply = await cloud.from('platform_settings').upsert({
      key: MODEL_SETTINGS_KEY,
      value: next,
      updated_at: new Date().toISOString(),
    });
  } catch {
    throw new EditorialError('network');
  }
  if (reply.error) {
    const code = editorialCodeOf(reply.error.code);
    if (code === 'forbidden') onForbidden?.();
    throw new EditorialError(code);
  }
  return readModelSettings(next);
}

/** Enciende o apaga la calibración nocturna y elige entre Solo reporte y Publicar */
export function saveCalibrationControl(
  cloud: Tables,
  control: { enabled: boolean; mode: ModelSettings['calibration']['mode'] },
  onForbidden?: ForbiddenHandler,
): Promise<ModelSettings> {
  return saveModelSettings(cloud, { calibration: control }, onForbidden);
}
