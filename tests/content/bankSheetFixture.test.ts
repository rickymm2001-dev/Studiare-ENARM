// Prueba de oro de la sincronización con el Google Sheet (B11, 6.4 paso 1 del plan de B11). Corre la
// función bank-sync real contra los dos Sheets simulados, con el Google de mentira y la base en
// memoria, y compara el reporte de renglones con expected-antes.json y expected-despues.json. Si cambias
// una regla del convertidor a propósito, revisa el reporte con npm run bank:fixture y reescríbelo con
// npm run bank:fixture -- --write.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  expectedPath,
  FIXTURE_NAMES,
  fixtureReport,
  type FixtureReport,
} from '../../scripts/content/bank-sheet-fixture.ts';

const expected = (name: (typeof FIXTURE_NAMES)[number]) =>
  JSON.parse(readFileSync(expectedPath(name), 'utf8')) as FixtureReport;

describe('reporte de oro de los Sheets simulados', () => {
  it.each(FIXTURE_NAMES)('%s da el reporte guardado', async (name) => {
    expect(await fixtureReport(name)).toEqual(expected(name));
  });

  it('antes, el Sheet de hoy, queda en solo reporte por el ID con fórmula', async () => {
    const report = await fixtureReport('antes');
    expect(report).toMatchObject({ status: 'partial', reason: 'id_formula', mode: 'dry_run' });
    expect(report.counts).toMatchObject({ read: 8, empty: 4, rejected: 2, topicMismatches: 2 });
    const codes = new Set(
      report.rows.flatMap((row) => [
        ...row.notices,
        ...row.incomplete.map((code) => code.split(':')[0]),
        ...row.problems.map((problem) => problem.code),
      ]),
    );
    for (const code of [
      'topic_inferred',
      'subtopic_is_topic',
      'topic_unknown',
      'bias_none_on_correct',
      'status_approved_ignored',
      'explanation_missing',
      'references_missing',
      'rationale_missing',
      'bias_missing',
      'bias_unknown',
    ]) {
      expect(codes, code).toContain(code);
    }
  });

  it('despues toca cada regla del convertidor', async () => {
    const report = await fixtureReport('despues');
    expect(report).toMatchObject({ status: 'partial', reason: null, mode: 'apply' });
    const problems = new Set(report.rows.flatMap((row) => row.problems.map((item) => item.code)));
    for (const code of [
      'case_inconsistent',
      'subtopic_is_topic',
      'id_format',
      'id_missing',
      'id_duplicate',
      'template_placeholder',
      'option_gap',
      'difficulty_invalid',
      'task_undetected',
    ]) {
      expect(problems, code).toContain(code);
    }
    const notices = new Set(report.rows.flatMap((row) => row.notices));
    for (const code of ['case_rows_apart', 'author_is_reviewer', 'language_unknown']) {
      expect(notices, code).toContain(code);
    }
    // El renglón con todos los tipos de reactivo raros entra sin pendientes
    expect(report.rows.find((row) => row.sheetKey === 'GO-0002')).toMatchObject({
      outcome: 'created',
      incomplete: [],
      problems: [],
    });
    // Las dos ocurrencias de un ID repetido se rechazan
    expect(
      report.rows.filter((row) => row.sheetKey === 'GO-0016').map((row) => row.outcome),
    ).toEqual(['rejected', 'rejected']);
  });
});
