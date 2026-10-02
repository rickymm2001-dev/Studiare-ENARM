/**
 * Calificación automática de preguntas de opción múltiple que entran al repaso (7.1).
 *
 * Qué hace. Convierte una respuesta de opción múltiple en una calificación de FSRS. Corrige por
 * adivinanza, porque con 4 opciones se acierta al azar 25% de las veces y un acierto adivinado no
 * prueba memoria (J).
 * Entradas. Si acertó, la confianza (Adiviné, Dudé, Seguro), si hubo adivinanza rápida, si fue más
 * rápido que su percentil 25 personal y cuántas veces cambió de respuesta.
 * Salidas. again, hard, good o easy, más la fila de la tabla que aplicó.
 * Método. Tabla de 7.1. Gana la primera fila que aplique
 *   1. Error → Otra vez
 *   2. Acierto con Adiviné → Otra vez
 *   3. Acierto con adivinanza rápida → Otra vez
 *   4. Acierto con Dudé sin adivinanza rápida → Difícil
 *   5. Acierto con Seguro, más rápido que su percentil 25 y sin cambios → Fácil
 *   6. Acierto con Seguro sin adivinanza rápida → Bien
 * Umbrales. Percentil 25 y adivinanza rápida los calcula el motor behavior.
 */

export type McqConfidence = 'guessed' | 'unsure' | 'sure';
export type FsrsRating = 'again' | 'hard' | 'good' | 'easy';

export interface McqGradeInput {
  correct: boolean;
  confidence: McqConfidence;
  rapidGuess: boolean;
  fasterThanP25: boolean;
  changeCount: number;
}

export interface McqGrade {
  rating: FsrsRating;
  /** Fila de la tabla de 7.1 que aplicó, de 1 a 6 */
  rule: 1 | 2 | 3 | 4 | 5 | 6;
}

export function gradeMcq(input: McqGradeInput): McqGrade {
  if (!Number.isInteger(input.changeCount) || input.changeCount < 0) {
    throw new RangeError(`changeCount debe ser un entero no negativo. Llegó ${input.changeCount}`);
  }
  if (!input.correct) return { rating: 'again', rule: 1 };
  if (input.confidence === 'guessed') return { rating: 'again', rule: 2 };
  if (input.rapidGuess) return { rating: 'again', rule: 3 };
  if (input.confidence === 'unsure') return { rating: 'hard', rule: 4 };
  if (input.fasterThanP25 && input.changeCount === 0) return { rating: 'easy', rule: 5 };
  return { rating: 'good', rule: 6 };
}
