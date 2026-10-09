import { describe, expect, it } from 'vitest';
import { bucketOf, projectMonthlyPerStudent, summarizeCosts, type CallRecord } from './aiCosts';

const TZ = 'America/Merida';
const call = (overrides: Partial<CallRecord> = {}): CallRecord => ({
  userId: 'alumno-1',
  engine: 'forgetting',
  mode: 'real',
  model: 'claude-haiku-4-5',
  at: '2026-10-05T15:00:00.000Z',
  inputTokens: 1000,
  outputTokens: 200,
  cacheWriteTokens: 0,
  cacheReadTokens: 0,
  estimatedCostUsd: 0.002,
  latencyMs: 400,
  outcome: 'ok',
  ...overrides,
});

describe('totales', () => {
  it('sin llamadas todo es cero', () => {
    expect(bucketOf([])).toMatchObject({ calls: 0, costUsd: 0, avgLatencyMs: 0 });
    const summary = summarizeCosts([], TZ);
    expect(summary.byEngine).toEqual([]);
    expect(summary.byDay).toEqual([]);
  });

  it('suma tokens, costo y latencia y cuenta fallas y reintentos', () => {
    const bucket = bucketOf([
      call({ latencyMs: 100, estimatedCostUsd: 0.001 }),
      call({ latencyMs: 300, outcome: 'retried_ok', estimatedCostUsd: 0.0025 }),
      call({ outcome: 'fallback', latencyMs: 200, estimatedCostUsd: 0.004 }),
      call({ outcome: 'error', latencyMs: 400, estimatedCostUsd: 0 }),
    ]);
    expect(bucket).toMatchObject({
      calls: 4,
      costUsd: 0.0075,
      inputTokens: 4000,
      outputTokens: 800,
      avgLatencyMs: 250,
      failed: 2,
      retried: 1,
    });
  });
});

describe('resumen', () => {
  const calls = [
    call({ engine: 'forgetting', estimatedCostUsd: 0.002 }),
    call({ engine: 'flashcards', estimatedCostUsd: 0.01, at: '2026-10-06T15:00:00.000Z' }),
    call({
      engine: 'flashcards',
      mode: 'mock',
      estimatedCostUsd: 0.5,
      at: '2026-10-06T16:00:00.000Z',
    }),
    call({ engine: 'bias_tips', mode: 'template', estimatedCostUsd: 0.1 }),
  ];

  it('separa el gasto real del teórico', () => {
    const summary = summarizeCosts(calls, TZ);
    expect(summary.real).toMatchObject({ calls: 2, costUsd: 0.012 });
    expect(summary.simulated).toMatchObject({ calls: 2, costUsd: 0.6 });
    expect(summary.total.calls).toBe(4);
  });

  it('agrupa por motor en el orden de los motores y solo los que se usaron', () => {
    const summary = summarizeCosts(calls, TZ);
    expect(summary.byEngine.map((entry) => entry.engine)).toEqual([
      'forgetting',
      'flashcards',
      'bias_tips',
    ]);
    const flashcards = summary.byEngine.find((entry) => entry.engine === 'flashcards');
    expect(flashcards?.real.costUsd).toBe(0.01);
    expect(flashcards?.simulated.costUsd).toBe(0.5);
  });

  it('agrupa por día de estudio del alumno, del más reciente al más antiguo', () => {
    const summary = summarizeCosts(calls, TZ);
    expect(summary.byDay.map((entry) => entry.day)).toEqual(['2026-10-06', '2026-10-05']);
    expect(summary.byDay[0]).toMatchObject({ calls: 2, realCostUsd: 0.01, simulatedCostUsd: 0.5 });
  });

  it('una llamada de madrugada cuenta en el día de estudio anterior', () => {
    const summary = summarizeCosts([call({ at: '2026-10-06T08:00:00.000Z' })], TZ);
    expect(summary.byDay.map((entry) => entry.day)).toEqual(['2026-10-05']);
  });
});

describe('proyección por alumno al mes', () => {
  const spread = (count: number, days: number, userId: (index: number) => string, cost = 0.01) =>
    Array.from({ length: count }, (_, index) =>
      call({
        userId: userId(index),
        estimatedCostUsd: cost,
        at: new Date(Date.UTC(2026, 9, 1 + (index % days), 15)).toISOString(),
      }),
    );

  it('calibra con pocas llamadas y dice cuántas faltan', () => {
    expect(
      projectMonthlyPerStudent(
        spread(10, 5, () => 'a'),
        TZ,
      ),
    ).toEqual({
      ready: false,
      have: 10,
      need: 30,
      unit: 'calls',
    });
  });

  it('calibra si la bitácora abarca muy pocos días, para no extrapolar una ráfaga', () => {
    expect(
      projectMonthlyPerStudent(
        spread(40, 2, () => 'a'),
        TZ,
      ),
    ).toEqual({
      ready: false,
      have: 2,
      need: 3,
      unit: 'days',
    });
  });

  it('proyecta el costo de un alumno a 30 días', () => {
    // 60 llamadas de un centavo en 10 días de un solo alumno son 6 centavos al día, 1.80 al mes
    const projection = projectMonthlyPerStudent(
      spread(60, 10, () => 'a'),
      TZ,
    );
    expect(projection).toEqual({
      ready: true,
      usdPerStudentMonth: 1.8,
      basis: 'real',
      students: 1,
      days: 10,
      calls: 60,
    });
  });

  it('con varios alumnos reparte el costo entre ellos', () => {
    const projection = projectMonthlyPerStudent(
      spread(60, 10, (index) => `alumno-${index % 3}`),
      TZ,
    );
    expect(projection.ready && projection.usdPerStudentMonth).toBe(0.6);
    expect(projection.ready && projection.students).toBe(3);
  });

  it('si solo hubo respuestas simuladas proyecta con el costo teórico y lo dice', () => {
    const simulated = spread(40, 5, () => 'a').map((entry) => ({
      ...entry,
      mode: 'mock' as const,
    }));
    const projection = projectMonthlyPerStudent(simulated, TZ);
    expect(projection.ready && projection.basis).toBe('simulated');
  });

  it('con llamadas reales ignora las simuladas', () => {
    const mixed = [
      ...spread(40, 5, () => 'a'),
      ...spread(40, 5, () => 'a', 5).map((entry) => ({ ...entry, mode: 'mock' as const })),
    ];
    const projection = projectMonthlyPerStudent(mixed, TZ);
    expect(projection.ready && projection.basis).toBe('real');
    expect(projection.ready && projection.calls).toBe(40);
  });

  it('acepta otros mínimos', () => {
    expect(
      projectMonthlyPerStudent(
        spread(10, 5, () => 'a'),
        TZ,
        { calls: 10, days: 5 },
      ).ready,
    ).toBe(true);
  });

  it('las llamadas sin alumno cuentan como uno solo', () => {
    const projection = projectMonthlyPerStudent(
      spread(40, 5, () => 'x').map((entry) => ({ ...entry, userId: null })),
      TZ,
    );
    expect(projection.ready && projection.students).toBe(1);
  });
});
