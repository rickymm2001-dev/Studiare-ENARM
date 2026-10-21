// De dónde saca la app lo que publica la calibración nocturna: la foto de la comparación y la línea base de
// la población (B14, 5.3 y 1.12 del plan de B14). Con la nube las baja una vez por día de estudio
// src/data/usecases/modelCloud.ts (paquete B) y las deja en bankState con las llaves comparison y population.
// Aquí solo se leen, y cualquier fila que no cumpla el esquema se descarta y queda calibrando. La demostración
// no tiene nube: saca las dos de los alumnos simulados (demoSnapshots.ts) y lo dice con su etiqueta.
//
// Esta lectura es lo único de Progreso, Inicio, Simular y el Tutor que depende de cómo guarda B la fila.
// Acepta la foto en la propia fila o bajo snapshot, value o data, la población bajo baselines, population,
// value o data, y los ajustes del modelo (llave model_settings) bajo settings, value o data. Si B la guarda de
// otra forma, se cambia aquí y nada más.
import { useMemo } from 'react';
import type { ZodType } from 'zod';
import {
  FACTORY_MODEL_SETTINGS,
  readModelSettings,
  type ModelSettings,
} from '@/config/modelSettings';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { ComparisonSnapshot, PopulationBaselines } from '@/data/model/contracts';
import type { Repositories } from '@/data/repos/types';
import { useQuestionSourceKind } from '../shared/questionSourceKind';
import { useDemoSnapshots } from './demoSnapshots';
import { ComparisonSnapshotSchema, PopulationBaselinesSchema } from './modelSchemas';

export type SnapshotSource = 'cloud' | 'demo';

export type ComparisonState =
  | { status: 'loading' }
  /** no_cloud es sin la cuenta de la nube. no_snapshot es que la base todavía no publica o la apagó */
  | { status: 'unavailable'; reason: 'no_cloud' | 'no_snapshot' }
  | { status: 'ready'; snapshot: ComparisonSnapshot; source: SnapshotSource };

/** Dónde puede venir el dato en la fila de bankState, de la forma más probable a la menos */
const PAYLOAD_KEYS = {
  comparison: ['snapshot', 'comparison', 'value', 'data'],
  population: ['baselines', 'population', 'snapshot', 'value', 'data'],
} as const;

/** Lee una fila de bankState sin atarse a su forma. null si no existe o no cumple el esquema */
export async function readStoredSnapshot<T>(
  repos: Pick<Repositories, 'bankState'>,
  key: keyof typeof PAYLOAD_KEYS,
  schema: ZodType<T>,
): Promise<T | null> {
  // Las llaves comparison y population las suma el esquema de la nube de B14 (paquete B)
  const reader = repos.bankState as unknown as { get(key: string): Promise<unknown> };
  const row = await reader.get(key);
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  for (const name of PAYLOAD_KEYS[key]) {
    const parsed = schema.safeParse(record[name]);
    if (parsed.success) return parsed.data;
  }
  const whole = schema.safeParse(record);
  return whole.success ? whole.data : null;
}

/**
 * Los ajustes del modelo que bajó la app, o null si todavía no bajaron. Un valor que no se entiende queda de
 * fábrica campo por campo (readModelSettings), así que aquí solo se distingue que haya fila con ajustes
 */
export async function readStoredSettings(
  repos: Pick<Repositories, 'bankState'>,
): Promise<ModelSettings | null> {
  const reader = repos.bankState as unknown as { get(key: string): Promise<unknown> };
  const row = await reader.get('model_settings');
  if (typeof row !== 'object' || row === null) return null;
  const record = row as Record<string, unknown>;
  for (const name of ['settings', 'value', 'data'] as const) {
    const candidate = record[name];
    if (typeof candidate === 'object' && candidate !== null) return readModelSettings(candidate);
  }
  return null;
}

/**
 * Los ajustes del modelo con los que decide la app (cuántas respuestas pide una rama, cuántos alumnos pide cada
 * dato de la población). Los que bajó de la nube y, mientras no han bajado o sin la nube, los de fábrica. La
 * demostración siempre usa los de fábrica, porque su cohorte se calcula con ellos
 */
export function useModelSettings(): ModelSettings {
  const api = useDataApi();
  const kind = useQuestionSourceKind();
  const isDemo = api.demo !== null;
  const stored = useLiveData(
    () => (kind === 'cloud' && !isDemo ? readStoredSettings(api.repos) : Promise.resolve(null)),
    [api.repos, kind, isDemo],
  );
  return stored ?? FACTORY_MODEL_SETTINGS;
}

/** La foto de la comparación que toca a este alumno, o por qué todavía no hay */
export function useComparisonSnapshot(userId: string): ComparisonState {
  const api = useDataApi();
  const kind = useQuestionSourceKind();
  const isDemo = api.demo !== null;
  const demo = useDemoSnapshots(isDemo, userId);
  const stored = useLiveData(
    () =>
      kind === 'cloud' && !isDemo
        ? readStoredSnapshot(api.repos, 'comparison', ComparisonSnapshotSchema)
        : Promise.resolve(null),
    [api.repos, kind, isDemo],
  );
  return useMemo((): ComparisonState => {
    if (isDemo) {
      if (demo === undefined) return { status: 'loading' };
      return demo === null
        ? { status: 'unavailable', reason: 'no_snapshot' }
        : { status: 'ready', snapshot: demo.comparison, source: 'demo' };
    }
    if (kind !== 'cloud') return { status: 'unavailable', reason: 'no_cloud' };
    if (stored === undefined) return { status: 'loading' };
    return stored?.available
      ? { status: 'ready', snapshot: stored, source: 'cloud' }
      : { status: 'unavailable', reason: 'no_snapshot' };
  }, [isDemo, demo, kind, stored]);
}

/**
 * La línea base de la población. null mientras llega, si no hay publicación o si no hay nube. No frena el
 * modelo: sin ella los sesgos se comparan contra el azar y el detector de fatiga sigue calibrando
 */
export function usePopulation(userId: string): PopulationBaselines | null {
  const api = useDataApi();
  const kind = useQuestionSourceKind();
  const isDemo = api.demo !== null;
  const demo = useDemoSnapshots(isDemo, userId);
  const stored = useLiveData(
    () =>
      kind === 'cloud' && !isDemo
        ? readStoredSnapshot(api.repos, 'population', PopulationBaselinesSchema)
        : Promise.resolve(null),
    [api.repos, kind, isDemo],
  );
  if (isDemo) return demo?.population ?? null;
  return stored?.available ? stored : null;
}
