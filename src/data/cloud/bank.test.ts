import { describe, expect, it } from 'vitest';
import { fakeRpc, FakeDbError, wireQuota } from '../testing/bankCloud';
import {
  bankFailureOf,
  fetchAgreementSummary,
  fetchBankQuota,
  fetchCatalogPage,
  fetchQuestionBodies,
  reportQuestionInCloud,
} from './bank';

describe('llamadas del alumno al banco en la nube', () => {
  it('traduce los errores de la base y la falta de red', () => {
    expect(bankFailureOf({ code: '28000' })).toBe('no_session');
    expect(bankFailureOf({ code: 'PGRST301' })).toBe('no_session');
    expect(bankFailureOf({ code: '42501' })).toBe('other_device');
    expect(bankFailureOf({ code: '22023' })).toBe('invalid');
    expect(bankFailureOf({ code: '22P02' })).toBe('invalid');
    expect(bankFailureOf({ code: 'PGRST202' })).toBe('unavailable');
    expect(bankFailureOf({})).toBe('network');
    expect(bankFailureOf({ code: 'XX000' })).toBe('unknown');
  });

  it('manda solo ids y el propósito, con los nombres de parámetro de la base', async () => {
    const quota = wireQuota();
    const cloud = fakeRpc({
      catalog_changes: () => ({ open: true, rows: [{}], nextSince: 4, done: true }),
      fetch_questions: () => ({ questions: [], cases: [], denied: [], quota }),
      report_question: () => ({ status: 'created', reportId: 'abc' }),
    });
    expect(await fetchCatalogPage(cloud, 3)).toEqual({
      ok: true,
      value: { open: true, rows: [{}], nextSince: 4, done: true },
    });
    await fetchQuestionBodies(cloud, ['v1', 'v2'], 'exam');
    await reportQuestionInCloud(cloud, 'v1', 'wrong_key');
    expect(cloud.calls).toEqual([
      { name: 'catalog_changes', args: { p_since: 3, p_limit: 1000 } },
      { name: 'fetch_questions', args: { p_version_ids: ['v1', 'v2'], p_purpose: 'exam' } },
      { name: 'report_question', args: { p_version_id: 'v1', p_reason: 'wrong_key' } },
    ]);
  });

  it('lee la cuota con fechas de Postgres y un motivo nuevo de negación cuenta como no encontrada', async () => {
    const cloud = fakeRpc({
      bank_quota: () => ({
        ...wireQuota(),
        resetsAt: '2026-10-21 10:00:00+00',
        brake: { retryAt: '2026-10-20T18:01:00Z' },
      }),
      fetch_questions: () => ({
        questions: [],
        cases: [],
        denied: [{ id: 'v1', reason: 'motivo_nuevo' }],
        quota: wireQuota(),
      }),
    });
    expect(await fetchBankQuota(cloud)).toEqual({
      ok: true,
      value: wireQuota({
        resetsAt: '2026-10-21T10:00:00.000Z',
        brake: { retryAt: '2026-10-20T18:01:00.000Z' },
      }),
    });
    const reply = await fetchQuestionBodies(cloud, ['v1'], 'practice');
    expect(reply.ok && reply.value.denied).toEqual([{ id: 'v1', reason: 'not_found' }]);
  });

  it('una respuesta con otra forma, un error de la base o sin red no se toman como buenos', async () => {
    const offline = fakeRpc({
      bias_agreement_summary: () => {
        throw new Error('Failed to fetch');
      },
    });
    expect(await fetchAgreementSummary(offline)).toEqual({ ok: false, reason: 'network' });
    const odd = fakeRpc({ bank_quota: () => ({ ...wireQuota(), resetsAt: 'mañana' }) });
    expect(await fetchBankQuota(odd)).toEqual({ ok: false, reason: 'unknown' });
    const moved = fakeRpc({ catalog_changes: () => new FakeDbError('42501') });
    expect(await fetchCatalogPage(moved, 0)).toEqual({ ok: false, reason: 'other_device' });
    expect(await fetchAgreementSummary(fakeRpc({}))).toEqual({ ok: false, reason: 'unavailable' });
  });
});
