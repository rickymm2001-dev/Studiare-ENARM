// Lo que la demostración enseña de la comparación y de la población (B14, 4.7 y 10.38 del plan de B14). La
// demo no tiene nube ni calibración nocturna: su línea base y su comparación salen de una cohorte chica de
// alumnos simulados, con la etiqueta de datos simulados. Los calcula el worker de simulación con los mismos
// motores de la noche (src/demo/generator/snapshots.ts), tarda unos segundos, y el resultado se guarda en
// este navegador porque la misma semilla da siempre lo mismo. La foto se arma para la especialidad que el
// alumno de la demo eligió en Tus datos. Producción nunca usa esto, porque vive en otra base.
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { ComparisonSnapshot, PopulationBaselines } from '@/data/model/contracts';
import type { Repositories } from '@/data/repos/types';
import { DEMO_SNAPSHOT_STUDENTS } from '@/demo/constants';
import type { DemoSnapshotData, DemoSnapshotRequest } from '@/demo/generator/snapshots';
import { PopulationBaselinesSchema } from './modelSchemas';

export interface DemoSnapshots {
  comparison: ComparisonSnapshot;
  population: PopulationBaselines;
}

/** Días simulados que bastan para la ventana de la comparación */
const SNAPSHOT_DAYS = 31;
const CACHE_KEY = 'studiare.demoSnapshots.v1';
/** La hora de la corrida que se muestra, la de la noche programada (10:23 UTC) */
const RUN_TIME = 'T10:23:00.000Z';

// ===================================================================== Lo que se guarda

const CellSchema = z.object({
  cohort: z.enum(['all', 'specialty']),
  key: z.string().min(1),
  metric: z.enum(['sim_accuracy', 'reviews', 'consistency']),
  branch: z.string().min(1),
  students: z.number().int().min(0),
  cuts: z.array(z.number()).length(19).nullable(),
});

const DataSchema = z.object({
  asOfDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  students: z.number().int().min(1),
  comparison: z.array(CellSchema),
  population: PopulationBaselinesSchema.pick({
    bias: true,
    motives: true,
    topics: true,
    indicators: true,
    fatigue: true,
  }).extend({ items: z.record(z.string(), z.number()) }),
});

/** Cómo se sembró la demostración. Lo guarda la siembra en la verdad del alumno de la demo */
const SeedOptionsSchema = z.object({
  seed: z.string().min(1),
  endDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cohortSize: z.number().int().min(1),
  cohortDays: z.number().int().min(1),
});

export async function readDemoRequest(
  repos: Pick<Repositories, 'simTruth'>,
): Promise<DemoSnapshotRequest | null> {
  const truths = (await repos.simTruth?.list()) ?? [];
  for (const truth of truths) {
    const options = SeedOptionsSchema.safeParse(truth.params.seedOptions);
    if (!options.success) continue;
    return {
      seed: options.data.seed,
      size: Math.min(options.data.cohortSize, DEMO_SNAPSHOT_STUDENTS),
      days: Math.min(options.data.cohortDays, SNAPSHOT_DAYS),
      endDay: options.data.endDay,
    };
  }
  return null;
}

// ===================================================================== De las celdas a las fotos

/** Lo que publicaría la noche, para el alumno de la demo y la especialidad que eligió. null si no eligió */
export function snapshotsFrom(data: DemoSnapshotData, specialty: string | null): DemoSnapshots {
  const { thresholds } = FACTORY_MODEL_SETTINGS;
  const runAt = `${data.asOfDay}${RUN_TIME}`;
  return {
    comparison: {
      available: true,
      runAt,
      studyDay: data.asOfDay,
      windowDays: thresholds.comparisonWindowDays,
      minGroupSize: thresholds.minGroupSize,
      specialty,
      // Solo Todos y la especialidad de quien pregunta, como comparison_snapshot
      cells: data.comparison
        .filter((cell) => cell.cohort === 'all' || (specialty !== null && cell.key === specialty))
        .map((cell) => {
          const ready = cell.cuts !== null && cell.students >= thresholds.minGroupSize;
          return {
            cohort: cell.cohort,
            metric: cell.metric,
            branch: cell.branch,
            students: cell.students,
            state: ready ? ('ready' as const) : ('calibrating' as const),
            cuts: ready ? cell.cuts : null,
          };
        }),
    },
    population: {
      available: true,
      runAt,
      bias: data.population.bias,
      motives: data.population.motives,
      topics: data.population.topics,
      indicators: data.population.indicators,
      fatigue: data.population.fatigue,
    },
  };
}

// ===================================================================== Cálculo y caché

type Runner = (request: DemoSnapshotRequest) => Promise<DemoSnapshotData>;

/** El worker de simulación, que se baja solo cuando la demostración lo necesita */
const runInWorker: Runner = async (request) => {
  const { simulateWorker } = await import('@/workers/simulateClient');
  return simulateWorker().buildSnapshots(request);
};

function readCache(requestKey: string): DemoSnapshotData | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    const parsed = z.object({ key: z.string(), data: DataSchema }).safeParse(stored);
    return parsed.success && parsed.data.key === requestKey ? parsed.data.data : null;
  } catch {
    return null;
  }
}

function writeCache(requestKey: string, data: DemoSnapshotData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key: requestKey, data }));
  } catch {
    // Sin almacenamiento se vuelve a calcular la próxima vez
  }
}

/** Una sola corrida a la vez por demostración, aunque dos partes de la pantalla la pidan juntas */
const inFlight = new Map<string, Promise<DemoSnapshotData | null>>();

/**
 * Los números de la cohorte simulada de esta demostración. Los lee del navegador si ya se calcularon con
 * esta semilla y, si no, los calcula con run (el worker) y los guarda. null si la demostración no está
 * sembrada o no se pudo calcular
 */
export function loadDemoSnapshotData(
  repos: Pick<Repositories, 'simTruth'>,
  run: Runner = runInWorker,
): Promise<DemoSnapshotData | null> {
  return readDemoRequest(repos).then((request) => {
    if (request === null) return null;
    const key = JSON.stringify(request);
    const cached = readCache(key);
    if (cached) return cached;
    const running = inFlight.get(key);
    if (running) return running;
    const started = run(request)
      .then((data) => {
        writeCache(key, data);
        return data;
      })
      .catch(() => null)
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, started);
    return started;
  });
}

/**
 * La comparación y la población de la demostración. undefined mientras se calculan, null si no hay. Con
 * enabled en false no hace nada, así la base real nunca pide los simulados
 */
export function useDemoSnapshots(
  enabled: boolean,
  userId: string,
): DemoSnapshots | null | undefined {
  const api = useDataApi();
  const [data, setData] = useState<DemoSnapshotData | null>();
  const specialty = useLiveData(
    async () => (await api.repos.accounts.get(userId))?.targetSpecialty ?? null,
    [api.repos, userId],
  );
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadDemoSnapshotData(api.repos).then((loaded) => {
      if (alive) setData(loaded);
    });
    return () => {
      alive = false;
    };
  }, [enabled, api.repos]);
  return useMemo(() => {
    if (!enabled) return null;
    if (data === undefined || specialty === undefined) return undefined;
    return data === null ? null : snapshotsFrom(data, specialty);
  }, [enabled, data, specialty]);
}
