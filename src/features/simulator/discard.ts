// Qué podía descartar el alumno en una pregunta y qué descartó (D-080). Es lo que explica la
// retroalimentación de la práctica. Funciones puras, para probarlas sin React.
export interface DiscardOption {
  id: string;
  isCorrect: boolean;
}

export interface DiscardReview {
  /**
   * Opciones incorrectas que se podían descartar, en el orden en que se mostraron. No incluye la
   * que eligió, que ya tiene su propia explicación
   */
  couldDiscard: string[];
  /** Opciones incorrectas que sí descartó */
  discardedWrong: number;
  /** Opciones incorrectas que se mostraron, contando la que eligió */
  wrongShown: number;
  /** Descartó la correcta. Es el descarte que más cuesta */
  discardedCorrect: boolean;
}

export function discardReview(input: {
  /** Opciones en el orden en que se mostraron */
  shown: readonly DiscardOption[];
  /** Opciones que descartó */
  eliminated: readonly string[];
  /** Opción que eligió. null si la dejó en blanco */
  chosenId: string | null;
}): DiscardReview {
  const dropped = new Set(input.eliminated);
  const wrong = input.shown.filter((option) => !option.isCorrect);
  return {
    couldDiscard: wrong.filter((option) => option.id !== input.chosenId).map((option) => option.id),
    discardedWrong: wrong.filter((option) => dropped.has(option.id)).length,
    wrongShown: wrong.length,
    discardedCorrect: input.shown.some((option) => option.isCorrect && dropped.has(option.id)),
  };
}
