/**
 * La calibración nocturna completa (B14, 3.2 a 3.9 del plan de B14).
 *
 * Qué hace. Es el único punto de entrada de los motores de la noche. Recibe todo lo que exportó la base
 * de los alumnos con permiso y devuelve lo que se publica, la dificultad de cada versión, las
 * exposiciones de cada opción, la población, los cortes de la comparación, el acuerdo del etiquetado y
 * los conteos. Es pura y determinista: la misma entrada da la misma salida, sin reloj ni azar. La corre
 * scripts/calibration/pipeline.ts en GitHub Actions y la corre el autotest contra una base temporal.
 * Entradas. CalibrationInput.
 * Salidas. CalibrationOutput. Los conteos solo llevan números y códigos (3.11).
 * Método. Primeros intentos con la defensa contra datos falsos, dificultad con Rasch y Elo, opciones,
 * validación del detector de fatiga, población, comparación y acuerdo, en ese orden.
 */
import { computePairAgreement } from '@/engines/agreement';
import { buildComparisonCells } from './comparisonCells';
import { validateFatigue } from './fatigueValidation';
import { selectFirstAttempts } from './firstAttempts';
import { calibrateItems } from './items';
import { tallyExposures } from './options';
import { buildPopulation } from './population';
import type { AgreementData, BankItemRow, CalibrationInput, CalibrationOutput } from './types';

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

export function runCalibration(input: CalibrationInput): CalibrationOutput {
  const bank: ReadonlyMap<string, BankItemRow> = new Map(
    input.bank.map((item) => [item.versionId, item]),
  );
  const maxDaily = input.settings.thresholds.maxDailyFirstAttempts;

  const { attempts, counts: attemptCounts } = selectFirstAttempts({
    answers: input.answers,
    bank,
    exposures: input.exposures,
    thresholds: input.thresholds,
    maxDailyFirstAttempts: maxDaily,
  });
  const { items: rawItems, counts: itemCounts } = calibrateItems({
    attempts,
    bank,
    thresholds: input.thresholds,
    settings: input.settings,
  });
  const { options, variantReady } = tallyExposures({
    attempts,
    bank,
    thresholds: input.thresholds,
  });
  const items = rawItems.map((item) =>
    item.variantReady === null
      ? item
      : { ...item, variantReady: variantReady.get(item.versionId) ?? false },
  );

  const fatigue = validateFatigue({
    asOfDay: input.asOfDay,
    answers: input.answers,
    bank,
    exposures: input.exposures,
    motives: input.motives,
    thresholds: input.thresholds,
    settings: input.settings,
  });
  const { population, counts: populationCounts } = buildPopulation({
    attempts,
    answers: input.answers,
    exposures: input.exposures,
    motives: input.motives,
    items,
    bank,
    fatigue,
    thresholds: input.thresholds,
    settings: input.settings,
  });
  const { cells, counts: comparisonCounts } = buildComparisonCells({
    asOfDay: input.asOfDay,
    people: input.people,
    answers: input.answers,
    activity: input.activity,
    bank,
    settings: input.settings,
  });

  const report = computePairAgreement(
    input.labelPairs.map((pair) => ({ authorTag: pair.authorTag, reviewerTag: pair.reviewerTag })),
    input.thresholds.bias,
  );
  const agreement: AgreementData = {
    pairs: report.pairs,
    kappa: report.global?.kappa ?? null,
    observed: report.global?.observedAgreement ?? null,
    expected: report.global?.expectedAgreement ?? null,
    byTag: Object.fromEntries(
      Object.entries(report.byTag).map(([tag, result]) => [
        tag,
        result === null ? null : round4(result.kappa),
      ]),
    ),
  };

  const counts: Record<string, number | string> = {
    consenters: input.people.length,
    ...attemptCounts,
    ...itemCounts,
    ...comparisonCounts,
    ...populationCounts,
    itemRows: items.length,
    optionRows: options.length,
    variantsReady: items.filter((item) => item.variantReady === true).length,
    itemsPhysicianEstimate: population.items.physician_estimate,
    itemsProvisional: population.items.provisional,
    itemsCalibrated: population.items.calibrated,
    fatigueState: fatigue.state,
    fatigueStudents: fatigue.students,
    fatigueLongSessions: fatigue.longSessions,
    fatigueMotiveReports: fatigue.motiveReports,
    agreementPairs: agreement.pairs,
  };
  return { items, options, population, comparison: cells, agreement, fatigue, counts };
}
