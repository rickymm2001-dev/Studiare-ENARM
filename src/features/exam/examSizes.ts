// Tamaños de examen que ofrece la tarjeta de Simular según lo que permite el plan y lo que le queda
// al alumno hoy. Funciones puras para probarlas sin React.
import { EXAM_SIZES } from '@/engines/exam';

/** El examen de 280 es de los planes de pago. Los demás tamaños son de todos */
export function allowedExamSizes(fullExam: boolean): number[] {
  return EXAM_SIZES.filter((option) => option !== 280 || fullExam);
}

/**
 * Tamaño con el que arranca la tarjeta. El examen completo de 280 si el plan lo permite (D-012) y,
 * si no, el mayor que cabe en las preguntas que le quedan hoy. Si ninguno cabe, el más chico, y la
 * tarjeta dice que se limita a lo que le queda
 */
export function defaultExamSize(fullExam: boolean, left: number | null): number {
  const allowed = allowedExamSizes(fullExam);
  const fitting = allowed.filter((option) => left === null || option <= left);
  return fitting.at(-1) ?? allowed[0] ?? EXAM_SIZES[0];
}
