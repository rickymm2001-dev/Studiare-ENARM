// Recuperación de parámetros (14.2) con 300 alumnos simulados y los motores reales (src/demo/generator).
// Con RECOVERY_REPORT=1 (npm run recovery-report) corre 9 escenarios y escribe docs/recovery-report.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildDemoBank } from '@/demo/content/bank';
import { topicTaxonomy } from '@/demo/content';
import { generateCohort, simItemsFrom } from '@/demo/generator/cohort';
import { DEFAULT_MIX, GENERATOR_VERSION, type CohortMix } from '@/demo/generator/model';
import { computeRecovery, type RecoveryReport } from '@/demo/generator/recovery';
import { renderRecoveryReport, versionLine } from '@/demo/generator/recoveryReport';

const REPORT_PATH = join(import.meta.dirname, '..', '..', 'docs', 'recovery-report.md');
const bank = buildDemoBank();
const items = simItemsFrom(bank);
const run = (seed: string, mix: CohortMix = DEFAULT_MIX): RecoveryReport =>
  computeRecovery(
    generateCohort(bank, topicTaxonomy, {
      seed,
      size: 300,
      days: 90,
      endDay: '2026-10-01',
      simulateCards: false,
      mix,
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

  it('sesgos. Ambos métodos detectan y la variante propuesta cumple la meta de falsos positivos (D-051)', () => {
    // El método de 7.4 se reporta sin exigir su tasa de falsos positivos (ver el informe)
    expect(report.bias.sensitivity).toBeGreaterThanOrEqual(0.8);
    expect(report.bias.errorShareCorrected.sensitivity).toBeGreaterThanOrEqual(0.8);
    expect(report.bias.errorShareCorrected.falsePositiveRate).toBeLessThanOrEqual(0.1);
  });

  it('fatiga. Sin falsos positivos de más y con la sensibilidad que reporta el informe', () => {
    expect(report.fatigue.falsePositiveRate).toBeLessThanOrEqual(0.1);
    expect(report.fatigue.sensitivity).toBeGreaterThanOrEqual(0.5);
  });

  it.runIf(process.env.RECOVERY_REPORT !== '1')(
    'el informe corresponde a la versión actual del generador',
    () => {
      expect(readFileSync(REPORT_PATH, 'utf8')).toContain(versionLine(GENERATOR_VERSION));
    },
  );

  it.runIf(process.env.RECOVERY_REPORT === '1')('escribe el informe', { timeout: 900_000 }, () => {
    const design = ['recuperacion-1', 'recuperacion-2', 'recuperacion-3'];
    const fresh = ['validacion-4', 'validacion-5', 'validacion-6'];
    const lure = { ...DEFAULT_MIX, biasModel: 'lure' as const };
    writeFileSync(
      REPORT_PATH,
      renderRecoveryReport([
        {
          title: 'Semillas de diseño',
          description:
            'Las semillas con que se vieron los primeros resultados y se diseñó la variante de sesgos.',
          seeds: design,
          reports: [report, ...design.slice(1).map((seed) => run(seed))],
        },
        {
          title: 'Semillas nuevas',
          description: 'Semillas que no se miraron al diseñar la variante, con el mismo modelo.',
          seeds: fresh,
          reports: fresh.map((seed) => run(seed)),
        },
        {
          title: 'Modelo de sesgo distinto (lure)',
          description:
            'Semillas nuevas con un sesgo que solo atrae cuando el alumno sabía la respuesta.',
          seeds: fresh,
          reports: fresh.map((seed) => run(seed, lure)),
        },
      ]),
    );
  });
});
