/**
 * Análisis de distractores (7.8).
 *
 * Qué hace. Mide cuánto atrae cada opción con su exposición y marca como no funcional el
 * distractor que casi nadie elige, para que el médico lo revise. En preguntas de 4 opciones solo
 * 13.8% tenía sus 3 distractores funcionando (V, Tarrant y colegas), así que se esperan muchos.
 * Entradas. Los sets que se mostraron y las opciones que se eligieron, por versión de opción, o
 * directamente las exposiciones y elecciones ya contadas.
 * Salidas. Por opción, exposiciones, elecciones, atracción con intervalo de Wilson y estado
 * (calibrando con cuánto falta, funcional o no funcional). Por pregunta, cuántos distractores
 * funcionan.
 * Método. Atracción = elecciones / exposiciones. No funcional si es menor a 5% con al menos 100
 * exposiciones. Con menos de 100 exposiciones el distractor sigue calibrando.
 * Umbrales. 5% y 100 exposiciones (J, criterio común en análisis de ítems).
 */
import type { Thresholds } from '@/config/thresholds';
import { wilsonInterval } from './stats/wilson';

export interface OptionTally {
  exposures: number;
  choices: number;
}

export type DistractorStatus =
  | { kind: 'calibrating'; exposuresNeeded: number }
  | { kind: 'functional' }
  | { kind: 'non_functional' }
  | { kind: 'correct_option' };

export interface OptionAnalysis extends OptionTally {
  optionId: string;
  attraction: number;
  lower: number;
  upper: number;
  status: DistractorStatus;
}

/** Cuenta exposiciones y elecciones por versión de opción */
export function tallyOptions(input: {
  shownSets: readonly (readonly string[])[];
  chosen: readonly string[];
}): Record<string, OptionTally> {
  const tallies: Record<string, OptionTally> = {};
  const entry = (id: string) => (tallies[id] ??= { exposures: 0, choices: 0 });
  for (const set of input.shownSets) for (const id of set) entry(id).exposures += 1;
  for (const id of input.chosen) entry(id).choices += 1;
  return tallies;
}

export function analyzeOption(
  optionId: string,
  isCorrect: boolean,
  tally: OptionTally,
  thresholds: Thresholds['sampling'],
): OptionAnalysis {
  if (tally.choices > tally.exposures) {
    throw new RangeError(`La opción ${optionId} se eligió más veces de las que se mostró`);
  }
  const interval = wilsonInterval(tally.choices, tally.exposures);
  let status: DistractorStatus;
  if (isCorrect) status = { kind: 'correct_option' };
  else if (tally.exposures < thresholds.nonFunctionalExposures) {
    status = {
      kind: 'calibrating',
      exposuresNeeded: thresholds.nonFunctionalExposures - tally.exposures,
    };
  } else if (interval.estimate < thresholds.nonFunctionalRate) status = { kind: 'non_functional' };
  else status = { kind: 'functional' };
  return {
    optionId,
    ...tally,
    attraction: interval.estimate,
    lower: interval.lower,
    upper: interval.upper,
    status,
  };
}

export interface QuestionDistractorReport {
  options: OptionAnalysis[];
  functional: number;
  nonFunctional: number;
  calibrating: number;
  /** Alerta para el banco del médico (10.2) */
  needsReview: boolean;
}

export function analyzeQuestionDistractors(
  options: readonly { id: string; isCorrect: boolean }[],
  tallies: Readonly<Record<string, OptionTally>>,
  thresholds: Thresholds['sampling'],
): QuestionDistractorReport {
  const analyzed = options.map((option) =>
    analyzeOption(
      option.id,
      option.isCorrect,
      tallies[option.id] ?? { exposures: 0, choices: 0 },
      thresholds,
    ),
  );
  const count = (kind: DistractorStatus['kind']) =>
    analyzed.filter((option) => option.status.kind === kind).length;
  const nonFunctional = count('non_functional');
  return {
    options: analyzed,
    functional: count('functional'),
    nonFunctional,
    calibrating: count('calibrating'),
    needsReview: nonFunctional > 0,
  };
}
