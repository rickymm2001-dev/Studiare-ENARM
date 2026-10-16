// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '../../config/modelSettings.ts';
import { EditorialError } from '../editorial/editorialRepo.ts';
import {
  CALIBRATION_ADMIN_RPC,
  CALIBRATION_WORKFLOW_URL,
  calibrationRunUrl,
  mergeModelSettings,
  readAgreementHistory,
  readCalibrationRuns,
  readModelSettingsDocument,
  saveCalibrationControl,
  saveModelSettings,
} from './calibrationAdmin.ts';

// ===================================================================== Con la migración

describe('funciones de la base', () => {
  const migration = readFileSync(
    new URL('../../../supabase/migrations/20261028000003_model_reads.sql', import.meta.url),
    'utf8',
  );

  it('las que llama la app existen en la migración con su parámetro p_limit', () => {
    for (const name of Object.values(CALIBRATION_ADMIN_RPC)) {
      expect(migration).toMatch(
        new RegExp(
          `create or replace function public\\.${name}\\(p_limit integer default \\d+\\) returns jsonb`,
        ),
      );
      expect(migration).toContain(
        `grant execute on function public.${name}(integer) to authenticated`,
      );
    }
  });
});

// ===================================================================== Un cliente falso

interface Call {
  name: string;
  args: unknown;
}

function fakeCloud(
  options: {
    rpc?: (name: string, args: unknown) => { data: unknown; error: { code: string } | null };
    row?: unknown;
    readError?: { code: string };
    writeError?: { code: string };
  } = {},
) {
  const calls: Call[] = [];
  const upserts: { key: string; value: unknown; updated_at: string }[] = [];
  const cloud = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(options.rpc?.(name, args) ?? { data: null, error: null });
    },
    from: (table: string) => {
      expect(table).toBe('platform_settings');
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: () =>
          Promise.resolve(
            options.readError
              ? { data: null, error: options.readError }
              : { data: options.row === undefined ? null : { value: options.row }, error: null },
          ),
        upsert: (row: { key: string; value: unknown; updated_at: string }) => {
          upserts.push(row);
          return Promise.resolve({ error: options.writeError ?? null });
        },
      };
      return query;
    },
  };
  return { cloud: cloud as never, calls, upserts };
}

const run = (over: Record<string, unknown> = {}) => ({
  id: '8d3c0000-0000-4000-8000-000000000001',
  trigger: 'schedule',
  mode: 'dry_run',
  status: 'ok',
  reason: null,
  startedAt: '2026-10-15T10:23:05.000Z',
  finishedAt: '2026-10-15T10:31:40.000Z',
  runner: { runId: '123456789', sha: 'abcdef0' },
  counts: { consenters: 412, flagsNew: 3, parity: true, fatigueState: 'calibrating' },
  ...over,
});

const adminReply = (over: Record<string, unknown> = {}) => ({
  lastOkAt: '2026-10-15T10:31:40.000Z',
  publication: { runId: '8d3c0000-0000-4000-8000-000000000001', at: '2026-10-15T10:31:40.000Z' },
  settings: { thresholds: { minGroupSize: 10 } },
  runs: [run()],
  overview: {
    items: { physician_estimate: 260, provisional: 30, calibrated: 10 },
    hardestTopics: [{ key: 'pediatrics/neonatology', students: 96, accuracy: 0.58 }],
    motives: { pediatrics: { reports: 830, knowledge: 0.41, time: 0.08 } },
    fatigue: { state: 'calibrating', students: 25, longSessions: 120 },
    agreement: { kappa: 0.52, parity: true },
  },
  ...over,
});

// ===================================================================== Corridas

describe('corridas de la calibración', () => {
  it('pide 30 corridas y devuelve lo que publicó la última buena', async () => {
    const { cloud, calls } = fakeCloud({ rpc: () => ({ data: adminReply(), error: null }) });
    const result = await readCalibrationRuns(cloud);
    expect(calls).toEqual([{ name: 'admin_calibration_runs', args: { p_limit: 30 } }]);
    expect(result.lastOkAt).toBe('2026-10-15T10:31:40.000Z');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({
      status: 'ok',
      mode: 'dry_run',
      githubRunId: '123456789',
      counts: { consenters: 412, flagsNew: 3, parity: true, fatigueState: 'calibrating' },
    });
    expect(result.overview.items).toEqual({
      physician_estimate: 260,
      provisional: 30,
      calibrated: 10,
    });
    expect(result.overview.hardestTopics).toEqual([
      { key: 'pediatrics/neonatology', students: 96, accuracy: 0.58 },
    ]);
    expect(result.overview.agreement).toEqual({ kappa: 0.52, parity: true });
  });

  it('los ajustes se leen con el esquema de la app, así minGroupSize no baja de 30', async () => {
    const { cloud } = fakeCloud({ rpc: () => ({ data: adminReply(), error: null }) });
    const result = await readCalibrationRuns(cloud);
    expect(result.settings.thresholds.minGroupSize).toBe(30);
    expect(result.settings.calibration.enabled).toBe(false);
  });

  it('una corrida rota se descarta y las demás se quedan', async () => {
    const { cloud } = fakeCloud({
      rpc: () => ({
        data: adminReply({
          runs: [run(), { id: 5 }, run({ id: 'otra', status: 'failed', reason: 'timeout' })],
        }),
        error: null,
      }),
    });
    const result = await readCalibrationRuns(cloud);
    expect(result.runs.map((one) => one.id)).toEqual([
      '8d3c0000-0000-4000-8000-000000000001',
      'otra',
    ]);
  });

  it('un número de corrida de GitHub que no son dígitos no se vuelve enlace', async () => {
    const { cloud } = fakeCloud({
      rpc: () => ({
        data: adminReply({
          runs: [
            run({ runner: { runId: '../../etc' } }),
            run({ id: 'b', runner: null }),
            run({ id: 'c', runner: { runId: '77' } }),
          ],
        }),
        error: null,
      }),
    });
    const result = await readCalibrationRuns(cloud);
    expect(result.runs.map((one) => one.githubRunId)).toEqual([null, null, '77']);
  });

  it('sin corridas ni publicación deja todo en cero y vacío', async () => {
    const { cloud } = fakeCloud({
      rpc: () => ({
        data: {
          lastOkAt: null,
          publication: null,
          settings: {},
          runs: [],
          overview: { items: {}, hardestTopics: [], motives: {}, fatigue: null, agreement: null },
        },
        error: null,
      }),
    });
    const result = await readCalibrationRuns(cloud);
    expect(result.lastOkAt).toBeNull();
    expect(result.publication).toBeNull();
    expect(result.runs).toEqual([]);
    expect(result.overview.items).toEqual({ physician_estimate: 0, provisional: 0, calibrated: 0 });
    expect(result.overview.fatigue).toEqual({ state: 'calibrating', students: 0, longSessions: 0 });
    expect(result.overview.agreement).toBeNull();
  });

  it('un 42501 avisa a onForbidden para pedir el segundo factor y lanza forbidden', async () => {
    const { cloud } = fakeCloud({ rpc: () => ({ data: null, error: { code: '42501' } }) });
    const onForbidden = vi.fn();
    await expect(readCalibrationRuns(cloud, onForbidden)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });

  it('una respuesta que no tiene la forma lanza unknown y sin red lanza network', async () => {
    const odd = fakeCloud({ rpc: () => ({ data: { runs: 'no' }, error: null }) });
    await expect(readCalibrationRuns(odd.cloud)).rejects.toMatchObject({ code: 'unknown' });
    const down = {
      rpc: () => Promise.reject(new TypeError('Failed to fetch')),
    } as never;
    await expect(readCalibrationRuns(down)).rejects.toBeInstanceOf(EditorialError);
  });
});

describe('enlace a la corrida de GitHub', () => {
  it('arma la dirección con el número y rechaza lo que no son dígitos', () => {
    expect(calibrationRunUrl('123456789')).toBe(
      'https://github.com/rickymm2001-dev/Studiare-ENARM/actions/runs/123456789',
    );
    for (const bad of [null, '', 'abc', '12 34', '1'.repeat(21), '12/../3']) {
      expect(calibrationRunUrl(bad)).toBeNull();
    }
    expect(CALIBRATION_WORKFLOW_URL).toMatch(/\/actions\/workflows\/calibration\.yml$/);
  });
});

// ===================================================================== Acuerdo por noche

describe('acuerdo noche por noche', () => {
  const night = (over: Record<string, unknown> = {}) => ({
    studyDay: '2026-10-15',
    at: '2026-10-15T10:31:40.000Z',
    pairs: 84,
    kappa: 0.52,
    observed: 0.7,
    expected: 0.37,
    parity: true,
    ...over,
  });

  it('pide 60 noches y devuelve las que cumplen la forma', async () => {
    const { cloud, calls } = fakeCloud({
      rpc: () => ({
        data: {
          nights: [
            night(),
            { studyDay: 'ayer' },
            night({ studyDay: '2026-10-14', kappa: null, parity: null, pairs: 0 }),
          ],
        },
        error: null,
      }),
    });
    const nights = await readAgreementHistory(cloud);
    expect(calls).toEqual([{ name: 'editor_agreement_history', args: { p_limit: 60 } }]);
    expect(nights.map((one) => one.studyDay)).toEqual(['2026-10-15', '2026-10-14']);
    expect(nights[1]).toMatchObject({ kappa: null, parity: null, pairs: 0 });
  });

  it('un 42501 pide el segundo factor', async () => {
    const { cloud } = fakeCloud({ rpc: () => ({ data: null, error: { code: '42501' } }) });
    const onForbidden = vi.fn();
    await expect(readAgreementHistory(cloud, onForbidden)).rejects.toMatchObject({
      code: 'forbidden',
    });
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });
});

// ===================================================================== Ajustes del modelo

describe('ajustes del modelo', () => {
  it('lee la clave tal cual y los ajustes con lo de fábrica donde falte', async () => {
    const { cloud } = fakeCloud({
      row: { thresholds: { minBranchAnswers: 25 }, futuro: { a: 1 } },
    });
    const document = await readModelSettingsDocument(cloud);
    expect(document.raw).toEqual({ thresholds: { minBranchAnswers: 25 }, futuro: { a: 1 } });
    expect(document.settings.thresholds.minBranchAnswers).toBe(25);
    expect(document.settings.thresholds.comparisonWindowDays).toBe(30);
  });

  it('sin la clave quedan los de fábrica y con un error de lectura lanza', async () => {
    const empty = await readModelSettingsDocument(fakeCloud().cloud);
    expect(empty.raw).toEqual({});
    expect(empty.settings).toEqual(FACTORY_MODEL_SETTINGS);
    await expect(
      readModelSettingsDocument(fakeCloud({ readError: { code: '42501' } }).cloud),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('une los cambios por sección sin perder lo que no se toca', () => {
    const raw = {
      calibration: { enabled: true, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
      features: { comparison: true, adaptive: true, futura: true },
      thresholds: { minGroupSize: 30, fatigue: { minStudents: 30, extra: 1 } },
      otra: 'cosa',
    };
    const merged = mergeModelSettings(raw, {
      thresholds: { minBranchAnswers: 25, fatigue: { minMotiveReports: 50 } },
      features: { adaptive: false },
    });
    expect(merged).toEqual({
      calibration: raw.calibration,
      features: { comparison: true, adaptive: false, futura: true },
      thresholds: {
        minGroupSize: 30,
        minBranchAnswers: 25,
        fatigue: { minStudents: 30, extra: 1, minMotiveReports: 50 },
      },
      otra: 'cosa',
    });
    // No toca lo que le pasaron
    expect(raw.features.adaptive).toBe(true);
  });

  it('guarda con el permiso por fila: lee, une y escribe la clave model_settings', async () => {
    const stored = {
      calibration: { enabled: false, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
      features: { comparison: true, adaptive: true },
      thresholds: { minGroupSize: 30 },
      futuro: { a: 1 },
    };
    const { cloud, upserts } = fakeCloud({ row: stored });
    const saved = await saveModelSettings(cloud, {
      thresholds: { minBranchAnswers: 25, adaptiveTargetOffset: -0.5 },
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]?.key).toBe('model_settings');
    expect(upserts[0]?.value).toEqual({
      ...stored,
      thresholds: { minGroupSize: 30, minBranchAnswers: 25, adaptiveTargetOffset: -0.5 },
    });
    expect(saved.thresholds.minBranchAnswers).toBe(25);
    expect(saved.calibration.enabled).toBe(false);
  });

  it('minGroupSize y populationMinStudents nunca se escriben por debajo de 30', async () => {
    for (const patch of [
      { thresholds: { minGroupSize: 10 } },
      { thresholds: { minGroupSize: 29 } },
      { thresholds: { populationMinStudents: 5 } },
    ]) {
      const { cloud, upserts } = fakeCloud({ row: {} });
      await expect(saveModelSettings(cloud, patch)).rejects.toMatchObject({ code: 'invalid' });
      expect(upserts).toEqual([]);
    }
    const ok = fakeCloud({ row: {} });
    await saveModelSettings(ok.cloud, {
      thresholds: { minGroupSize: 30, populationMinStudents: 45 },
    });
    expect(ok.upserts).toHaveLength(1);
  });

  it('un valor fuera de rango o que no es un número no se escribe', async () => {
    for (const patch of [
      { thresholds: { comparisonWindowDays: 3 } },
      { thresholds: { comparisonWindowDays: 120 } },
      { thresholds: { adaptiveExploreShare: 0.9 } },
      { thresholds: { minBranchAnswers: 2.5 } },
      { thresholds: { provisionalMaxSe: Number.NaN } },
      { thresholds: { fatigue: { minSplitHalfKappa: 3 } } },
      { calibration: { mode: 'publicar' as never } },
    ]) {
      const { cloud, upserts } = fakeCloud({ row: {} });
      await expect(saveModelSettings(cloud, patch)).rejects.toMatchObject({ code: 'invalid' });
      expect(upserts).toEqual([]);
    }
  });

  it('un 42501 al escribir pide el segundo factor y lanza forbidden', async () => {
    const { cloud } = fakeCloud({ row: {}, writeError: { code: '42501' } });
    const onForbidden = vi.fn();
    await expect(
      saveModelSettings(cloud, { features: { comparison: false } }, onForbidden),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });

  it('el interruptor y el modo cambian solo la sección de calibración', async () => {
    const stored = {
      calibration: { enabled: false, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
      features: { comparison: false, adaptive: true },
    };
    const { cloud, upserts } = fakeCloud({ row: stored });
    const saved = await saveCalibrationControl(cloud, { enabled: true, mode: 'apply' });
    expect(upserts[0]?.value).toEqual({
      ...stored,
      calibration: { enabled: true, mode: 'apply', minNoticeVersion: '2026-10-15b' },
    });
    expect(saved.calibration).toMatchObject({ enabled: true, mode: 'apply' });
    expect(saved.features.comparison).toBe(false);
  });
});
