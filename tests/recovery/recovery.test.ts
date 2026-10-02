// Recuperación de parámetros (14.2) con 300 alumnos simulados y los motores reales (src/demo/generator).
// Con RECOVERY_REPORT=1 (npm run recovery-report) corre 3 semillas y escribe docs/recovery-report.md.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDemoBank } from '@/demo/content/bank';
import { topicTaxonomy } from '@/demo/content';
import { generateCohort, simItemsFrom } from '@/demo/generator/cohort';
import { computeRecovery, type RecoveryReport } from '@/demo/generator/recovery';
import { renderRecoveryReport } from '@/demo/generator/recoveryReport';

const bank = buildDemoBank();
const items = simItemsFrom(bank);
const run = (seed: string): RecoveryReport =>
  computeRecovery(
    generateCohort(bank, topicTaxonomy, {
      seed,
      size: 300,
      days: 90,
      endDay: '2026-10-01',
      simulateCards: false,
    }),
    items,
    topicTaxonomy,
  );

describe('recuperación de parámetros (14.2)', { timeout: 120_000 }, () => {
  let report: RecoveryReport;
  beforeAll(() => {
    report = run('recuperacion-1');
  }, 120_000);

  it('Rasch y Elo recuperan la dificultad verdadera', () => {
    expect(report.students).toBe(300);
    expect(report.rasch.converged).toBe(true);
    expect(report.rasch.correlation).toBeGreaterThanOrEqual(0.9);
    expect(report.elo.correlation).toBeGreaterThanOrEqual(0.8);
  });

  it('el encogimiento por tema reduce el error frente a la proporción cruda', () => {
    expect(report.topics.rmseShrunk).toBeLessThan(report.topics.rmseRaw);
  });

  it('la mala lectura de negaciones cumple la meta', () => {
    expect(report.misread.sensitivity).toBeGreaterThanOrEqual(0.8);
    expect(report.misread.falsePositiveRate).toBeLessThanOrEqual(0.1);
  });

  it('sesgos. El método de 7.4 detecta pero marca de más, la variante propuesta cumple (D-051)', () => {
    expect(report.bias.sensitivity).toBeGreaterThanOrEqual(0.8);
    // Se reporta sin exigir la meta, porque el método de 7.4 no la cumple (ver el informe)
    expect(report.bias.falsePositiveRate).toBeGreaterThan(0.1);
    expect(report.bias.errorShareCorrected.sensitivity).toBeGreaterThanOrEqual(0.8);
    expect(report.bias.errorShareCorrected.falsePositiveRate).toBeLessThanOrEqual(0.1);
  });

  it('fatiga. Sin falsos positivos de más y con la sensibilidad que reporta el informe', () => {
    expect(report.fatigue.falsePositiveRate).toBeLessThanOrEqual(0.1);
    expect(report.fatigue.sensitivity).toBeGreaterThanOrEqual(0.6);
  });

  it.runIf(process.env.RECOVERY_REPORT === '1')('escribe el informe con 3 semillas', () => {
    const reports = [report, run('recuperacion-2'), run('recuperacion-3')];
    const path = join(import.meta.dirname, '..', '..', 'docs', 'recovery-report.md');
    writeFileSync(
      path,
      renderRecoveryReport(reports, ['recuperacion-1', 'recuperacion-2', 'recuperacion-3']),
    );
  });
});
