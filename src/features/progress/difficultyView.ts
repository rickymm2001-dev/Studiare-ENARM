// Cómo le va al alumno según la dificultad de la pregunta (7.7, pantalla 10). Agrupa sus respuestas por la
// dificultad que usa la app, con los mismos grupos del filtro de Simular, y cada grupo muestra calibrando
// hasta tener respuestas suficientes para que su exactitud diga algo. La dificultad empieza con la que
// estimó el médico y, cuando bastantes alumnos contestan una pregunta, se mide con ellos (B14, 4.4). Cada
// grupo dice de dónde salió la dificultad de sus respuestas. Una respuesta sin dificultad medida se agrupa
// por el nivel del médico, que da los mismos grupos de siempre.
import type { CalibrationState } from '@/data/model/contracts';
import { DIFFICULTY_GROUPS, difficultyGroupOf, type DifficultyGroup } from '../shared/difficulty';

/**
 * El grupo de una dificultad medida en logits. El nivel 3 del médico es 0, el 2 es −1 y el 4 es 1, así que
 * los cortes en −0.5 y 0.5 dan exactamente los grupos del médico: Fácil de 1 a 2, Media 3 y Difícil de 4 a 5
 */
export function groupOfLogit(logit: number): DifficultyGroup {
  if (logit < -0.5) return 'easy';
  return logit <= 0.5 ? 'medium' : 'hard';
}

export interface DifficultyRow {
  group: DifficultyGroup;
  total: number;
  correct: number;
  /** null mientras el grupo calibra */
  accuracy: number | null;
  /** Respuestas que faltan para mostrar la exactitud. 0 cuando ya se muestra */
  responsesNeeded: number;
  /** Cuántas respuestas del grupo tienen la dificultad del médico y cuántas una medida con alumnos */
  sources: { physician: number; provisional: number; calibrated: number };
}

export function difficultyRows(input: {
  /** Respuestas con el nivel que estimó el médico, de 1 a 5, y la dificultad medida si la hay */
  responses: readonly {
    level: number;
    correct: boolean;
    measured?: { logit: number; state: CalibrationState } | undefined;
  }[];
  /** Respuestas por grupo para mostrar su exactitud */
  minResponses: number;
}): DifficultyRow[] {
  const tally = new Map(
    DIFFICULTY_GROUPS.map((group) => [
      group,
      { total: 0, correct: 0, physician: 0, provisional: 0, calibrated: 0 },
    ]),
  );
  for (const response of input.responses) {
    if (!Number.isInteger(response.level) || response.level < 1 || response.level > 5) continue;
    const measured = response.measured;
    const entry = tally.get(
      measured ? groupOfLogit(measured.logit) : difficultyGroupOf(response.level),
    );
    if (!entry) continue;
    entry.total += 1;
    if (response.correct) entry.correct += 1;
    if (measured?.state === 'provisional') entry.provisional += 1;
    else if (measured?.state === 'calibrated') entry.calibrated += 1;
    else entry.physician += 1;
  }
  return DIFFICULTY_GROUPS.map((group) => {
    const { total, correct, physician, provisional, calibrated } = tally.get(group) ?? {
      total: 0,
      correct: 0,
      physician: 0,
      provisional: 0,
      calibrated: 0,
    };
    const ready = total > 0 && total >= input.minResponses;
    return {
      group,
      total,
      correct,
      accuracy: ready ? correct / total : null,
      responsesNeeded: ready ? 0 : Math.max(input.minResponses - total, 1),
      sources: { physician, provisional, calibrated },
    };
  });
}
