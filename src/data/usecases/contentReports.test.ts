import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { ulidToUuid } from '../cloud/cloudIds';
import { fakeRpc, FakeDbError } from '../testing/bankCloud';
import { newId, testApi } from '../testing/fixtures';
import {
  cloudReporter,
  retryPendingReports,
  setReportsStatus,
  submitContentReport,
  submitQuestionReport,
} from './contentReports';

const disposers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(disposers.splice(0).map((dispose) => dispose()));
});
const setup = () => {
  const api = testApi('real');
  disposers.push(api.dispose);
  return api;
};
const base = { reporterId: newId(), targetKind: 'question' as const, targetId: newId() };

describe('reportes de contenido', () => {
  it('guarda un reporte abierto', async () => {
    const api = setup();
    const { report, created } = await submitContentReport(api, {
      ...base,
      reason: 'typo',
      now: new Date('2026-10-09T10:00:00Z'),
    });
    expect(created).toBe(true);
    expect(report).toMatchObject({
      status: 'open',
      reason: 'typo',
      createdAt: '2026-10-09T10:00:00.000Z',
      resolvedAt: null,
    });
    expect(await api.repos.contentReports.list()).toHaveLength(1);
  });

  it('el mismo alumno no repite el mismo reporte mientras siga abierto', async () => {
    const api = setup();
    const first = await submitContentReport(api, { ...base, reason: 'wrong_key' });
    const again = await submitContentReport(api, { ...base, reason: 'wrong_key' });
    expect(again).toMatchObject({ created: false });
    expect(again.report.id).toBe(first.report.id);
    // Otro motivo, otra versión u otro alumno sí cuentan
    await submitContentReport(api, { ...base, reason: 'typo' });
    await submitContentReport(api, { ...base, reason: 'wrong_key', targetId: newId() });
    await submitContentReport(api, { ...base, reason: 'wrong_key', reporterId: newId() });
    expect(await api.repos.contentReports.list()).toHaveLength(4);
  });

  it('si ya se resolvió, el alumno puede volver a reportarlo', async () => {
    const api = setup();
    const first = await submitContentReport(api, { ...base, reason: 'outdated' });
    await setReportsStatus(api, [first.report.id], 'resolved');
    const again = await submitContentReport(api, { ...base, reason: 'outdated' });
    expect(again.created).toBe(true);
    expect(again.report.id).not.toBe(first.report.id);
  });

  it('resuelve, descarta y reabre con su fecha', async () => {
    const api = setup();
    const a = await submitContentReport(api, { ...base, reason: 'typo' });
    const b = await submitContentReport(api, { ...base, reason: 'other' });
    const at = new Date('2026-10-09T12:00:00Z');
    expect(await setReportsStatus(api, [a.report.id, b.report.id], 'resolved', at)).toBe(2);
    expect(await api.repos.contentReports.get(a.report.id)).toMatchObject({
      status: 'resolved',
      resolvedAt: '2026-10-09T12:00:00.000Z',
    });
    // Lo que ya tiene ese estado no cuenta como cambio
    expect(await setReportsStatus(api, [a.report.id], 'resolved', at)).toBe(0);
    expect(await setReportsStatus(api, [a.report.id], 'dismissed', at)).toBe(1);
    expect(await setReportsStatus(api, [a.report.id], 'open')).toBe(1);
    expect(await api.repos.contentReports.get(a.report.id)).toMatchObject({
      status: 'open',
      resolvedAt: null,
    });
    // Un ID que no existe se ignora
    expect(await setReportsStatus(api, [newId()], 'resolved')).toBe(0);
  });
});

describe('reporte de una pregunta con el banco de la nube (B11, 5.4)', () => {
  const input = { reporterId: newId(), targetId: newId() };

  it('manda la versión en uuid y solo el motivo, y lo guarda aquí para que vea que ya reportó', async () => {
    const api = setup();
    const cloud = fakeRpc({ report_question: () => ({ status: 'created', reportId: 'r1' }) });
    const result = await submitQuestionReport(
      api,
      { ...input, reason: 'wrong_key' },
      cloudReporter(cloud),
    );
    expect(result).toMatchObject({ outcome: 'created', remote: 'sent' });
    expect(cloud.calls).toEqual([
      {
        name: 'report_question',
        args: { p_version_id: ulidToUuid(input.targetId), p_reason: 'wrong_key' },
      },
    ]);
    expect(await api.repos.contentReports.list()).toHaveLength(1);
    // El repetido no viaja otra vez
    expect(
      await submitQuestionReport(api, { ...input, reason: 'wrong_key' }, cloudReporter(cloud)),
    ).toMatchObject({ outcome: 'duplicate' });
    expect(cloud.calls).toHaveLength(1);
  });

  it('con el tope del día no se guarda y sin conexión se guarda y lo dice', async () => {
    const api = setup();
    const full = fakeRpc({ report_question: () => ({ status: 'limit', reportId: null }) });
    expect(
      await submitQuestionReport(api, { ...input, reason: 'typo' }, cloudReporter(full)),
    ).toEqual({ outcome: 'limit', report: null, remote: 'limit' });
    expect(await api.repos.contentReports.list()).toEqual([]);
    const offline = fakeRpc({
      report_question: () => {
        throw new Error('Failed to fetch');
      },
    });
    expect(
      await submitQuestionReport(api, { ...input, reason: 'typo' }, cloudReporter(offline)),
    ).toMatchObject({ outcome: 'created', remote: 'offline' });
    expect(await api.repos.contentReports.list()).toHaveLength(1);
  });

  it('sin conexión queda pendiente y se manda al volver la red, sin perder ni repetir nada', async () => {
    const api = setup();
    const offline = fakeRpc({
      report_question: () => {
        throw new Error('Failed to fetch');
      },
    });
    const first = await submitQuestionReport(
      api,
      { ...input, reason: 'typo' },
      cloudReporter(offline),
    );
    const second = await submitQuestionReport(
      api,
      { ...input, reason: 'wrong_key' },
      cloudReporter(offline),
    );
    expect((await api.repos.bankState.get('reports'))?.pending).toEqual([
      expect.objectContaining({ reportId: first.report?.id, reason: 'typo' }),
      expect.objectContaining({ reportId: second.report?.id, reason: 'wrong_key' }),
    ]);
    // Sigue sin red, así que nada sale de la lista
    expect(await retryPendingReports(api, cloudReporter(offline))).toBe(0);
    expect((await api.repos.bankState.get('reports'))?.pending).toHaveLength(2);
    // Con red, el primero llega y el segundo topa el máximo del día y espera a otro día
    const back = fakeRpc({
      report_question: (args) =>
        args?.p_reason === 'typo'
          ? { status: 'created', reportId: 'r1' }
          : { status: 'limit', reportId: null },
    });
    expect(await retryPendingReports(api, cloudReporter(back))).toBe(1);
    expect(back.calls.map((call) => call.args)).toEqual([
      { p_version_id: ulidToUuid(input.targetId), p_reason: 'typo' },
      { p_version_id: ulidToUuid(input.targetId), p_reason: 'wrong_key' },
    ]);
    expect((await api.repos.bankState.get('reports'))?.pending).toEqual([
      expect.objectContaining({ reportId: second.report?.id }),
    ]);
    // Un rechazo de la nube tampoco se vuelve a intentar
    const rejected = fakeRpc({ report_question: () => new FakeDbError('42501') });
    expect(await retryPendingReports(api, cloudReporter(rejected))).toBe(0);
    expect((await api.repos.bankState.get('reports'))?.pending).toEqual([]);
    // Los dos siguen guardados aquí
    expect(await api.repos.contentReports.list()).toHaveLength(2);
  });

  it('sin la nube es el reporte local de siempre y un rechazo de la base no lo pierde', async () => {
    const api = setup();
    expect(await submitQuestionReport(api, { ...input, reason: 'other' })).toMatchObject({
      outcome: 'created',
    });
    const rejected = fakeRpc({ report_question: () => new FakeDbError('42501') });
    expect(
      await submitQuestionReport(api, { ...input, reason: 'outdated' }, cloudReporter(rejected)),
    ).toMatchObject({ outcome: 'created', remote: 'failed' });
    const missing = fakeRpc({ report_question: () => ({ status: 'not_found', reportId: null }) });
    expect(
      await submitQuestionReport(
        api,
        { ...input, reason: 'clinical_error' },
        cloudReporter(missing),
      ),
    ).toMatchObject({ remote: 'failed' });
    expect(await cloudReporter(missing)('no-es-ulid', 'typo')).toBe('failed');
  });
});
