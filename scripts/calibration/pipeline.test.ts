import { beforeAll, describe, expect, it } from 'vitest';
import { runCalibration } from '@/engines/calibration/run';
import type { CalibrationInput } from '@/engines/calibration/types';
import { simulatedInput } from '../../tests/calibration/simulated';
import { createLogger } from './log.ts';
import { runPipeline } from './pipeline.ts';
import { StoreError } from './store.ts';
import { memoryStore, wireInput, type MemoryStoreOptions } from './testing/memoryStore.ts';

let input: CalibrationInput;

beforeAll(() => {
  // Una cohorte chica pero con lo necesario: más de 30 alumnos, dos especialidades y unos 20 días
  const simulated = simulatedInput({
    seed: 'pipeline-1',
    size: 40,
    days: 20,
    specialties: { general_surgery: 34, pediatrics: 3 },
  });
  input = wireInput(simulated.input);
}, 120_000);

function setup(
  options: MemoryStoreOptions = {},
  extra: { pageSize?: number; forceDryRun?: boolean } = {},
) {
  const store = memoryStore(input, options);
  const lines: string[] = [];
  const log = createLogger((line) => lines.push(line));
  const run = () =>
    runPipeline(store, {
      trigger: 'selftest',
      forceDryRun: extra.forceDryRun ?? false,
      runner: { runId: '123', sha: 'abcdef0' },
      log,
      ...(extra.pageSize ? { pageSize: extra.pageSize } : {}),
    });
  return { store, lines, run };
}

describe('pipeline de la calibración nocturna', () => {
  it('lee, calcula, publica y cierra, en ese orden y con lo que da el motor', async () => {
    const { store, run, lines } = setup();
    const result = await run();
    expect(result.status).toBe('ok');
    expect(result.mode).toBe('apply');
    expect(result.applied).toBe(true);
    expect(store.begins).toEqual([
      { trigger: 'selftest', forceDryRun: false, runner: { runId: '123', sha: 'abcdef0' } },
    ]);
    const order = store.calls.filter((call, index) => call !== store.calls[index - 1]);
    expect(order).toEqual([
      'begin',
      'bank',
      'people',
      'answers',
      'exposures',
      'motives',
      'activity',
      'labelPairs',
      'publishItems',
      'publishOptions',
      'publishPopulation',
      'publishComparison',
      'publishAgreement',
      'finish',
    ]);

    // Lo publicado es lo que sale de correr el motor directo sobre la misma entrada
    const direct = runCalibration(input);
    expect(result.output).toEqual(direct);
    expect(store.published.items).toEqual(
      direct.items.map((item) => ({
        v: item.versionId,
        students: item.students,
        difficulty: item.difficulty,
        se: item.se,
        elo: item.elo,
        eloResponses: item.eloResponses,
        state: item.state,
        extreme: item.extreme,
        variantReady: item.variantReady,
      })),
    );
    expect(store.published.options).toHaveLength(direct.options.length);
    expect(store.published.population).toEqual(direct.population);
    expect(store.published.agreement).toEqual(direct.agreement);
    expect(store.published.comparison).toHaveLength(direct.comparison.length);
    expect(
      store.published.comparison.every(
        (cell) => cell.cuts === null || (cell.cuts as number[]).length === 19,
      ),
    ).toBe(true);
    expect(direct.items.length).toBeGreaterThan(0);

    // Cierra en ok con conteos que solo son números y códigos, y la ventana con que se hizo la foto
    expect(store.finished?.status).toBe('ok');
    expect(store.finished?.reason).toBeNull();
    const counts = store.finished?.counts ?? {};
    expect(counts.windowDays).toBe(30);
    expect(counts.minGroupSize).toBe(30);
    expect(counts.parity).toBe(true);
    expect(counts.itemsPublished).toBe(direct.items.length);
    expect(counts.consenters).toBe(input.people.length);
    expect(
      Object.values(counts).every(
        (value) =>
          typeof value === 'boolean' ||
          typeof value === 'number' ||
          /^[a-z_]+$/.test(String(value)),
      ),
    ).toBe(true);

    // Y su registro no descartó ningún campo, porque solo trae números y códigos
    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('dropped_field');
    }
    expect(lines.map((line) => (JSON.parse(line) as { code: string }).code)).toContain('finish');
  }, 120_000);

  it('pagina las lecturas sin huecos ni repetidos y da lo mismo con páginas chicas', async () => {
    const big = setup();
    const small = setup({}, { pageSize: 400 });
    const [a, b] = await Promise.all([big.run(), small.run()]);
    expect(small.store.answerLimits.length).toBeGreaterThan(5);
    expect(small.store.answerLimits.every((limit) => limit === 400)).toBe(true);
    expect(big.store.answerLimits).toEqual([20_000]);
    expect(b.output).toEqual(a.output);
    expect(small.store.published.items).toEqual(big.store.published.items);
  }, 120_000);

  it('en dry_run no aplica y lo dice, y el modo forzado gana al del ajuste', async () => {
    const { store, run } = setup({ mode: 'apply' }, { forceDryRun: true });
    const result = await run();
    expect(result.mode).toBe('dry_run');
    expect(result.applied).toBe(false);
    expect(store.begins[0]?.forceDryRun).toBe(true);
    expect(store.finished?.status).toBe('ok');
  }, 120_000);

  it('una corrida saltada no lee nada ni cierra nada', async () => {
    const { store, run, lines } = setup({ skip: 'disabled' });
    const result = await run();
    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'disabled',
      output: null,
      applied: false,
    });
    expect(store.calls).toEqual(['begin']);
    expect(store.finishCalls).toBe(0);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toContainEqual({
      code: 'skipped',
      reason: 'disabled',
    });
  });

  it('con un partial de la base lo dice, y si la paridad no cuadró dice el motivo', async () => {
    const { run } = setup({ finishAs: 'partial' });
    const result = await run();
    expect(result.status).toBe('partial');
    expect(result.reason).toBeNull();
  }, 120_000);

  it('un fallo al publicar cierra la corrida como failed con su motivo y sube con su código', async () => {
    const { store, run, lines } = setup({ failAt: { method: 'publishItems', code: '57014' } });
    await expect(run()).rejects.toMatchObject({ name: 'StoreError', code: '57014' });
    expect(store.finished).toEqual({ status: 'failed', reason: 'timeout', counts: {} });
    const errors = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.code === 'error');
    expect(errors).toEqual([
      { code: 'error', errorClass: 'StoreError', errorCode: '57014', reason: 'timeout' },
    ]);
  }, 120_000);

  it('si ni cerrar como failed se puede, sube el primer fallo y deja los dos en el registro', async () => {
    const store = memoryStore(input, { failAt: { method: 'publishPopulation', code: '22023' } });
    const failFinish = new StoreError('calibration_finish', { code: '08006' });
    const lines: string[] = [];
    store.finish = () => {
      store.finishCalls += 1;
      return Promise.reject(failFinish);
    };
    await expect(
      runPipeline(store, {
        trigger: 'selftest',
        forceDryRun: false,
        runner: {},
        log: createLogger((line) => lines.push(line)),
      }),
    ).rejects.toMatchObject({ code: '22023' });
    expect(store.finishCalls).toBe(1);
    const errors = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .filter((line) => line.code === 'error');
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ errorCode: '22023', reason: 'store_error' });
    expect(errors[1]).toMatchObject({ errorCode: '08006' });
  }, 120_000);

  it('una página con una fila rota o un cursor que no avanza falla como invalid_page', async () => {
    const broken = setup({ stuckCursor: true });
    await expect(broken.run()).rejects.toBeInstanceOf(RangeError);
    expect(broken.store.finished).toEqual({ status: 'failed', reason: 'invalid_page', counts: {} });

    const store = memoryStore(input);
    const original = store.people.bind(store);
    store.people = async (run) => {
      const page = (await original(run)) as { people: unknown[][] };
      return { people: [...page.people, ['no-es-un-seudonimo', null]] };
    };
    const lines: string[] = [];
    await expect(
      runPipeline(store, {
        trigger: 'selftest',
        forceDryRun: false,
        runner: {},
        log: createLogger((l) => lines.push(l)),
      }),
    ).rejects.toMatchObject({ name: 'ZodError' });
    expect(store.finished).toEqual({ status: 'failed', reason: 'invalid_page', counts: {} });
    expect(lines.join('\n')).not.toContain('no-es-un-seudonimo');
  }, 120_000);

  it('cambios inválidos del admin a los umbrales caen a los de fábrica y se anotan', async () => {
    const { store, run } = setup({ thresholds: { grupo_que_no_existe: { x: 1 } } });
    const result = await run();
    expect(result.status).toBe('ok');
    expect(store.finished?.counts.thresholdsFallback).toBe(true);
    const valid = setup({ thresholds: { difficulty: { calibratedResponses: 120 } } });
    await valid.run();
    expect(valid.store.finished?.counts.thresholdsFallback).toBe(false);
  }, 120_000);
});
