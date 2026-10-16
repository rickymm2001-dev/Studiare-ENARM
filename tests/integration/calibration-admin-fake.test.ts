// La app contra las funciones del equipo del Supabase simulado de Playwright (B14, paquete C). Comprueba sin
// navegador que readCalibrationRuns y readAgreementHistory entienden lo que devuelven adminCalibrationRunsFor
// y agreementHistoryFor de tests/e2e/support/fakeCalibrationAdmin.ts, que imitan admin_calibration_runs y
// editor_agreement_history de 20261028000003. Así una diferencia de formato entre la app y el doble falla
// aquí y no en el navegador.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { readModelSettings } from '@/config/modelSettings';
import { readAgreementHistory, readCalibrationRuns } from '@/data/cloud/calibrationAdmin';
import { calibrationHealth } from '@/features/admin/calibrationView';
import {
  adminCalibrationRunsFor,
  agreementHistoryFor,
  applySavedSettings,
  modelSettingsJson,
} from '../e2e/support/fakeCalibrationAdmin';
import {
  createFakeModelStore,
  emptyPopulation,
  seedRuns,
  type FakeModelStore,
} from '../e2e/support/fakeModelStore';

/** Un cliente que contesta con el doble, como lo haría la base */
function clientOf(store: FakeModelStore): Pick<SupabaseClient, 'rpc'> {
  return {
    rpc: (name: string, args?: { p_limit?: number }) => {
      const data =
        name === 'admin_calibration_runs'
          ? adminCalibrationRunsFor(store, args?.p_limit)
          : name === 'editor_agreement_history'
            ? agreementHistoryFor(store, args?.p_limit)
            : null;
      return Promise.resolve({ data, error: null });
    },
  } as unknown as Pick<SupabaseClient, 'rpc'>;
}

describe('admin_calibration_runs del doble', () => {
  it('sin ninguna corrida la app lo entiende vacío', async () => {
    const store = createFakeModelStore();
    const result = await readCalibrationRuns(clientOf(store));
    expect(result.runs).toEqual([]);
    expect(result.lastOkAt).toBeNull();
    expect(result.publication).toBeNull();
    expect(result.overview.items).toEqual({ physician_estimate: 0, provisional: 0, calibrated: 0 });
    expect(result.overview.fatigue.state).toBe('calibrating');
    expect(result.overview.agreement).toBeNull();
    expect(result.settings.calibration.enabled).toBe(false);
  });

  it('con corridas sembradas la app las lee todas, la más reciente primero, con su enlace de GitHub', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 5, lastOkHoursAgo: 3 });
    const result = await readCalibrationRuns(clientOf(store));
    expect(result.runs).toHaveLength(5);
    expect(result.runs.map((run) => run.githubRunId)).toEqual([
      '9000005',
      '9000004',
      '9000003',
      '9000002',
      '9000001',
    ]);
    expect(result.runs[0]).toMatchObject({ status: 'ok', mode: 'dry_run', trigger: 'schedule' });
    expect(result.runs[0]?.counts.consenters).toBe(412);
    expect(result.lastOkAt).toBe(result.runs[0]?.finishedAt);
    expect(result.overview.agreement).toEqual({ kappa: 0.52, parity: true });
    expect(calibrationHealth(result, new Date())).toMatchObject({ kind: 'fresh' });
  });

  it('con la última corrida buena de hace 60 horas la app avisa que pasó de 48', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 2, lastOkHoursAgo: 60 });
    const result = await readCalibrationRuns(clientOf(store));
    expect(calibrationHealth(result, new Date())).toMatchObject({ kind: 'stale' });
  });

  it('una paridad falsa deja la corrida en partial y se ve en el resumen', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 3, parity: false });
    const result = await readCalibrationRuns(clientOf(store));
    expect(result.runs[0]).toMatchObject({ status: 'partial', reason: 'kappa_mismatch' });
    expect(result.overview.agreement?.parity).toBe(false);
  });

  it('en modo apply deja la publicación', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 2, mode: 'apply' });
    const result = await readCalibrationRuns(clientOf(store));
    expect(result.publication).not.toBeNull();
    expect(result.publication?.runId).toBe(result.runs[0]?.id);
  });

  it('solo muestra los temas y las ramas con 30 alumnos o reportes', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 1 });
    store.population = {
      ...emptyPopulation(),
      available: true,
      topics: {
        'pediatrics/neonatology': { students: 96, accuracy: 0.58, difficulty: 0.3 },
        'internal_medicine/cardiology': { students: 29, accuracy: 0.2, difficulty: 0.9 },
      },
      motives: {
        pediatrics: { reports: 830, knowledge: 0.41 },
        general_surgery: { reports: 12, knowledge: 0.5 },
      },
    };
    const result = await readCalibrationRuns(clientOf(store));
    expect(result.overview.hardestTopics.map((topic) => topic.key)).toEqual([
      'pediatrics/neonatology',
    ]);
    expect(Object.keys(result.overview.motives)).toEqual(['pediatrics']);
  });
});

describe('editor_agreement_history del doble', () => {
  it('lo que siembra seedRuns lo lee la app, la noche más reciente primero', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 4, parity: false });
    const nights = await readAgreementHistory(clientOf(store));
    expect(nights).toHaveLength(4);
    expect(nights.map((night) => night.studyDay)).toEqual(
      [...nights.map((night) => night.studyDay)].sort().reverse(),
    );
    expect(nights[0]?.parity).toBe(false);
    expect(nights[1]?.parity).toBe(true);
  });

  it('respeta el límite que pide la app', async () => {
    const store = createFakeModelStore();
    seedRuns(store, { count: 5 });
    expect(await readAgreementHistory(clientOf(store), undefined, 2)).toHaveLength(2);
  });
});

describe('model_settings del doble', () => {
  it('lo que publica lo lee la app con el esquema de siempre, con minGroupSize en 30', () => {
    const store = createFakeModelStore();
    store.settings.minGroupSize = 10;
    const read = readModelSettings(modelSettingsJson(store));
    expect(read.thresholds.minGroupSize).toBe(30);
    expect(read.calibration.minNoticeVersion).toBe('2026-10-15b');
  });

  it('lo que guarda el admin se refleja en el modelo en memoria, sin bajar de 30', () => {
    const store = createFakeModelStore();
    applySavedSettings(store, {
      calibration: { enabled: true, mode: 'apply' },
      features: { comparison: false },
      thresholds: { minGroupSize: 12, comparisonWindowDays: 45 },
    });
    expect(store.settings.calibration).toMatchObject({ enabled: true, mode: 'apply' });
    expect(store.settings.features).toEqual({ comparison: false, adaptive: true });
    expect(store.settings.minGroupSize).toBe(30);
    expect(store.settings.windowDays).toBe(45);
    // Un valor que no entiende se ignora
    applySavedSettings(store, { calibration: { mode: 'raro', enabled: 'sí' } });
    expect(store.settings.calibration).toMatchObject({ enabled: true, mode: 'apply' });
  });
});
