// Lo que la demostración enseña de la comparación y de la población (B14, 4.7 del plan de B14). Genera una
// cohorte chica de alumnos simulados con la misma semilla de la demostración, la convierte en lo que exporta
// la base y corre los mismos motores de la noche (runCalibration), así las celdas y la línea base que ve
// quien prueba la app son las que publicaría la calibración con esos alumnos. Todo es simulado y nunca se
// mezcla con datos reales. Cuesta unos segundos, por eso corre en el worker de simulación y la app guarda
// el resultado (src/features/model/demoSnapshots.ts).
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import type { TopicTaxonomy } from '@/data/schemas/content';
import type { ComparisonCellResult, PopulationData } from '@/engines/calibration/types';
import { runCalibration } from '@/engines/calibration/run';
import type { DemoBank } from '../content/bank';
import { calibrationInputFromCohort } from './calibrationInput';
import { generateCohort } from './cohort';

export interface DemoSnapshotRequest {
  /** La semilla de la demostración, así los alumnos son los primeros de su cohorte */
  seed: string;
  /** Alumnos de la cohorte comparada */
  size: number;
  /** Días de estudio simulados. Con 31 alcanza para la ventana de 30 de la comparación */
  days: number;
  /** Último día de estudio de los alumnos simulados. El corte es el día siguiente */
  endDay: string;
}

export interface DemoSnapshotData {
  /** El día de estudio del corte, AAAA-MM-DD */
  asOfDay: string;
  students: number;
  population: PopulationData;
  /** Las celdas de Todos y de cada especialidad, con sus cortes si el grupo llegó a 30 */
  comparison: ComparisonCellResult[];
}

/** Las especialidades de la cohorte: 60% cirugía general, 20% pediatría y el resto sin elegir */
export function demoSpecialtyOf(size: number): (index: number) => string | null {
  return (index) =>
    index < Math.floor(size * 0.6)
      ? 'general_surgery'
      : index < Math.floor(size * 0.8)
        ? 'pediatrics'
        : null;
}

export function buildDemoSnapshotData(
  request: DemoSnapshotRequest,
  bank: DemoBank,
  taxonomy: TopicTaxonomy,
): DemoSnapshotData {
  const cohort = generateCohort(bank, taxonomy, {
    seed: request.seed,
    size: request.size,
    days: request.days,
    endDay: request.endDay,
    simulateCards: false,
  });
  const input = calibrationInputFromCohort(cohort, bank, {
    endDay: request.endDay,
    seed: request.seed,
    specialtyOf: demoSpecialtyOf(request.size),
  });
  const output = runCalibration({ ...input, settings: FACTORY_MODEL_SETTINGS });
  return {
    asOfDay: input.asOfDay,
    students: request.size,
    population: output.population,
    comparison: output.comparison,
  };
}
