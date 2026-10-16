// Todos los casos de npm run eval-ai (B12, 4.2 del plan). Los 60 sintéticos de 8.7, 10 por motor del
// banco de demostración, 5 por motor adversarios y, con --bank-file, 10 por motor del banco real
// exportado, que vive en private/. Unos 135 casos sin el banco real.
import type { AiEngine } from '../../src/engines/aiContracts.ts';
import { adversarialCases } from './adversarialCases.ts';
import { bankCases, demoBankCases, type BankSource } from './bankCases.ts';
import { buildCases, type CaseSet, type GoldenCase } from './cases.ts';

export interface SuiteOptions {
  /** El banco real ya leído de private/ con loadBankFile */
  bank?: BankSource | null;
}

export function buildSuite(options: SuiteOptions = {}): GoldenCase[] {
  return [
    ...buildCases(),
    ...demoBankCases(),
    ...adversarialCases(),
    ...(options.bank ? bankCases(options.bank) : []),
  ];
}

/** Cuántos casos hay de cada origen, para el encabezado del reporte */
export function countBySet(
  cases: readonly GoldenCase[],
  engine?: AiEngine,
): Partial<Record<CaseSet, number>> {
  const counts: Partial<Record<CaseSet, number>> = {};
  for (const golden of cases) {
    if (engine && golden.engine !== engine) continue;
    counts[golden.set] = (counts[golden.set] ?? 0) + 1;
  }
  return counts;
}
