// Umbrales de la revisión de calidad de tarjetas y de la detección de duplicados (Fase C2, etapa 1,
// fila 9 de la tabla de controversias de D-085). Los lee el motor src/engines/cardQuality.ts y los
// recibe como parámetro, así que más adelante se podrán editar desde admin igual que
// src/config/thresholds.ts. La marca entre paréntesis es la de la especificación, (J) es juicio de
// diseño ajustable.
//
// De dónde salen los números
//   La guía de Anki que compartió Ricardo pide tarjetas cortas, de una sola idea y sin duplicados.
//   Eso es el principio de mínima información que repiten casi todas las guías de Anki y que
//   Wozniak formuló en sus reglas para formular conocimiento. Pide preguntas breves, respuestas de
//   una o pocas palabras, evitar enumeraciones largas, un hueco cloze por dato y dar contexto
//   suficiente para que la pregunta tenga una sola respuesta. La guía no fija cifras, así que cada
//   cifra de abajo es un juicio (J) y se puede ajustar con datos reales.
//
// Cómo se leen
//   - Cada límite tiene dos escalones. Pasar max da una sugerencia (note) y pasar hardMax da un
//     aviso (warning). Ninguno bloquea guardar, porque el proyecto acepta tarjetas imperfectas a
//     propósito y el alumno decide
//   - Las palabras son las que ve el alumno. El HTML y las marcas de cloze no cuentan
import { z } from 'zod';

/** Un límite con dos escalones, max para la sugerencia y hardMax para el aviso */
function limit(max: number, hardMax: number) {
  return z
    .strictObject({
      max: z.int().nonnegative().default(max),
      hardMax: z.int().nonnegative().default(hardMax),
    })
    .refine((value) => value.hardMax >= value.max, {
      message: 'hardMax no puede ser menor que max',
      path: ['hardMax'],
    });
}

export const CardQualityConfigSchema = z.strictObject({
  /**
   * Palabras de la pregunta de una tarjeta básica. Una pregunta de ENARM bien armada cabe en una
   * línea, "¿Cuál es el tratamiento de primera línea de la preeclampsia severa?" tiene 11. Un caso
   * clínico corto de dos frases ronda las 25 y es válido, así que se sugiere desde 30 y se avisa
   * desde 60, donde ya es un caso completo y no una tarjeta (J)
   */
  frontWords: limit(30, 60),
  /**
   * Palabras de la respuesta. Lo ideal es un dato o una frase corta, de 1 a 10 palabras. Se sugiere
   * recortar desde 25, que es una oración larga, y se avisa desde 50, que ya es un párrafo (J)
   */
  backWords: limit(25, 50),
  /**
   * Palabras del texto de un cloze, con las respuestas de los huecos incluidas. Una oración cloze
   * típica tiene de 12 a 25 palabras. Cabe más que en una pregunta porque el texto es pregunta y
   * respuesta a la vez, y por eso 35 y 70 (J)
   */
  clozeTextWords: limit(35, 70),
  /**
   * Elementos que enumera una respuesta o un hueco. Desde 4 es tarjeta de lista, la misma cifra
   * que usa el tutor en listCardItems (7.9), así que se permiten 3. Con más de 7 la lista casi
   * nunca se recuerda completa y se avisa (J)
   */
  listItems: limit(3, 7),
  /**
   * Huecos distintos (c1, c2, ...) en un mismo texto cloze. Cada número genera una tarjeta y con
   * más de 3 el texto deja de ser una frase con un dato clave y se vuelve una lista disfrazada (J)
   */
  clozeHoles: limit(3, 6),
  /**
   * Palabras que esconde un hueco. Un hueco debe ser el dato clave, de 1 a 3 palabras. Se tolera
   * hasta 5, por ejemplo "diabetes mellitus tipo 2", y desde 12 se esconde una frase completa (J)
   */
  holeAnswerWords: limit(5, 12),
  /** Oraciones de la respuesta o del texto antes de avisar de varias ideas, 3 o más (J) */
  sentences: limit(2, 4),
  /** Líneas o párrafos que no son una lista, tres o más suelen ser ideas distintas (J) */
  lines: limit(3, 6),
  /**
   * Contexto de un hueco, medido en palabras de al menos contextWordChars letras que quedan visibles
   * cuando ese hueco está tapado. Con menos de min la pregunta es ambigua y sin ninguna (hardMin) el
   * hueco no pregunta nada. Se sugiere desde menos de 3 palabras (J)
   */
  context: z
    .strictObject({
      min: z.int().nonnegative().default(3),
      hardMin: z.int().nonnegative().default(1),
      /** Las palabras más cortas, como el, un o es, no explican de qué se trata (J) */
      wordChars: z.int().positive().default(3),
    })
    .refine((value) => value.hardMin <= value.min, {
      message: 'hardMin no puede ser mayor que min',
      path: ['hardMin'],
    }),
  /**
   * Una respuesta más corta que esto no se busca dentro de la pregunta, porque "no" o "sí" están
   * en casi todo y avisar siempre sería ruido (J)
   */
  leakMinChars: z.int().positive().default(3),
  /** Una línea de hasta 8 palabras, en un texto de 3 o más líneas, se toma como elemento de lista (J) */
  listLineWords: z.int().positive().default(8),
  /** Un fragmento de hasta 5 palabras entre comas se toma como elemento de una enumeración (J) */
  inlineItemWords: z.int().positive().default(5),
  duplicates: z.strictObject({
    /**
     * Similitud de Jaccard sobre palabras desde la que dos tarjetas son casi iguales. Con 0.85
     * hace falta compartir casi todo el texto, así que una pregunta con una sola palabra distinta
     * en una frase corta no cuenta y una reformulación mínima sí (J)
     */
    nearSimilarity: z.number().gt(0).max(1).default(0.85),
    /** Cuántas coincidencias de cada tipo se devuelven, para una lista breve en pantalla (J) */
    maxMatches: z.int().positive().default(5),
  }),
});

export type CardQualityConfig = z.infer<typeof CardQualityConfigSchema>;

export const DEFAULT_CARD_QUALITY: CardQualityConfig = CardQualityConfigSchema.parse({
  frontWords: {},
  backWords: {},
  clozeTextWords: {},
  listItems: {},
  clozeHoles: {},
  holeAnswerWords: {},
  sentences: {},
  lines: {},
  context: {},
  duplicates: {},
});
