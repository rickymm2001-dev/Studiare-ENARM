// Lo que muestra la bandeja de reportes de contenido (pantalla 21). Agrupa los reportes por pregunta,
// marca los que son de una versión anterior y ordena lo más grave primero. Trabaja con lo que da el
// repositorio editorial, local o de la nube, sin datos del alumno (8.30). Sin React ni Dexie.
import type {
  EditorReportQuestion,
  EditorReportRow,
  EditorReports,
  ReportReason,
  ReportStatus,
} from '@/data/editorial/editorialRepo';

export type StatusFilter = ReportStatus | 'all';

/** Menor es más grave. Una clave equivocada o un error clínico llegan al alumno como verdad */
const SEVERITY: Record<ReportReason, number> = {
  wrong_key: 0,
  clinical_error: 1,
  outdated: 2,
  typo: 3,
  other: 4,
};

export interface ReportRow {
  report: EditorReportRow;
  /** El reporte es de una versión anterior a la más reciente de la pregunta */
  outdated: boolean;
}

export interface ReportGroup {
  /** ID estable de la pregunta */
  questionId: string;
  question: EditorReportQuestion;
  /** Los más nuevos primero */
  rows: ReportRow[];
  openCount: number;
  reasons: Partial<Record<ReportReason, number>>;
  newestAt: string;
  /** La gravedad más alta entre sus reportes abiertos, o entre todos si ninguno está abierto */
  severity: number;
}

export interface ReportsView {
  groups: ReportGroup[];
  counts: Record<ReportStatus, number>;
  /** Reportes de apuntes de alumnos, que son privados y no se revisan aquí */
  notes: number;
}

export function buildReportsView(reports: EditorReports, status: StatusFilter): ReportsView {
  const counts: ReportsView['counts'] = { open: 0, resolved: 0, dismissed: 0 };
  const questions = new Map(reports.questions.map((question) => [question.questionId, question]));
  const byQuestion = new Map<string, ReportRow[]>();
  for (const report of reports.rows) {
    const question = questions.get(report.questionId);
    if (!question) continue;
    counts[report.status] += 1;
    if (status !== 'all' && report.status !== status) continue;
    const row: ReportRow = {
      report,
      outdated:
        report.version !== null &&
        question.latestVersion !== null &&
        report.version < question.latestVersion,
    };
    byQuestion.set(report.questionId, [...(byQuestion.get(report.questionId) ?? []), row]);
  }

  const groups: ReportGroup[] = [];
  for (const [questionId, rows] of byQuestion) {
    const question = questions.get(questionId);
    if (!question) continue;
    rows.sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
    const open = rows.filter((row) => row.report.status === 'open');
    const reasons: ReportGroup['reasons'] = {};
    for (const row of rows) {
      reasons[row.report.reason] = (reasons[row.report.reason] ?? 0) + 1;
    }
    const pool = open.length > 0 ? open : rows;
    groups.push({
      questionId,
      question,
      rows,
      openCount: open.length,
      reasons,
      newestAt: rows[0]?.report.createdAt ?? '',
      severity: Math.min(...pool.map((row) => SEVERITY[row.report.reason])),
    });
  }
  groups.sort(
    (a, b) =>
      Number(b.openCount > 0) - Number(a.openCount > 0) ||
      a.severity - b.severity ||
      b.openCount - a.openCount ||
      b.newestAt.localeCompare(a.newestAt),
  );
  return { groups, counts, notes: reports.notes };
}

/** Los motivos de un grupo, del más grave al menos */
export function reasonsBySeverity(
  reasons: ReportGroup['reasons'],
): { reason: ReportReason; count: number }[] {
  return (Object.entries(reasons) as [ReportReason, number][])
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => SEVERITY[a.reason] - SEVERITY[b.reason]);
}
