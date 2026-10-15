// Prueba de oro de la sincronización con el Google Sheet (B11, 6.4 paso 1 del plan de B11). Corre la
// función bank-sync real contra los dos Sheets simulados, con el Google de mentira y la base en
// memoria, y compara el reporte de renglones con expected-antes.json y expected-despues.json. Si cambias
// una regla del convertidor a propósito, revisa el reporte con npm run bank:fixture y reescríbelo con
// npm run bank:fixture -- --write. También revisa que el .xlsx del Sheet de prueba se lea igual y que la
// pestaña Listas traiga sus rangos con nombre.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  expectedPath,
  FIXTURE_NAMES,
  fixtureReport,
  readFixture,
  type FixtureReport,
} from '../../scripts/content/bank-sheet-fixture.ts';
import { buildListsLayout, listCode } from '../../scripts/content/bank-sheet-lists.ts';
import { buildTestSheetWorkbook, fixtureValues } from '../../scripts/content/bank-sheet-test.ts';
import { loadTaxonomies } from '../../scripts/content/bankColumns.ts';
import { workbookTable } from '../../scripts/content/bankImport.ts';
import { tableFromValues } from '../../supabase/functions/_shared/bank/sheetTable.ts';
import { convertBankTable } from '../../supabase/functions/_shared/bank/sync.ts';

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
    ]) {
      expect(problems, code).toContain(code);
    }
    // Sin tarea que detectar el renglón entra con su pendiente y no se rechaza (revisión de B11)
    expect(problems).not.toContain('task_undetected');
    expect(report.rows.find((row) => row.sheetKey === 'GO-0020')).toMatchObject({
      outcome: 'created',
      incomplete: ['task_undetected'],
      problems: [],
    });
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

describe('Sheet de prueba y pestaña Listas en .xlsx', () => {
  const root = resolve(import.meta.dirname, '..', '..');
  const data = loadTaxonomies(root);
  const ID_PATTERN = '^[A-Z]{2,4}-[0-9]{4,5}$';

  it('la pestaña Listas trae un rango con nombre por rama y por subespecialidad', () => {
    const layout = buildListsLayout(data);
    const names = layout.columns.flatMap((column) => (column.name ? [column.name] : []));
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/);
    for (const branch of data.branches) {
      const sub = layout.columns.find((column) => column.name === `SUB_${listCode(branch.key)}`);
      expect(sub?.values).toEqual(branch.topics.map((topic) => topic.name));
      for (const topic of branch.topics) {
        const code = `${listCode(branch.key)}__${listCode(topic.key)}`;
        const tema = layout.columns.find((column) => column.name === `TEMA_${code}`);
        expect(tema?.values).toEqual(topic.subtopics.map((subtopic) => subtopic.name));
        // La tabla de BUSCARV lleva el par de nombres al mismo código
        const pairs = layout.columns[2]?.values ?? [];
        const codes = layout.columns[3]?.values ?? [];
        expect(codes[pairs.indexOf(`${branch.name}|${topic.name}`)]).toBe(code);
      }
    }
    const topics = data.branches.reduce((sum, branch) => sum + branch.topics.length, 0);
    expect(layout.branchLookup).toBe(`Listas!$A$2:$B$${data.branches.length + 1}`);
    expect(layout.topicLookup).toBe(`Listas!$C$2:$D$${topics + 1}`);
  });

  it('el .xlsx del Sheet de prueba se lee igual que el Sheet simulado despues', async () => {
    const book = buildTestSheetWorkbook(readFixture('despues'), data);
    const reread = new ExcelJS.Workbook();
    await reread.xlsx.load(await book.xlsx.writeBuffer());
    expect(reread.worksheets.map((sheet) => sheet.name)).toEqual([
      'Instrucciones',
      'Preguntas',
      'Temas',
      'Listas',
    ]);
    const table = workbookTable(reread);
    if (!table) throw new Error('falta la pestaña Preguntas');
    const fromXlsx = convertBankTable(table, ID_PATTERN);
    const fromFixture = convertBankTable(
      tableFromValues('Preguntas', fixtureValues(readFixture('despues'), 'Preguntas')),
      ID_PATTERN,
    );
    expect(fromXlsx.missingColumns).toEqual([]);
    expect(fromXlsx.counts).toEqual(fromFixture.counts);
    expect(fromXlsx.rows).toEqual(fromFixture.rows);
    expect(fromXlsx.rows.length).toBe(24);

    const defined = reread.definedNames.model.map((item) => item.name);
    expect(defined).toContain('RAMAS');
    expect(defined).toContain('SUB_OBSTETRICS_GYNECOLOGY');
    expect(defined).toContain('LISTA_SESGOS');
    const preguntas = reread.getWorksheet('Preguntas') as unknown as {
      dataValidations: { model: Record<string, { formulae?: unknown[] }> };
    };
    const formulas = Object.values(preguntas.dataValidations.model).flatMap((item) =>
      (item.formulae ?? []).map(String),
    );
    expect(formulas).toContain('INDIRECT("SUB_"&VLOOKUP($B2,Listas!$A$2:$B$9,2,FALSE))');
    expect(formulas.some((formula) => formula.startsWith('INDIRECT("TEMA_"'))).toBe(true);
  });
});
