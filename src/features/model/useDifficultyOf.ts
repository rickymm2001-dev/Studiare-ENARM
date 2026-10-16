// La dificultad que usa la app para cada pregunta que el alumno contestó (B14, 4.4 del plan de B14). Con el
// banco de la nube sale del catálogo, cuya fila trae la calibración de la noche (calibration) con el id de
// la versión que se calibró, y solo vale si es la versión publicada. En la demostración sale de itemStats,
// que se arma con los alumnos simulados. Una pregunta sin calibración medida, o extrema, queda con la
// estimada por el médico. Mientras llega, todo vale la del médico.
import { useMemo } from 'react';
import { useDataApi, type DataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { CalibrationState, CatalogCalibration } from '@/data/model/contracts';
import type { Question } from '@/data/schemas/bank';
import type { CatalogEntry } from '@/data/schemas/bankCloud';
import {
  physicianDifficultyOf,
  type DifficultyOf,
  type QuestionDifficulty,
} from '@/engines/studentModel';
import type { BankLookup } from '@/engines/insightFacts';
import { useQuestionSourceKind } from '../shared/questionSourceKind';

type Api = Pick<DataApi, 'repos'>;

const MEASURED: ReadonlySet<CalibrationState> = new Set(['provisional', 'calibrated']);

/** La calibración de la noche de una fila del catálogo, si es de la versión publicada y se midió */
export function catalogDifficulty(entry: {
  versionId: string;
  calibration?: CatalogCalibration | null | undefined;
}): QuestionDifficulty | null {
  const calibration = entry.calibration;
  if (
    calibration?.versionId !== entry.versionId ||
    !MEASURED.has(calibration.state) ||
    calibration.extreme ||
    calibration.difficulty === null ||
    !Number.isFinite(calibration.difficulty)
  ) {
    return null;
  }
  return {
    logit: calibration.difficulty,
    state: calibration.state,
    students: calibration.students,
  };
}

/** Lo que dice la caché de estadísticas de la demostración de una pregunta */
export function cacheDifficulty(stats: {
  raschDifficulty: number | null;
  calibration: CalibrationState;
  responses: number;
}): QuestionDifficulty | null {
  if (
    !MEASURED.has(stats.calibration) ||
    stats.raschDifficulty === null ||
    !Number.isFinite(stats.raschDifficulty)
  ) {
    return null;
  }
  return { logit: stats.raschDifficulty, state: stats.calibration, students: stats.responses };
}

/** La dificultad medida de cada versión de pregunta que tiene una. Las demás no aparecen */
export async function loadMeasuredDifficulties(
  api: Api,
  kind: 'cloud' | 'local',
  questions: readonly Question[],
): Promise<ReadonlyMap<string, QuestionDifficulty>> {
  const found = await Promise.all(
    questions.map(async (question) => {
      if (kind === 'cloud') {
        // La llave calibration la suma el catálogo de B14. Una fila sin ella no trae calibración
        const entry: (CatalogEntry & { calibration?: CatalogCalibration | null }) | undefined =
          await api.repos.catalog.getByVersion(question.id);
        return [question.id, entry ? catalogDifficulty(entry) : null] as const;
      }
      const stats = await api.repos.caches.itemStats.get(question.id);
      return [question.id, stats ? cacheDifficulty(stats) : null] as const;
    }),
  );
  return new Map(
    found.flatMap(([id, difficulty]) => (difficulty === null ? [] : [[id, difficulty] as const])),
  );
}

/**
 * La función que da la dificultad de una pregunta contestada, o undefined mientras carga. Cambia solo
 * cuando cambia el banco o lo calibrado
 */
export function useDifficultyOf(bank: BankLookup | undefined): DifficultyOf | undefined {
  const api = useDataApi();
  const kind = useQuestionSourceKind();
  const measured = useLiveData(
    () =>
      bank === undefined
        ? Promise.resolve(undefined)
        : loadMeasuredDifficulties(api, kind === 'cloud' ? 'cloud' : 'local', [
            ...bank.questions.values(),
          ]),
    [api.repos, kind, bank],
  );
  return useMemo<DifficultyOf | undefined>(
    () =>
      measured === undefined
        ? undefined
        : (question) => measured.get(question.id) ?? physicianDifficultyOf(question),
    [measured],
  );
}
