// Modelo en memoria de lo que B14 publica, para el Supabase simulado de Playwright (B14, Paso 0, 8.4 del
// plan de B14). Es el único modelo. fakeModel.ts (paquete B, comparación, población y calibración del
// catálogo) y fakeCalibrationAdmin.ts (paquete C, corridas y acuerdo) solo lo leen y lo cambian con sus
// funciones exportadas, y fakeSupabase.ts los engancha con attachModel. Imita las tablas de
// supabase/migrations/20261028000001 a 20261028000003 con las formas JSON de
// src/data/model/contracts.ts.
//
// La calibración nocturna no corre en las e2e. Estas siembras dejan los números ya publicados, como
// los dejaría calibration_finish en modo apply. Todo es simulado y nunca se mezcla con datos reales.
import type {
  AdminCalibrationRuns,
  AgreementHistory,
  AgreementNight,
  CalibrationRunSummary,
  CalibrationState,
  CatalogCalibration,
  ComparisonCell,
  ComparisonCohort,
  ComparisonMetric,
  ComparisonSnapshot,
  PopulationBaselines,
} from '@/data/model/contracts';
import { distributionCuts } from '@/engines/comparison';
import type { FakeBankStore } from './fakeBankStore';

/** Las funciones rpc del modelo que fakeSupabase.ts manda a attachModel (1.8 del plan de B14) */
export const MODEL_STUDENT_RPCS = ['comparison_snapshot', 'population_baselines'] as const;
export const MODEL_TEAM_RPCS = ['editor_agreement_history', 'admin_calibration_runs'] as const;
export type ModelStudentRpc = (typeof MODEL_STUDENT_RPCS)[number];
export type ModelTeamRpc = (typeof MODEL_TEAM_RPCS)[number];
export type ModelRpc = ModelStudentRpc | ModelTeamRpc;

const MODEL_RPC_SET: ReadonlySet<string> = new Set<string>([
  ...MODEL_STUDENT_RPCS,
  ...MODEL_TEAM_RPCS,
]);
export const isModelRpc = (name: string): name is ModelRpc => MODEL_RPC_SET.has(name);

// ===================================================================== Tablas

/** Una fila de comparison_cells. cuts es null mientras la celda tiene menos de minGroupSize alumnos */
export interface FakeComparisonCell {
  cohort: ComparisonCohort;
  /** * para Todos, o la clave de la especialidad */
  cohortKey: string;
  metric: ComparisonMetric;
  /** La rama de la taxonomía, o * para el total */
  branch: string;
  students: number;
  cuts: number[] | null;
}

/** La corrida cuyos resultados leen los alumnos (model_publication) */
export interface FakePublication {
  runId: string;
  at: string;
  studyDay: string;
}

export interface FakeModelSettings {
  calibration: { enabled: boolean; mode: 'dry_run' | 'apply'; minNoticeVersion: string };
  features: { comparison: boolean; adaptive: boolean };
  minGroupSize: number;
  windowDays: number;
}

export interface FakeModelStore {
  settings: FakeModelSettings;
  /** null mientras no se haya aplicado ninguna corrida. Sin publicación los alumnos ven calibrando */
  publication: FakePublication | null;
  cells: FakeComparisonCell[];
  /** La línea base de la población que devuelve population_baselines */
  population: PopulationBaselines;
  /** La calibración que viaja en catalog_changes, por id estable de la pregunta */
  calibration: Map<string, CatalogCalibration>;
  runs: CalibrationRunSummary[];
  /** El historial de Acuerdo, una línea por noche */
  agreement: AgreementNight[];
  /** Cuántas versiones aprobadas hay por estado, para la vista general del admin */
  itemCounts: Record<CalibrationState, number>;
  /** La especialidad objetivo de cada cuenta por su id. Sin entrada es que no eligió */
  specialties: Map<string, string | null>;
  /** Hora simulada en milisegundos */
  now: () => number;
}

export function emptyPopulation(): PopulationBaselines {
  return {
    available: false,
    runAt: null,
    bias: {},
    motives: {},
    topics: {},
    indicators: {},
    fatigue: { state: 'calibrating', students: 0, longSessions: 0 },
  };
}

/** comparison_snapshot sin publicación o con la comparación apagada. Sin celdas, available false */
export function emptyComparisonSnapshot(store: FakeModelStore): ComparisonSnapshot {
  return {
    available: false,
    runAt: null,
    studyDay: null,
    windowDays: store.settings.windowDays,
    minGroupSize: store.settings.minGroupSize,
    specialty: null,
    cells: [],
  };
}

/** admin_calibration_runs sin una sola corrida */
export function emptyAdminRuns(): AdminCalibrationRuns {
  return {
    lastOkAt: null,
    publication: null,
    settings: {},
    runs: [],
    overview: {
      items: { physician_estimate: 0, provisional: 0, calibrated: 0 },
      hardestTopics: [],
      motives: {},
      fatigue: { state: 'calibrating', students: 0, longSessions: 0 },
      agreement: null,
    },
  };
}

/** editor_agreement_history sin una sola noche */
export function emptyAgreementHistory(): AgreementHistory {
  return { nights: [] };
}

export function createFakeModelStore(options: { now?: () => number } = {}): FakeModelStore {
  return {
    settings: {
      calibration: { enabled: false, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
      features: { comparison: true, adaptive: true },
      minGroupSize: 30,
      windowDays: 30,
    },
    publication: null,
    cells: [],
    population: emptyPopulation(),
    calibration: new Map(),
    runs: [],
    agreement: [],
    itemCounts: { physician_estimate: 0, provisional: 0, calibrated: 0 },
    specialties: new Map(),
    now: options.now ?? (() => Date.now()),
  };
}

// ===================================================================== Siembras de ayuda

const DAY_MS = 86_400_000;
const MERIDA_OFFSET_MS = -6 * 3_600_000;

/** El día de estudio de un instante, con corte a las 4 a. m. de Mérida, como study_day() */
export function studyDayAt(ms: number): string {
  return new Date(ms + MERIDA_OFFSET_MS - 4 * 3_600_000).toISOString().slice(0, 10);
}

const BRANCHES = ['internal_medicine', 'pediatrics', 'obstetrics_gynecology', 'general_surgery'];

/** Valores repartidos parejo, para armar cortes que se puedan revisar a ojo */
function spread(metric: ComparisonMetric, students: number, shift: number): number[] {
  return Array.from({ length: Math.max(students, 1) }, (_, index) => {
    const unit = (index + 0.5) / Math.max(students, 1);
    switch (metric) {
      case 'sim_accuracy':
        return Math.round((0.3 + 0.1 * shift + 0.6 * unit) * 100) / 100;
      case 'reviews':
        return Math.round(40 * shift + 600 * unit);
      case 'consistency':
        return Math.round(30 * unit);
    }
  });
}

export interface SeedComparisonOptions {
  /** Alumnos con datos en cada celda de Todos. Con menos de 30, las celdas quedan calibrando */
  students: number;
  /** Alumnos en cada celda de la especialidad. students si falta */
  specialtyStudents?: number;
  /** La especialidad de las celdas de especialidad. general_surgery si falta */
  specialty?: string;
  branches?: readonly string[];
}

/**
 * Publica una foto de comparación, como la dejaría calibration_finish en modo apply. Cada celda lleva sus
 * 19 cortes si tiene minGroupSize alumnos o más y null si no. Reemplaza las celdas que había
 */
export function seedComparison(store: FakeModelStore, options: SeedComparisonOptions): void {
  const specialty = options.specialty ?? 'general_surgery';
  const groups: { cohort: ComparisonCohort; key: string; students: number }[] = [
    { cohort: 'all', key: '*', students: options.students },
    {
      cohort: 'specialty',
      key: specialty,
      students: options.specialtyStudents ?? options.students,
    },
  ];
  const branches = options.branches ?? BRANCHES;
  const cells: FakeComparisonCell[] = [];
  for (const group of groups) {
    const specs: { metric: ComparisonMetric; branch: string }[] = [
      ...branches.map((branch) => ({ metric: 'sim_accuracy' as const, branch })),
      { metric: 'sim_accuracy', branch: '*' },
      { metric: 'reviews', branch: '*' },
      { metric: 'consistency', branch: '*' },
    ];
    specs.forEach((spec, index) => {
      cells.push({
        cohort: group.cohort,
        cohortKey: group.key,
        metric: spec.metric,
        branch: spec.branch,
        students: group.students,
        cuts:
          group.students >= store.settings.minGroupSize
            ? distributionCuts(spread(spec.metric, group.students, index % 3), spec.metric)
            : null,
      });
    });
  }
  store.cells = cells;
  const at = new Date(store.now() - 3_600_000).toISOString();
  store.publication = {
    runId: store.publication?.runId ?? '0e000000-0000-4000-8000-000000000001',
    at,
    studyDay: studyDayAt(store.now()),
  };
}

/** La celda como la entrega comparison_snapshot, con su estado */
export function cellOf(store: FakeModelStore, cell: FakeComparisonCell): ComparisonCell {
  const ready = cell.cuts !== null && cell.students >= store.settings.minGroupSize;
  return {
    cohort: cell.cohort,
    metric: cell.metric,
    branch: cell.branch,
    students: cell.students,
    state: ready ? 'ready' : 'calibrating',
    cuts: ready ? cell.cuts : null,
  };
}

export interface SeedCalibrationOptions {
  /** Estado de las preguntas sembradas. calibrated si falta */
  state?: Exclude<CalibrationState, 'physician_estimate'>;
}

/**
 * Deja calibradas las primeras count preguntas publicadas del banco simulado, con dificultades repartidas
 * de -2 a 2 logits, y sube el seq de su fila del catálogo, como calibration_finish, para que la app las
 * baje. Reemplaza lo que había. Devuelve cuántas dejó
 */
export function seedCalibration(
  store: FakeModelStore,
  bank: FakeBankStore,
  count: number,
  options: SeedCalibrationOptions = {},
): number {
  const state = options.state ?? 'calibrated';
  const published = [...bank.catalog.values()]
    .filter((row) => row.status === 'published')
    .sort((a, b) => a.seq - b.seq || a.questionId.localeCompare(b.questionId));
  store.calibration.clear();
  const studyDay = studyDayAt(store.now());
  const chosen = published.slice(0, Math.max(0, count));
  chosen.forEach((row, index) => {
    const difficulty = Math.round((-2 + (4 * index) / Math.max(chosen.length - 1, 1)) * 100) / 100;
    store.calibration.set(row.questionId, {
      versionId: row.versionId,
      state,
      difficulty,
      se: state === 'calibrated' ? 0.2 : 0.4,
      students: state === 'calibrated' ? 120 : 45,
      elo: Math.round((difficulty + 0.05) * 100) / 100,
      extreme: false,
      studyDay,
    });
    bank.seq += 1;
    bank.catalog.set(row.questionId, { ...row, seq: bank.seq });
  });
  store.itemCounts = {
    physician_estimate: Math.max(published.length - chosen.length, 0),
    provisional: state === 'provisional' ? chosen.length : 0,
    calibrated: state === 'calibrated' ? chosen.length : 0,
  };
  return chosen.length;
}

export interface SeedRunsOptions {
  /** Horas desde que terminó la última corrida buena. 3 si falta. Con más de 48 la pantalla avisa */
  lastOkHoursAgo?: number;
  /** Cuántas corridas buenas sembrar. 5 si falta */
  count?: number;
  /** El modo de las corridas. dry_run si falta */
  mode?: 'dry_run' | 'apply';
  /** El kappa de la noche coincide con el de la base. true si falta */
  parity?: boolean;
}

/**
 * Siembra el historial de corridas y de acuerdo, una por noche hacia atrás desde la última buena. Con
 * mode apply deja también la publicación, como lo haría calibration_finish
 */
export function seedRuns(store: FakeModelStore, options: SeedRunsOptions = {}): void {
  const count = options.count ?? 5;
  const mode = options.mode ?? 'dry_run';
  const lastOk = store.now() - (options.lastOkHoursAgo ?? 3) * 3_600_000;
  const runs: CalibrationRunSummary[] = [];
  const agreement: AgreementNight[] = [];
  for (let index = 0; index < count; index += 1) {
    const finishedMs = lastOk - index * DAY_MS;
    const startedMs = finishedMs - 4 * 60_000;
    const studyDay = studyDayAt(startedMs);
    const id = `0e000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const parity = index === 0 ? (options.parity ?? true) : true;
    runs.push({
      id,
      trigger: 'schedule',
      mode,
      status: parity ? 'ok' : 'partial',
      reason: parity ? null : 'kappa_mismatch',
      startedAt: new Date(startedMs).toISOString(),
      finishedAt: new Date(finishedMs).toISOString(),
      runner: { runId: String(9_000_000 + count - index) },
      counts: { consenters: 412, items: 300, cellsReady: 18, cellsCalibrating: 6 },
    });
    agreement.push({
      studyDay,
      at: new Date(finishedMs).toISOString(),
      pairs: 60 - index,
      kappa: 0.52,
      observed: 0.7,
      expected: 0.38,
      parity,
    });
  }
  store.runs = runs;
  store.agreement = agreement;
  if (mode === 'apply' && runs[0]) {
    store.publication = {
      runId: runs[0].id,
      at: runs[0].finishedAt ?? new Date(lastOk).toISOString(),
      studyDay: studyDayAt(lastOk),
    };
  }
}
