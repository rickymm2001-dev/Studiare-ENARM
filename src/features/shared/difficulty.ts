// Grupos de dificultad que ve el alumno, a partir de la dificultad que estimó el médico (1 a 5). Los
// comparten el filtro de Simular y la exactitud por dificultad de Progreso, para que una pregunta
// Media sea la misma en los dos lados.
export type DifficultyGroup = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_GROUPS: readonly DifficultyGroup[] = ['easy', 'medium', 'hard'];

/** Fácil es 1 a 2, Media es 3 y Difícil es 4 a 5 */
export function difficultyGroupOf(level: number): DifficultyGroup {
  if (level <= 2) return 'easy';
  return level === 3 ? 'medium' : 'hard';
}
