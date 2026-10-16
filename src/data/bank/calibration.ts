// Dificultad que usa la app (B14, 4.4 del plan de B14). Cada pregunta del catálogo puede traer lo que
// calculó la noche (calibration, 1.6). Con la calibración de la versión publicada en provisional o
// calibrada se usa la dificultad de Rasch, que sale de las respuestas de los alumnos. Si no, la del
// médico, llevada a logits. Una pregunta que todos aciertan o todos fallan no tiene estimación finita y
// se queda con la del médico. Los filtros de dificultad de Simular, la tarjeta Dificultad de Progreso, el
// ajuste por dificultad de la fatiga y el modo adaptativo usan esta misma función, así una pregunta Media
// es la misma en todos lados.
import { physicianToLogit } from '@/engines/difficulty';
import type { CalibrationState, CatalogCalibration } from '../model/contracts';
import type { CatalogEntry } from '../schemas/bankCloud';

export interface EffectiveDifficulty {
  /** La dificultad en logits que usa la app */
  logit: number;
  /**
   * De dónde sale. physician_estimate es la del médico, provisional y calibrated son la de Rasch. Con
   * eso la app dice Estimada por el médico, Provisional con N alumnos o Calibrada con N alumnos
   */
  source: CalibrationState;
  /** Alumnos distintos con primer intento detrás de la calibración de esta versión. 0 si no hay */
  students: number;
}

/** Lo que hace falta de una pregunta para saber su dificultad. Una fila del catálogo lo cumple */
export type DifficultySubject = Pick<CatalogEntry, 'versionId' | 'difficulty' | 'calibration'>;

/**
 * La calibración de la fila si es de la versión publicada. bank_publish no la toca al publicar otra
 * versión, así que la de una versión vieja se ignora hasta que la noche calcule la nueva
 */
export function calibrationOf(
  entry: Pick<CatalogEntry, 'versionId' | 'calibration'>,
): CatalogCalibration | null {
  const { calibration } = entry;
  return calibration?.versionId === entry.versionId ? calibration : null;
}

/** Si la dificultad sale de las respuestas de los alumnos y no del médico */
export const isMeasured = (source: CalibrationState) =>
  source === 'provisional' || source === 'calibrated';

export function effectiveDifficulty(entry: DifficultySubject): EffectiveDifficulty {
  const calibration = calibrationOf(entry);
  if (
    calibration &&
    isMeasured(calibration.state) &&
    !calibration.extreme &&
    calibration.difficulty !== null &&
    Number.isFinite(calibration.difficulty)
  ) {
    return {
      logit: calibration.difficulty,
      source: calibration.state,
      students: calibration.students,
    };
  }
  return {
    logit: physicianToLogit(entry.difficulty),
    source: 'physician_estimate',
    students: calibration?.students ?? 0,
  };
}

/**
 * La dificultad de una pregunta del pool. La de Rasch si la fuente la calculó (el catálogo de la nube) y
 * si no la del médico, que es lo único que tiene el banco de demostración
 */
export function poolDifficulty(question: {
  physicianDifficulty: number;
  effectiveDifficulty?: EffectiveDifficulty | undefined;
}): EffectiveDifficulty {
  return (
    question.effectiveDifficulty ?? {
      logit: physicianToLogit(question.physicianDifficulty),
      source: 'physician_estimate',
      students: 0,
    }
  );
}

/**
 * La dificultad de una pregunta sin fila del catálogo, la del banco de demostración, a partir de lo que
 * calculó la cohorte simulada (itemStatsCache). Con el estado de PC 5.5 en provisional o calibrada y una
 * estimación de Rasch se usa la de Rasch. Si no, la del médico
 */
export function effectiveDifficultyFromStats(
  physicianDifficulty: number,
  stats:
    | { calibration: CalibrationState; raschDifficulty: number | null; responses: number }
    | undefined,
): EffectiveDifficulty {
  if (
    stats &&
    isMeasured(stats.calibration) &&
    stats.raschDifficulty !== null &&
    Number.isFinite(stats.raschDifficulty)
  ) {
    return {
      logit: stats.raschDifficulty,
      source: stats.calibration,
      students: stats.responses,
    };
  }
  return {
    logit: physicianToLogit(physicianDifficulty),
    source: 'physician_estimate',
    students: stats?.responses ?? 0,
  };
}

/**
 * El nivel del 1 al 5 de la escala del médico que corresponde a una dificultad en logits. Es el redondeo
 * de la inversa de physicianToLogit, así la dificultad del médico vuelve a su mismo nivel y los grupos
 * Fácil, Media y Difícil de Simular y de Progreso siguen siendo los mismos
 */
export function effectiveLevel(difficulty: Pick<EffectiveDifficulty, 'logit'>): 1 | 2 | 3 | 4 | 5 {
  const level = Number.isFinite(difficulty.logit) ? Math.round(difficulty.logit) + 3 : 3;
  return Math.min(5, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5;
}
