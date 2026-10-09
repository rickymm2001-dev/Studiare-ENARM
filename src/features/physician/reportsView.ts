// Lo que muestra la bandeja de reportes de contenido (pantalla 21). Agrupa los reportes por pregunta,
// marca los que son de una versión anterior y ordena lo más grave primero. Sin React ni Dexie.
import type { ContentReport, Question } from '@/data/schemas/bank';

export type StatusFilter = ContentReport['status'] | 'all';

/** Menor es más grave. Una clave equivocada o un error clínico llegan al alumno como verdad */
const SEVERITY: Record<ContentReport['reason'], number> = {
  wrong_key: 0,
  clinical_error: 1,
  outdated: 2,
  typo: 3,
  other: 4,
};

export interface ReportRow {
  report: ContentReport;
  /** La versión que el alumno reportó. Puede faltar si ya no está en esta base */
  version: Question | undefined;
  /** El reporte es de una versión anterior a la actual de la pregunta */
  outdated: boolean;
}

export interface ReportGroup {
  /** ID estable de la pregunta */
  questionId: string;
  latest: Question;
  /** Los más nuevos primero */
  rows: ReportRow[];
  openCount: number;
  reasons: Partial<Record<ContentReport['reason'], number>>;
  newestAt: string;
  /** La gravedad más alta entre sus reportes abiertos, o entre todos si ninguno está abierto */
  severity: number;
}

export interface ReportsView {
  groups: ReportGroup[];
  counts: Record<ContentReport['status'], number>;
  /** Reportes de apuntes de alumnos, que son privados y no se revisan aquí */
  notes: number;
}

export interface ReportsInput {
  reports: readonly ContentReport[];
  /** Todas las versiones de las preguntas reportadas, por su ID de versión */
  versionsById: ReadonlyMap<string, Question>;
  /** La versión más reciente de cada pregunta, por su ID estable */
  latestByStableId: ReadonlyMap<string, Question>;
  /** Preguntas (por ID estable) que este médico puede ver. null si ve todas */
  allowed: ReadonlySet<string> | null;
  status: StatusFilter;
}

export function buildReportsView(input: ReportsInput): ReportsView {
  const counts: ReportsView['counts'] = { open: 0, resolved: 0, dismissed: 0 };
  let notes = 0;
  const byQuestion = new Map<string, ReportRow[]>();
  for (const report of input.reports) {
    if (report.targetKind === 'note') {
      notes += 1;
      continue;
    }
    const version = input.versionsById.get(report.targetId);
    if (!version) continue;
    if (input.allowed && !input.allowed.has(version.questionId)) continue;
    const latest = input.latestByStableId.get(version.questionId);
    if (!latest) continue;
    counts[report.status] += 1;
    if (input.status !== 'all' && report.status !== input.status) continue;
    const row: ReportRow = { report, version, outdated: version.id !== latest.id };
    byQuestion.set(version.questionId, [...(byQuestion.get(version.questionId) ?? []), row]);
  }

  const groups: ReportGroup[] = [];
  for (const [questionId, rows] of byQuestion) {
    const latest = input.latestByStableId.get(questionId);
    if (!latest) continue;
    rows.sort((a, b) => b.report.createdAt.localeCompare(a.report.createdAt));
    const open = rows.filter((row) => row.report.status === 'open');
    const reasons: ReportGroup['reasons'] = {};
    for (const row of rows) {
      reasons[row.report.reason] = (reasons[row.report.reason] ?? 0) + 1;
    }
    const pool = open.length > 0 ? open : rows;
    groups.push({
      questionId,
      latest,
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
  return { groups, counts, notes };
}

/** Los motivos de un grupo, del más grave al menos */
export function reasonsBySeverity(
  reasons: ReportGroup['reasons'],
): { reason: ContentReport['reason']; count: number }[] {
  return (Object.entries(reasons) as [ContentReport['reason'], number][])
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => SEVERITY[a.reason] - SEVERITY[b.reason]);
}
