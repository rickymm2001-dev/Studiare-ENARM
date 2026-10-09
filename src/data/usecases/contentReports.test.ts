import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { newId, testApi } from '../testing/fixtures';
import { setReportsStatus, submitContentReport } from './contentReports';

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
