// La importación de la pantalla 22 con destino nube (4.2 del plan de B11). El archivo de la plantilla
// se convierte con el convertidor del Sheet y viaja como los renglones de la sincronización
import { describe, expect, it } from 'vitest';
import { HEADERS, optionHeaders } from '@/data/content/bankColumns';
import type { BankTable } from '@/data/content/bankConvert';
import { canonicalFromSheet, contentHash } from '@/data/content/contentHash';
import { convertImportTable, importPayloads, previewRows } from './cloudImport';

const letters = ['A', 'B', 'C', 'D'];
const COLUMNS = [
  ...Object.values(HEADERS),
  ...letters.flatMap((letter) => Object.values(optionHeaders(letter))),
];

const record = (overrides: Record<string, string> = {}): Record<string, string> => ({
  [HEADERS.id]: 'imp-1',
  [HEADERS.branch]: 'Medicina interna',
  [HEADERS.topic]: 'Cardiología',
  [HEADERS.subtopic]: 'Hipertensión arterial sistémica',
  [HEADERS.difficulty]: '3',
  [HEADERS.vignette]: '[Prueba] Caso simulado, no es contenido médico.',
  [HEADERS.prompt]: '[Prueba] ¿Cuál es el diagnóstico más probable?',
  [HEADERS.correct]: 'A',
  [HEADERS.explanation]: '[Prueba] Explicación simulada.',
  [HEADERS.refs]: '[Prueba] Referencia simulada',
  ...Object.fromEntries(
    letters.flatMap((letter, index) => [
      [optionHeaders(letter).text, `[Prueba] Opción ${letter}`],
      [optionHeaders(letter).rationale, `[Prueba] Razón ${letter}.`],
      [
        optionHeaders(letter).bias,
        index === 0 ? '' : (['anchoring', 'premature_closure', 'framing_effect'][index - 1] ?? ''),
      ],
    ]),
  ),
  ...overrides,
});

const table = (records: Record<string, string>[]): BankTable => ({
  name: 'banco.csv',
  headers: COLUMNS,
  rows: records.map((row, index) => ({
    rowNumber: index + 2,
    cells: COLUMNS.map((column) => row[column] ?? ''),
  })),
});

describe('importación con destino nube', () => {
  it('acepta claves de importación que no siguen el patrón del Sheet', () => {
    const converted = convertImportTable(table([record(), record({ [HEADERS.id]: 'mi.0002' })]));
    expect(converted.rows.every((row) => row.question !== null)).toBe(true);
    expect(converted.rows.map((row) => row.key)).toEqual(['imp-1', 'mi.0002']);
  });

  it('arma los renglones de admin_bank_import con su huella y sin texto en los rechazados', async () => {
    const converted = convertImportTable(
      table([record(), record({ [HEADERS.id]: 'imp-2', [HEADERS.branch]: 'Brujería' })]),
    );
    const [good, bad] = await importPayloads(converted);
    expect(good).toMatchObject({ rowNumber: 2, key: 'imp-1', decision: 'create' });
    expect(good?.question?.prompt).toBe('[Prueba] ¿Cuál es el diagnóstico más probable?');
    const question = converted.rows[0]?.question;
    if (!question) throw new Error('Sin pregunta');
    expect(good?.rowHash).toBe(await contentHash(canonicalFromSheet(question)));
    expect(bad).toMatchObject({ rowNumber: 3, decision: 'rejected', rowHash: '' });
    expect(bad).not.toHaveProperty('question');
    expect(bad?.problems[0]).toMatchObject({ code: 'branch_unknown', value: 'Brujería' });
  });

  it('el reporte previo trae los renglones con algo que decir, en la forma del de la nube', () => {
    const converted = convertImportTable(
      table([
        record(),
        record({ [HEADERS.id]: 'imp-2', [HEADERS.explanation]: '' }),
        record({ [HEADERS.id]: '' }),
      ]),
    );
    const rows = previewRows(converted);
    // La tarea se detectó sola en todos, así que todos traen ese aviso
    expect(rows.map((row) => [row.rowNumber, row.outcome])).toEqual([
      [2, 'created'],
      [3, 'created'],
      [4, 'rejected'],
    ]);
    expect(rows[0]?.notices).toEqual(['structure_auto']);
    expect(rows[0]?.incomplete).toEqual([]);
    expect(rows[1]?.incomplete).toContain('explanation_missing');
  });
});
