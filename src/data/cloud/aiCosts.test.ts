import { describe, expect, it, vi } from 'vitest';
import { fetchCostReport } from './aiCosts';

const reply = (value: { data?: unknown; error?: { code?: string } | null }) => {
  const rpc = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve({ data: value.data ?? null, error: value.error ?? null }),
    );
  return { cloud: { rpc } as never, rpc };
};

const report = {
  from: '2026-10-01',
  to: '2026-10-31',
  calls: 120,
  totalUsd: 1.5,
  byEngine: { flashcards: { calls: 80, costUsd: 1.2 }, forgetting: { calls: 40, costUsd: 0.3 } },
  byMode: { sync: { calls: 80, costUsd: 1.2 }, batch: { calls: 40, costUsd: 0.3 } },
  byOutcome: { ok: 110, retried_ok: 6, refused: 4 },
  users: 12,
  students: 11,
  perStudentMonthlyUsd: { mean: 0.136, p50: 0.09, p90: 0.31 },
  paidStudentsToday: 9,
};

describe('reporte de costo de la nube', () => {
  it('pide el periodo y valida lo que llega', async () => {
    const { cloud, rpc } = reply({ data: report });
    const result = await fetchCostReport(cloud, { from: '2026-10-01', to: '2026-10-31' });
    expect(rpc).toHaveBeenCalledWith('admin_ai_cost_report', {
      p_from: '2026-10-01',
      p_to: '2026-10-31',
    });
    expect(result).toEqual({ ok: true, report });
  });

  it('acepta números como texto, que es como PostgREST devuelve un numeric grande', async () => {
    const { cloud } = reply({ data: { ...report, totalUsd: '1.5', calls: '120' } });
    const result = await fetchCostReport(cloud, { from: 'a', to: 'b' });
    expect(result.ok && [result.report.totalUsd, result.report.calls]).toEqual([1.5, 120]);
  });

  it('traduce el error y avisa del 42501 para pedir el segundo factor', async () => {
    const onForbidden = vi.fn();
    expect(
      await fetchCostReport(
        reply({ error: { code: '42501' } }).cloud,
        { from: 'a', to: 'b' },
        onForbidden,
      ),
    ).toEqual({ ok: false, reason: 'forbidden' });
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(
      await fetchCostReport(reply({ error: { code: '22023' } }).cloud, { from: 'a', to: 'b' }),
    ).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await fetchCostReport(reply({ error: {} }).cloud, { from: 'a', to: 'b' })).toEqual({
      ok: false,
      reason: 'network',
    });
    expect(
      await fetchCostReport(reply({ data: { nada: true } }).cloud, { from: 'a', to: 'b' }),
    ).toEqual({
      ok: false,
      reason: 'unknown',
    });
    const throwing = { rpc: () => Promise.reject(new Error('x')) } as never;
    expect(await fetchCostReport(throwing, { from: 'a', to: 'b' })).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
