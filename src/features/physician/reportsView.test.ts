import { describe, expect, it } from 'vitest';
import type {
  EditorReportQuestion,
  EditorReportRow,
  EditorReports,
} from '@/data/editorial/editorialRepo';
import { buildReportsView, reasonsBySeverity } from './reportsView';

let counter = 0;
const nextId = () => {
  counter += 1;
  return `id-${String(counter).padStart(4, '0')}`;
};

const question = (overrides: Partial<EditorReportQuestion> = {}): EditorReportQuestion => ({
  questionId: nextId(),
  questionKey: 'GO-0001',
  promptPreview: '¿Cuál es la respuesta simulada?',
  branch: 'internal_medicine',
  topic: 'cardiology',
  latestVersion: 1,
  ...overrides,
});

const report = (
  target: EditorReportQuestion,
  reason: EditorReportRow['reason'],
  overrides: Partial<EditorReportRow> = {},
): EditorReportRow => ({
  id: nextId(),
  questionId: target.questionId,
  questionKey: target.questionKey,
  versionId: nextId(),
  version: target.latestVersion,
  reason,
  status: 'open',
  createdAt: '2026-10-09T10:00:00.000Z',
  resolvedAt: null,
  ...overrides,
});

const reports = (
  questions: EditorReportQuestion[],
  rows: EditorReportRow[],
  notes = 0,
): EditorReports => ({ questions, rows, notes });

describe('bandeja de reportes', () => {
  it('agrupa por pregunta y cuenta por estado', () => {
    const a = question();
    const b = question();
    const view = buildReportsView(
      reports(
        [a, b],
        [
          report(a, 'typo'),
          report(a, 'wrong_key'),
          report(b, 'typo', { status: 'resolved', resolvedAt: '2026-10-09T11:00:00.000Z' }),
        ],
      ),
      'all',
    );
    expect(view.counts).toEqual({ open: 2, resolved: 1, dismissed: 0 });
    expect(view.groups).toHaveLength(2);
    expect(view.groups[0]).toMatchObject({ questionId: a.questionId, openCount: 2 });
  });

  it('el filtro de estado deja los conteos completos', () => {
    const a = question();
    const view = buildReportsView(
      reports([a], [report(a, 'typo'), report(a, 'typo', { status: 'dismissed' })]),
      'dismissed',
    );
    expect(view.counts).toEqual({ open: 1, resolved: 0, dismissed: 1 });
    expect(view.groups[0]?.rows).toHaveLength(1);
  });

  it('pone primero lo abierto y más grave, y al final lo ya cerrado', () => {
    const typo = question();
    const wrongKey = question();
    const clinical = question();
    const closed = question();
    const view = buildReportsView(
      reports(
        [typo, wrongKey, clinical, closed],
        [
          report(typo, 'typo'),
          report(clinical, 'clinical_error'),
          report(wrongKey, 'wrong_key'),
          report(closed, 'wrong_key', { status: 'resolved' }),
        ],
      ),
      'all',
    );
    expect(view.groups.map((group) => group.questionId)).toEqual([
      wrongKey.questionId,
      clinical.questionId,
      typo.questionId,
      closed.questionId,
    ]);
  });

  it('marca como de versión anterior el reporte que no es de la versión más reciente', () => {
    const a = question({ latestVersion: 2 });
    const view = buildReportsView(
      reports([a], [report(a, 'typo', { version: 1 }), report(a, 'typo', { version: 2 })]),
      'open',
    );
    const rows = view.groups[0]?.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.outdated)).toHaveLength(1);
    expect(view.groups[0]?.question.latestVersion).toBe(2);
  });

  it('sin saber la versión no marca nada como anterior', () => {
    const a = question({ latestVersion: null });
    const view = buildReportsView(reports([a], [report(a, 'typo', { version: 1 })]), 'open');
    expect(view.groups[0]?.rows[0]?.outdated).toBe(false);
  });

  it('los reportes de una pregunta que no está en la lista se ignoran y los apuntes se cuentan aparte', () => {
    const a = question();
    const ghost = question();
    const view = buildReportsView(reports([a], [report(ghost, 'typo')], 3), 'all');
    expect(view.notes).toBe(3);
    expect(view.groups).toHaveLength(0);
    expect(view.counts.open).toBe(0);
  });

  it('lista los motivos del más grave al menos', () => {
    expect(reasonsBySeverity({ typo: 3, wrong_key: 1, other: 2 })).toEqual([
      { reason: 'wrong_key', count: 1 },
      { reason: 'typo', count: 3 },
      { reason: 'other', count: 2 },
    ]);
  });
});
