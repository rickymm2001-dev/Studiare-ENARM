// Reportes de contenido (4.5, pantalla 21). El alumno reporta un error en una pregunta y el médico
// que la tiene asignada lo resuelve o lo descarta. Un alumno no manda dos veces lo mismo mientras
// el primero siga abierto.
// Con el banco de la nube (B11, 5.4) el reporte va además a report_question con la versión que el
// alumno tenía a la vista, que le avisa al médico asignado por correo. Solo viaja el motivo, de una
// lista cerrada, nunca texto del alumno (8.30). El reporte se guarda también aquí, para que el alumno
// vea que ya reportó, salvo que el servidor diga que ya llegó al tope del día.
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportQuestionInCloud } from '../cloud/bank';
import { ulidToUuid } from '../cloud/cloudIds';
import { newId } from '../ids';
import type { DataApi } from '../context';
import type { ContentReport } from '../schemas/bank';

type Api = Pick<DataApi, 'repos'>;

export type ReportReason = ContentReport['reason'];
export type ReportStatus = ContentReport['status'];

/**
 * Lo que dijo la nube de un reporte. sent, llegó, también si ya tenía uno igual abierto. limit, ya
 * mandó los reportes del día. offline, no hubo conexión. failed, la nube lo rechazó por otra razón
 */
export type RemoteReportOutcome = 'sent' | 'limit' | 'offline' | 'failed';

/** Manda un reporte a la nube con la versión que el alumno tenía a la vista */
export type RemoteReporter = (
  questionVersionId: string,
  reason: ReportReason,
) => Promise<RemoteReportOutcome>;

/** El reporte de la nube, con el id de la versión en uuid como lo guarda la base */
export function cloudReporter(cloud: Pick<SupabaseClient, 'rpc'>): RemoteReporter {
  return async (questionVersionId, reason) => {
    const uuid = ulidToUuid(questionVersionId);
    if (!uuid) return 'failed';
    const reply = await reportQuestionInCloud(cloud, uuid, reason);
    if (!reply.ok) return reply.reason === 'network' ? 'offline' : 'failed';
    if (reply.value.status === 'limit') return 'limit';
    return reply.value.status === 'not_found' ? 'failed' : 'sent';
  };
}

interface ReportInput {
  reporterId: string;
  targetKind: ContentReport['targetKind'];
  /** La versión de la pregunta que el alumno tenía a la vista */
  targetId: string;
  reason: ReportReason;
  now?: Date;
}

/** El reporte abierto igual a este, del mismo alumno, la misma versión y el mismo motivo */
async function openDuplicate(api: Api, input: ReportInput): Promise<ContentReport | undefined> {
  return (await api.repos.contentReports.list()).find(
    (report) =>
      report.status === 'open' &&
      report.reporterId === input.reporterId &&
      report.targetKind === input.targetKind &&
      report.targetId === input.targetId &&
      report.reason === input.reason,
  );
}

export async function submitContentReport(
  api: Api,
  input: ReportInput,
): Promise<{ report: ContentReport; created: boolean }> {
  const existing = await openDuplicate(api, input);
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

/**
 * Reporte de una pregunta con o sin la nube. Un reporte repetido no viaja. Con la nube, si el servidor
 * dice que ya llegó al tope del día no se guarda aquí, así lo puede mandar mañana. Sin conexión se guarda
 * aquí y la pantalla avisa que no llegó al médico
 */
export async function submitQuestionReport(
  api: Api,
  input: Omit<ReportInput, 'targetKind'>,
  remote?: RemoteReporter,
): Promise<
  | { outcome: 'created' | 'duplicate'; report: ContentReport; remote?: RemoteReportOutcome }
  | { outcome: 'limit'; report: null; remote: 'limit' }
> {
  const full: ReportInput = { ...input, targetKind: 'question' };
  const existing = await openDuplicate(api, full);
  if (existing) return { outcome: 'duplicate', report: existing };
  const sent = remote ? await remote(input.targetId, input.reason) : undefined;
  if (sent === 'limit') return { outcome: 'limit', report: null, remote: sent };
  const { report } = await submitContentReport(api, full);
  return sent ? { outcome: 'created', report, remote: sent } : { outcome: 'created', report };
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
