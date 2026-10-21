// Lo que la noche publica para los alumnos y la configuración del modelo (B14, 1.8, 1.9 y 1.12 del plan de
// B14). Llamadas tipadas a comparison_snapshot y population_baselines (20261028000003_model_reads.sql)
// y a la clave model_settings de platform_settings. Ninguna lee una tabla del modelo, porque la base no
// lo permite. Cada respuesta se valida con zod, porque el servidor es un tercero, y un error se traduce a
// una causa con el mismo vocabulario del banco. Una celda de comparación que esta versión no entiende, por
// ejemplo de una métrica nueva, se descarta sin tirar la foto. Los nombres de las funciones viven en
// MODEL_RPC y una prueba revisa que existan en la migración. Al servidor no viaja nada del alumno.
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { MODEL_SETTINGS_KEY, readModelSettings, type ModelSettings } from '@/config/modelSettings';
import type { ComparisonCell, ComparisonSnapshot, PopulationBaselines } from '../model/contracts';
import { bankFailureOf, type BankFailure, type BankReply } from './bank';

type Rpc = Pick<SupabaseClient, 'rpc'>;
type Table = Pick<SupabaseClient, 'from'>;

/** Los nombres de las funciones de la base que usa la app. El servidor los define en 20261028000003 */
export const MODEL_RPC = {
  comparison: 'comparison_snapshot',
  population: 'population_baselines',
} as const;

export type ModelFailure = BankFailure;
export type ModelReply<T> = BankReply<T>;

/** Un instante del servidor en ISO UTC con milisegundos, como lo guarda la app */
const InstantSchema = z.string().transform((value, ctx) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    ctx.addIssue({ code: 'custom', message: 'Fecha inválida' });
    return z.NEVER;
  }
  return new Date(time).toISOString();
});

const DaySchema = z.iso.date();
const SpecialtySchema = z.string().regex(/^[a-z_]{2,48}$/);

const CellSchema = z.object({
  cohort: z.enum(['all', 'specialty']),
  metric: z.enum(['sim_accuracy', 'reviews', 'consistency']),
  branch: z.string().regex(/^(\*|[a-z_]{2,48})$/),
  students: z.number().int().min(0),
  state: z.enum(['ready', 'calibrating']),
  cuts: z.array(z.number()).nullable(),
});

const SnapshotWireSchema = z.object({
  available: z.boolean(),
  runAt: InstantSchema.nullish(),
  studyDay: DaySchema.nullish(),
  windowDays: z.number().int().min(1).max(366),
  minGroupSize: z.number().int().min(1),
  specialty: SpecialtySchema.nullish(),
  cells: z.array(z.unknown()).default([]),
});

/** 19 números finitos que no bajan, los cortes del percentil 5 al 95 */
function validCuts(cuts: readonly number[]): boolean {
  return (
    cuts.length === 19 &&
    cuts.every(
      (cut, index) => Number.isFinite(cut) && (index === 0 || cut >= (cuts[index - 1] ?? 0)),
    )
  );
}

/**
 * La celda como la usa la app, o null si no se entiende. Una celda lista sin cortes válidos pasa a
 * calibrando, porque con cortes rotos un percentil sería un número inventado
 */
function cellOf(raw: unknown): ComparisonCell | null {
  const parsed = CellSchema.safeParse(raw);
  if (!parsed.success) return null;
  const cell = parsed.data;
  const ready = cell.state === 'ready' && cell.cuts !== null && validCuts(cell.cuts);
  return {
    cohort: cell.cohort,
    metric: cell.metric,
    branch: cell.branch,
    students: cell.students,
    state: ready ? 'ready' : 'calibrating',
    cuts: ready ? cell.cuts : null,
  };
}

/** La foto de comparación de la noche, ya validada. null si la respuesta no tiene la forma esperada */
export function parseComparisonSnapshot(raw: unknown): ComparisonSnapshot | null {
  const parsed = SnapshotWireSchema.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const cells = wire.cells.flatMap((entry) => {
    const cell = cellOf(entry);
    return cell ? [cell] : [];
  });
  // Sin publicación no hay celdas que valgan, aunque el servidor mande alguna
  return {
    available: wire.available,
    runAt: wire.runAt ?? null,
    studyDay: wire.studyDay ?? null,
    windowDays: wire.windowDays,
    minGroupSize: wire.minGroupSize,
    specialty: wire.specialty ?? null,
    cells: wire.available ? cells : [],
  };
}

const RateSchema = z.object({ students: z.number().int().min(0), rate: z.number() });

const PopulationWireSchema = z.object({
  available: z.boolean(),
  runAt: InstantSchema.nullish(),
  bias: z.record(z.string(), RateSchema).default({}),
  motives: z.record(z.string(), z.record(z.string(), z.number())).default({}),
  topics: z
    .record(
      z.string(),
      z.object({
        students: z.number().int().min(0),
        accuracy: z.number(),
        difficulty: z.number().nullable().default(null),
      }),
    )
    .default({}),
  indicators: z.record(z.string(), RateSchema).default({}),
  fatigue: z
    .object({
      state: z.enum(['calibrating', 'validated', 'not_valid']),
      students: z.number().int().min(0),
      longSessions: z.number().int().min(0),
    })
    .default({ state: 'calibrating', students: 0, longSessions: 0 }),
});

/** La línea base de la población, ya validada. null si la respuesta no tiene la forma esperada */
export function parsePopulationBaselines(raw: unknown): PopulationBaselines | null {
  const parsed = PopulationWireSchema.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    available: wire.available,
    runAt: wire.runAt ?? null,
    bias: wire.bias,
    motives: wire.motives,
    topics: wire.topics,
    indicators: wire.indicators,
    fatigue: wire.fatigue,
  };
}

async function call<T>(
  cloud: Rpc,
  name: string,
  parse: (raw: unknown) => T | null,
): Promise<ModelReply<T>> {
  try {
    const reply = await cloud.rpc(name);
    if (reply.error) return { ok: false, reason: bankFailureOf(reply.error) };
    const value = parse(reply.data as unknown);
    return value === null ? { ok: false, reason: 'unknown' } : { ok: true, value };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** La foto de comparación de la noche. Solo Todos y la especialidad de quien pregunta */
export function fetchComparisonSnapshot(cloud: Rpc): Promise<ModelReply<ComparisonSnapshot>> {
  return call(cloud, MODEL_RPC.comparison, parseComparisonSnapshot);
}

/** La línea base de la población que dejó la noche */
export function fetchPopulationBaselines(cloud: Rpc): Promise<ModelReply<PopulationBaselines>> {
  return call(cloud, MODEL_RPC.population, parsePopulationBaselines);
}

/**
 * Los ajustes del modelo (1.5). Todos los leen, incluso sin sesión. Lo que falta o no se entiende queda de
 * fábrica campo por campo, y minGroupSize nunca baja de 30 (readModelSettings). Sin la clave, de fábrica
 */
export async function fetchModelSettings(cloud: Table): Promise<ModelReply<ModelSettings>> {
  try {
    const { data, error } = await cloud
      .from('platform_settings')
      .select('value')
      .eq('key', MODEL_SETTINGS_KEY)
      .maybeSingle();
    if (error) return { ok: false, reason: bankFailureOf(error) };
    const row = data as { value?: unknown } | null;
    return { ok: true, value: readModelSettings(row?.value) };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
