// El CSV del reporte de revisiones para pagar a los médicos (4.5 del plan de B11). UTF-8 con BOM, sin
// correos, y el resumen cuadra con el detalle
import { describe, expect, it } from 'vitest';
import type { ReviewReportDetailRow, ReviewReportRow } from '@/data/bank/contracts';
import { bankAdminText } from '@/i18n/bankAdmin';
import {
  reviewDetailCsv,
  reviewSummaryCsv,
  reviewsSquare,
  reviewTotals,
  SUMMARY_COLUMNS,
} from './reviewReportCsv';

const row = (overrides: Partial<ReviewReportRow> = {}): ReviewReportRow => ({
  month: '2026-10',
  physicianId: 'p1',
  alias: 'Ana',
  code: 'AN',
  approved: 2,
  changesRequested: 1,
  rejected: 0,
  reviewed: 3,
  distractorsResolved: 1,
  amountMxn: 150,
  ...overrides,
});

const detail = (overrides: Partial<ReviewReportDetailRow> = {}): ReviewReportDetailRow => ({
  decidedAt: '2026-10-14T16:00:00.000Z',
  month: '2026-10',
  physicianId: 'p1',
  alias: 'Ana',
  code: 'AN',
  questionKey: 'GO-0012',
  version: 2,
  decision: 'approve',
  ...overrides,
});

const lines = (csv: string) =>
  csv
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');

describe('CSV de revisiones', () => {
  it('el resumen lleva BOM, sus columnas y una fila por médico y mes, sin correos', () => {
    const csv = reviewSummaryCsv(
      [row(), row({ physicianId: 'p2', alias: 'Beto', code: null })],
      50,
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [header, ...body] = lines(csv);
    expect(header).toBe(SUMMARY_COLUMNS.map((column) => `"${column}"`).join(','));
    expect(body).toEqual([
      '"2026-10","Ana","AN","2","1","0","3","1","50","150"',
      '"2026-10","Beto","","2","1","0","3","1","50","150"',
    ]);
    expect(csv).not.toContain('@');
  });

  it('el detalle tiene una fila por decisión con el día de Mérida', () => {
    const csv = reviewDetailCsv([
      detail(),
      // Las once y media de la noche del 31 en Mérida cuenta en octubre
      detail({
        decidedAt: '2026-11-01T05:30:00.000Z',
        decision: 'reject',
        questionKey: 'abcd1234',
      }),
    ]);
    const [header, ...body] = lines(csv);
    expect(header).toBe(
      bankAdminText.reviews.detailColumns.map((column) => `"${column}"`).join(','),
    );
    expect(body[0]).toBe('"2026-10-14","2026-10","Ana","AN","GO-0012","2","Aprobó"');
    expect(body[1]).toBe('"2026-10-31","2026-10","Ana","AN","abcd1234","2","Rechazó"');
  });

  it('cuadra cuando cada decisión del detalle cuenta una revisión del resumen', () => {
    const summary = [row({ reviewed: 2 }), row({ physicianId: 'p2', reviewed: 1 })];
    const square = [
      detail(),
      detail({ decision: 'request_changes' }),
      detail({ physicianId: 'p2' }),
    ];
    expect(reviewsSquare(summary, square)).toBe(true);
    expect(reviewsSquare(summary, square.slice(1))).toBe(false);
    expect(reviewsSquare(summary, [detail(), detail(), detail()])).toBe(false);
  });

  it('suma los totales y sin tarifa el monto es nulo', () => {
    expect(reviewTotals([row(), row()])).toMatchObject({ reviewed: 6, amountMxn: 300 });
    expect(reviewTotals([row(), row({ amountMxn: null })]).amountMxn).toBeNull();
  });
});
