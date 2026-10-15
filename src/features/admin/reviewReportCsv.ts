// El CSV del reporte de revisiones para pagar a los médicos (B11, 4.5 del plan de B11). En UTF-8 con
// BOM para Excel, con alias y clave del médico y sin correos. El resumen tiene una fila por médico y
// mes y el detalle una por decisión. Se paga por pregunta revisada, así varias rondas sobre la misma
// pregunta en el mes cuentan una vez. Cuadran: la suma de Preguntas revisadas del resumen es el número
// de filas del detalle que dicen Sí en Paga. Sin React ni Dexie.
import type { ReviewReportRow } from '@/data/bank/contracts';
import type { ReviewDetailRow } from '@/data/cloud/bankAdmin';
import { bankAdminText } from '@/i18n/bankAdmin';
import { BOM } from '../physician/bankTemplates';
import { meridaDay } from '../physician/meridaMonth';
import { csvCell } from './csvCell';

const text = bankAdminText.reviews;

const csv = (lines: readonly (readonly (string | number | null)[])[]) =>
  `${BOM}${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}\r\n`;

/** Las columnas del resumen, en el orden de 4.5 */
export const SUMMARY_COLUMNS = [
  text.columns.month,
  text.columns.physician,
  text.columns.code,
  text.columns.approved,
  text.columns.changesRequested,
  text.columns.rejected,
  text.columns.reviewed,
  text.columns.distractors,
  text.columns.rate,
  text.columns.amount,
] as const;

export function reviewSummaryCsv(rows: readonly ReviewReportRow[], rate: number | null): string {
  return csv([
    SUMMARY_COLUMNS,
    ...rows.map((row) => [
      row.month,
      row.alias,
      row.code,
      row.approved,
      row.changesRequested,
      row.rejected,
      row.reviewed,
      row.distractorsResolved,
      rate,
      row.amountMxn,
    ]),
  ]);
}

export function reviewDetailCsv(rows: readonly ReviewDetailRow[]): string {
  return csv([
    text.detailColumns,
    ...rows.map((row) => [
      meridaDay(new Date(row.decidedAt)),
      row.month,
      row.alias,
      row.code,
      row.questionKey,
      row.version,
      text.decisions[row.decision] ?? row.decision,
      row.counts ? text.pays : text.doesNotPay,
    ]),
  ]);
}

export interface ReviewTotals {
  approved: number;
  changesRequested: number;
  rejected: number;
  reviewed: number;
  distractorsResolved: number;
  /** null si no hay tarifa */
  amountMxn: number | null;
}

export function reviewTotals(rows: readonly ReviewReportRow[]): ReviewTotals {
  const sum = (pick: (row: ReviewReportRow) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const amounts = rows.map((row) => row.amountMxn);
  return {
    approved: sum((row) => row.approved),
    changesRequested: sum((row) => row.changesRequested),
    rejected: sum((row) => row.rejected),
    reviewed: sum((row) => row.reviewed),
    distractorsResolved: sum((row) => row.distractorsResolved),
    amountMxn: amounts.some((amount) => amount === null)
      ? null
      : amounts.reduce<number>((total, amount) => total + (amount ?? 0), 0),
  };
}

/**
 * El resumen y el detalle cuadran. Cada fila del detalle que paga cuenta una pregunta revisada en el
 * resumen, y las decisiones del detalle suman las tres columnas de decisiones
 */
export function reviewsSquare(
  summary: readonly ReviewReportRow[],
  detail: readonly ReviewDetailRow[],
): boolean {
  const totals = reviewTotals(summary);
  const paid = detail.filter((row) => row.counts);
  if (totals.reviewed !== paid.length) return false;
  if (totals.approved + totals.changesRequested + totals.rejected !== detail.length) return false;
  const key = (month: string, physician: string) => `${month}|${physician}`;
  const counted = new Map<string, number>();
  for (const row of paid) {
    const at = key(row.month, row.physicianId);
    counted.set(at, (counted.get(at) ?? 0) + 1);
  }
  return summary.every(
    (row) => (counted.get(key(row.month, row.physicianId)) ?? 0) === row.reviewed,
  );
}
