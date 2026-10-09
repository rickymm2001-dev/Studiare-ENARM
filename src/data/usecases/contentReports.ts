// Reportes de contenido (4.5, pantalla 21). El alumno reporta un error en una pregunta y el médico
// que la tiene asignada lo resuelve o lo descarta. Un alumno no manda dos veces lo mismo mientras
// el primero siga abierto.
import { newId } from '../ids';
import type { DataApi } from '../context';
import type { ContentReport } from '../schemas/bank';

type Api = Pick<DataApi, 'repos'>;

export type ReportReason = ContentReport['reason'];
export type ReportStatus = ContentReport['status'];

export async function submitContentReport(
  api: Api,
  input: {
    reporterId: string;
    targetKind: ContentReport['targetKind'];
    /** La versión de la pregunta que el alumno tenía a la vista */
    targetId: string;
    reason: ReportReason;
    now?: Date;
  },
): Promise<{ report: ContentReport; created: boolean }> {
  const existing = (await api.repos.contentReports.list()).find(
    (report) =>
      report.status === 'open' &&
      report.reporterId === input.reporterId &&
      report.targetKind === input.targetKind &&
      report.targetId === input.targetId &&
      report.reason === input.reason,
  );
  if (existing) return { report: existing, created: false };
  const report = await api.repos.contentReports.put({
    id: newId(),
    reporterId: input.reporterId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    reason: input.reason,
    status: 'open',
    createdAt: (input.now ?? new Date()).toISOString(),
    resolvedAt: null,
  });
  return { report, created: true };
}

/** Resuelve, descarta o reabre reportes. Reabrir borra la fecha de resolución. Devuelve cuántos cambió */
export async function setReportsStatus(
  api: Api,
  ids: readonly string[],
  status: ReportStatus,
  now: Date = new Date(),
): Promise<number> {
  let changed = 0;
  for (const id of ids) {
    const report = await api.repos.contentReports.get(id);
    if (!report || report.status === status) continue;
    await api.repos.contentReports.put({
      ...report,
      status,
      resolvedAt: status === 'open' ? null : now.toISOString(),
    });
    changed += 1;
  }
  return changed;
}
