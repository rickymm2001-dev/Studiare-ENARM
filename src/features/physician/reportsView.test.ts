import { describe, expect, it } from 'vitest';
import type { ContentReport, Question } from '@/data/schemas/bank';
import { makeQuestionWithOptions, newId } from '@/data/testing/fixtures';
import { buildReportsView, reasonsBySeverity, type ReportsInput } from './reportsView';

const question = (overrides: Partial<Question> = {}): Question => ({
  ...makeQuestionWithOptions().question,
  ...overrides,
});
const report = (
  target: Question,
  reason: ContentReport['reason'],
  overrides: Partial<ContentReport> = {},
): ContentReport => ({
  id: newId(),
  reporterId: newId(),
  targetKind: 'question',
  targetId: target.id,
  reason,
  status: 'open',
  createdAt: '2026-10-09T10:00:00.000Z',
  resolvedAt: null,
  ...overrides,
});

function input(questions: Question[], reports: ContentReport[], extra: Partial<ReportsInput> = {}) {
  const latest = new Map<string, Question>();
  for (const q of questions) {
    const current = latest.get(q.questionId);
    if (!current || q.version > current.version) latest.set(q.questionId, q);
  }
  return {
    reports,
    versionsById: new Map(questions.map((q) => [q.id, q])),
    latestByStableId: latest,
    allowed: null,
    status: 'open',
    ...extra,
  } satisfies ReportsInput;
}

describe('bandeja de reportes', () => {
  it('agrupa por pregunta y cuenta por estado', () => {
    const a = question();
    const b = question();
    const view = buildReportsView(
      input(
        [a, b],
        [
          report(a, 'typo'),
          report(a, 'wrong_key'),
          report(b, 'typo', { status: 'resolved', resolvedAt: '2026-10-09T11:00:00.000Z' }),
        ],
        { status: 'all' },
      ),
    );
    expect(view.counts).toEqual({ open: 2, resolved: 1, dismissed: 0 });
    expect(view.groups).toHaveLength(2);
    expect(view.groups[0]).toMatchObject({ questionId: a.questionId, openCount: 2 });
  });

  it('el filtro de estado deja los conteos completos', () => {
    const a = question();
    const view = buildReportsView(
      input([a], [report(a, 'typo'), report(a, 'typo', { status: 'dismissed' })], {
        status: 'dismissed',
      }),
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
      input(
        [typo, wrongKey, clinical, closed],
        [
          report(typo, 'typo'),
          report(clinical, 'clinical_error'),
          report(wrongKey, 'wrong_key'),
          report(closed, 'wrong_key', { status: 'resolved' }),
        ],
        { status: 'all' },
      ),
    );
    expect(view.groups.map((group) => group.questionId)).toEqual([
      wrongKey.questionId,
      clinical.questionId,
      typo.questionId,
      closed.questionId,
    ]);
  });

  it('marca como de versión anterior el reporte que no es de la versión actual', () => {
    const v1 = question();
    const v2 = question({ questionId: v1.questionId, version: 2 });
    const view = buildReportsView(input([v1, v2], [report(v1, 'typo'), report(v2, 'typo')]));
    const rows = view.groups[0]?.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.outdated)).toHaveLength(1);
    expect(view.groups[0]?.latest.id).toBe(v2.id);
  });

  it('un médico solo ve las preguntas que le asignaron', () => {
    const mine = question();
    const other = question();
    const view = buildReportsView(
      input([mine, other], [report(mine, 'typo'), report(other, 'typo')], {
        allowed: new Set([mine.questionId]),
      }),
    );
    expect(view.groups.map((group) => group.questionId)).toEqual([mine.questionId]);
    expect(view.counts.open).toBe(1);
  });

  it('los reportes de apuntes no entran y se cuentan aparte, y los de una versión que no está se ignoran', () => {
    const a = question();
    const view = buildReportsView(
      input(
        [a],
        [
          report(a, 'typo', { targetKind: 'note', targetId: newId() }),
          report(a, 'typo', { targetId: newId() }),
        ],
        { status: 'all' },
      ),
    );
    expect(view.notes).toBe(1);
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
