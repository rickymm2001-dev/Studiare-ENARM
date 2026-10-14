// Paridad del acuerdo entre médicos (B11, 4.4 del plan de B11). La prueba SQL BE13 de
// supabase/tests/bank_editorial_test.sql calcula kappa en la base con bias_agreement_summary. Aquí se
// leen de ese archivo los mismos pares y el kappa que espera, y el motor de la app (computeAgreement)
// tiene que dar lo mismo, así el alumno lee igual sesgos o trampas en la nube y en la demo.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeAgreement, type LabelRecord } from '@/engines/agreement';

const sqlTest = readFileSync(
  resolve(import.meta.dirname, '../../supabase/tests/bank_editorial_test.sql'),
  'utf8',
);

interface SqlCase {
  pairs: { authorTag: string; tag: string; count: number }[];
  expected: { pairs: number; kappa: number; vocabulary: string; calibrating: boolean };
}

/** Cada bloque de BE13 inserta sus pares con from (values ...) y espera un JSON con su kappa */
function readSqlCases(): SqlCase[] {
  const section = sqlTest.slice(sqlTest.indexOf('BE13. Kappa'), sqlTest.indexOf('BE14.'));
  const blocks = [
    ...section.matchAll(
      /from \(values ([\s\S]*?)\)\s+as p \(author_tag, tag, n\)[\s\S]*?bias_agreement_summary\(\) = '(\{[^']+\})'/g,
    ),
  ];
  return blocks.map((block) => ({
    pairs: [...(block[1] ?? '').matchAll(/\('([a-z_]+)', '([a-z_]+)', (\d+)\)/g)].map((tuple) => ({
      authorTag: tuple[1] ?? '',
      tag: tuple[2] ?? '',
      count: Number(tuple[3]),
    })),
    expected: JSON.parse(block[2] ?? '{}') as SqlCase['expected'],
  }));
}

const thresholds = {
  minTaggedErrors: 40,
  minKappaForBiasLanguage: 0.4,
  doubleLabelShare: 0.2,
  minLabeledPairs: 30,
};

/** Las etiquetas de autor y revisor como las guarda bias_labels, una opción por par */
function labelsOf(sqlCase: SqlCase): LabelRecord[] {
  const labels: LabelRecord[] = [];
  let option = 0;
  for (const pair of sqlCase.pairs) {
    for (let index = 0; index < pair.count; index += 1) {
      option += 1;
      // El autor ordena primero por su id, así el par del motor es [autor, revisor] como en SQL
      labels.push({ optionId: `opt-${option}`, physicianId: 'a-autor', tag: pair.authorTag });
      labels.push({ optionId: `opt-${option}`, physicianId: 'b-revisor', tag: pair.tag });
    }
  }
  return labels;
}

describe('paridad de kappa entre la base y el motor de la app', () => {
  const cases = readSqlCases();

  it('lee los tres casos de BE13 con sus pares', () => {
    expect(cases.map((sqlCase) => sqlCase.expected.pairs)).toEqual([30, 29, 30]);
    for (const sqlCase of cases)
      expect(sqlCase.pairs.reduce((sum, pair) => sum + pair.count, 0)).toBe(sqlCase.expected.pairs);
  });

  it('el motor da el mismo kappa, vocabulario y calibración que la base', () => {
    for (const sqlCase of cases) {
      const report = computeAgreement(labelsOf(sqlCase), thresholds);
      expect(report.pairs).toBe(sqlCase.expected.pairs);
      expect(Number(report.global?.kappa.toFixed(6))).toBe(sqlCase.expected.kappa);
      expect(report.vocabulary).toBe(sqlCase.expected.vocabulary);
      expect(report.calibrating).toBe(sqlCase.expected.calibrating);
    }
  });

  it('30 pares con mucho acuerdo hablan de sesgos y 30 con poco de trampas', () => {
    expect(cases.map((sqlCase) => sqlCase.expected.vocabulary)).toEqual(['bias', 'trap', 'trap']);
  });
});
