// Lo que el alumno lee del modelo en el Supabase simulado (B14, paquete B, 8.4 del plan de B14).
// comparison_snapshot y population_baselines con las reglas de 20261028000003_model_reads.sql, la
// calibración dentro de catalog_changes y la clave model_settings de platform_settings. Todo sale del
// modelo en memoria de fakeModelStore.ts, que es el único, y fakeSupabase.ts solo engancha estas funciones.
//
// Lo que imita de la base
//   - comparison_snapshot devuelve solo las celdas de Todos y las de la especialidad de quien pregunta,
//     de la corrida publicada. Los cortes salen solo donde hay minGroupSize alumnos o más, que nunca baja de
//     30. Sin publicación, o con la comparación apagada, dice available false
//   - population_baselines quita al leer todo dato con menos de 30 alumnos, aunque la corrida lo haya
//     guardado
//   - catalog_changes trae calibration en cada fila, null mientras la pregunta no se calibra
//
// Todo es simulado y nunca se mezcla con datos reales.
import { MIN_PRIVACY_GROUP } from '@/config/modelSettings';
import type {
  CatalogCalibration,
  ComparisonSnapshot,
  PopulationBaselines,
} from '@/data/model/contracts';
import type { FakeBankReply } from './fakeBankStore';
import {
  cellOf,
  emptyComparisonSnapshot,
  emptyPopulation,
  type FakeModelStore,
} from './fakeModelStore';

/**
 * La especialidad de quien pregunta como la lee la base. Sin elegir, o con undecided, es null. La siembra
 * del modelo (store.specialties) manda sobre la fila de la cuenta, para que una prueba no tenga que pasar
 * por el formulario de la cuenta
 */
export function specialtyOfCaller(
  store: FakeModelStore,
  userId: string,
  accountSpecialty: string | null,
): string | null {
  const chosen = store.specialties.has(userId)
    ? (store.specialties.get(userId) ?? null)
    : accountSpecialty;
  return chosen === null || chosen === 'undecided' ? null : chosen;
}

/** comparison_snapshot. La foto de la última corrida aplicada, solo con lo que le toca a quien pregunta */
export function comparisonSnapshotFor(
  store: FakeModelStore,
  specialty: string | null,
): ComparisonSnapshot {
  // minGroupSize nunca baja de 30, aunque el admin escriba menos (la base lo hace cumplir)
  const minGroupSize = Math.max(store.settings.minGroupSize, MIN_PRIVACY_GROUP);
  const base: ComparisonSnapshot = { ...emptyComparisonSnapshot(store), minGroupSize, specialty };
  const { publication } = store;
  if (!publication || !store.settings.features.comparison) return base;
  const clamped: FakeModelStore = { ...store, settings: { ...store.settings, minGroupSize } };
  const cells = store.cells
    .filter((cell) => cell.cohort === 'all' || (specialty !== null && cell.cohortKey === specialty))
    .sort(
      (a, b) =>
        a.cohort.localeCompare(b.cohort) ||
        a.metric.localeCompare(b.metric) ||
        Number(a.branch !== '*') - Number(b.branch !== '*') ||
        a.branch.localeCompare(b.branch),
    )
    .map((cell) => cellOf(clamped, cell));
  return {
    ...base,
    available: true,
    runAt: publication.at,
    studyDay: publication.studyDay,
    cells,
  };
}

/** population_baselines. Lo que dejó la noche, sin ningún dato de menos de 30 alumnos */
export function populationBaselinesFor(store: FakeModelStore): PopulationBaselines {
  const { population, publication } = store;
  if (!publication || !population.available) return emptyPopulation();
  const keep = <T>(entries: Record<string, T>, enough: (value: T) => boolean) =>
    Object.fromEntries(Object.entries(entries).filter(([, value]) => enough(value)));
  return {
    ...population,
    runAt: population.runAt ?? publication.at,
    bias: keep(population.bias, (value) => value.students >= MIN_PRIVACY_GROUP),
    motives: keep(population.motives, (value) => (value.reports ?? 0) >= MIN_PRIVACY_GROUP),
    topics: keep(population.topics, (value) => value.students >= MIN_PRIVACY_GROUP),
    indicators: keep(population.indicators, (value) => value.students >= MIN_PRIVACY_GROUP),
  };
}

/** La calibración de una pregunta como la guarda question_catalog, o null si todavía no se calibra */
export function calibrationOfQuestion(
  store: FakeModelStore,
  questionId: string,
): CatalogCalibration | null {
  return store.calibration.get(questionId) ?? null;
}

/**
 * catalog_changes con la calibración en cada fila, como bank_catalog_json. Las respuestas que no traen
 * filas (el banco cerrado, un error) pasan sin cambio
 */
export function withCatalogCalibration(store: FakeModelStore, reply: FakeBankReply): FakeBankReply {
  if (!('json' in reply) || reply.status !== 200) return reply;
  const body = reply.json;
  if (typeof body !== 'object' || body === null || !('rows' in body) || !Array.isArray(body.rows)) {
    return reply;
  }
  const rows = (body.rows as Record<string, unknown>[]).map((row) => ({
    ...row,
    calibration:
      typeof row.questionId === 'string' ? calibrationOfQuestion(store, row.questionId) : null,
  }));
  return { ...reply, json: { ...body, rows } };
}

/**
 * El valor de la clave model_settings de platform_settings, con la forma de src/config/modelSettings.ts.
 * Solo lleva lo que el modelo en memoria sabe cambiar. Lo demás queda de fábrica en la app
 */
export function modelSettingsValue(store: FakeModelStore) {
  return {
    calibration: store.settings.calibration,
    features: store.settings.features,
    thresholds: {
      minGroupSize: store.settings.minGroupSize,
      comparisonWindowDays: store.settings.windowDays,
    },
  };
}
