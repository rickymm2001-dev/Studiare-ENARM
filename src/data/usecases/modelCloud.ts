// Baja lo que la noche publica para el alumno y lo guarda en el navegador (B14, 1.12 y 4.5 del plan de
// B14). La foto de comparación, la línea base de la población y los ajustes del modelo cambian una vez
// por noche, así que se piden una vez por día de estudio, la primera vez que la app se conecta ese día, y
// se guardan en bankState. Si lo que bajó todavía no es de la noche de hoy (abrió antes de que termine la
// corrida, que además puede atrasarse horas, o la calibración está apagada), se vuelve a pedir pasadas
// unas horas y no hasta mañana. Sin conexión o sin foto nueva se usa la última, y sin ninguna dice
// calibrando. Nada del alumno viaja al servidor. Las pantallas lo cargan en diferido.
import { FACTORY_MODEL_SETTINGS, type ModelSettings } from '@/config/modelSettings';
import { studyDayOf } from '@/engines/studyDay';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchComparisonSnapshot,
  fetchModelSettings,
  fetchPopulationBaselines,
  type ModelFailure,
} from '../cloud/model';
import type { DataApi } from '../context';
import type { ComparisonSnapshot, PopulationBaselines } from '../model/contracts';
import { DEFAULT_TIME_ZONE } from '../schemas/common';

type Api = Pick<DataApi, 'repos'>;
type Cloud = Pick<SupabaseClient, 'rpc' | 'from'>;

/** Lo último que bajó de cada cosa. null mientras no ha bajado nada de eso */
export interface StoredModel {
  comparison: ComparisonSnapshot | null;
  population: PopulationBaselines | null;
  /** Los ajustes del modelo, de fábrica mientras no han bajado */
  settings: ModelSettings;
}

export async function readStoredModel(api: Api): Promise<StoredModel> {
  const [comparison, population, settings] = await Promise.all([
    api.repos.bankState.get('comparison'),
    api.repos.bankState.get('population'),
    api.repos.bankState.get('model_settings'),
  ]);
  return {
    comparison: comparison?.snapshot ?? null,
    population: population?.baselines ?? null,
    settings: settings?.settings ?? FACTORY_MODEL_SETTINGS,
  };
}

export type ModelRefresh =
  /** Ya se bajó hoy y no hizo falta pedir nada */
  | { status: 'fresh' }
  /** Bajó al menos una de las tres cosas y se guardó */
  | { status: 'updated'; failed: ModelFailure[] }
  /** No bajó ninguna. Se queda con lo último que hubiera */
  | { status: 'failed'; failure: ModelFailure };

/**
 * Cuánto esperar para volver a pedir una foto que bajó hoy y todavía no es de la noche de hoy. Alcanza para
 * no preguntar en cada conexión cuando la calibración está apagada y para recoger la corrida de las 4:23
 * aunque se atrase unas horas (revisión de B14, hallazgo 12)
 */
export const RECHECK_AFTER_MS = 3 * 3_600_000;

export interface ModelRefreshOptions {
  now?: Date;
  /** Pide aunque ya se haya bajado hoy */
  force?: boolean;
}

/**
 * Pone al día lo que publica la noche si todavía no se ha bajado hoy. El día de estudio es el del servidor,
 * con corte a las 4 a. m. de Mérida. Cada cosa se guarda por su cuenta, así que si una falla las otras
 * quedan guardadas y la que falló se vuelve a pedir en la siguiente conexión
 */
export async function ensureModelSnapshots(
  api: Api,
  cloud: Cloud,
  options: ModelRefreshOptions = {},
): Promise<ModelRefresh> {
  const now = options.now ?? new Date();
  const today = studyDayOf(now, DEFAULT_TIME_ZONE);
  const at = now.toISOString();
  const { repos } = api;
  const [comparison, population, settings] = await Promise.all([
    repos.bankState.get('comparison'),
    repos.bankState.get('population'),
    repos.bankState.get('model_settings'),
  ]);
  const stale = (
    state: { fetchedDay: string; at: string } | undefined,
    publishedToday: boolean,
  ) => {
    if (options.force === true || state?.fetchedDay !== today) return true;
    // Bajó hoy. Si es de la noche de hoy ya está. Si no, se vuelve a pedir pasadas unas horas
    return !publishedToday && !(now.getTime() - Date.parse(state.at) < RECHECK_AFTER_MS);
  };
  const needs = {
    comparison: stale(
      comparison,
      comparison?.snapshot.available === true && comparison.snapshot.studyDay === today,
    ),
    population: stale(
      population,
      population?.baselines.available === true &&
        population.baselines.runAt !== null &&
        studyDayOf(new Date(population.baselines.runAt), DEFAULT_TIME_ZONE) === today,
    ),
    // Los ajustes no dependen de la noche
    settings: stale(settings, true),
  };
  if (!needs.comparison && !needs.population && !needs.settings) return { status: 'fresh' };

  const failures: ModelFailure[] = [];
  let saved = 0;
  await Promise.all([
    needs.comparison &&
      fetchComparisonSnapshot(cloud).then(async (reply) => {
        if (!reply.ok) {
          failures.push(reply.reason);
          return;
        }
        await repos.bankState.put({
          key: 'comparison',
          snapshot: reply.value,
          fetchedDay: today,
          at,
        });
        saved += 1;
      }),
    needs.population &&
      fetchPopulationBaselines(cloud).then(async (reply) => {
        if (!reply.ok) {
          failures.push(reply.reason);
          return;
        }
        await repos.bankState.put({
          key: 'population',
          baselines: reply.value,
          fetchedDay: today,
          at,
        });
        saved += 1;
      }),
    needs.settings &&
      fetchModelSettings(cloud).then(async (reply) => {
        if (!reply.ok) {
          failures.push(reply.reason);
          return;
        }
        await repos.bankState.put({
          key: 'model_settings',
          settings: reply.value,
          fetchedDay: today,
          at,
        });
        saved += 1;
      }),
  ]);
  if (saved === 0) return { status: 'failed', failure: failures[0] ?? 'unknown' };
  return { status: 'updated', failed: failures };
}
