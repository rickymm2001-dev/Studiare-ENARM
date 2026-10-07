// Preguntas sintéticas para probar la forma del banco, no su contenido. Las genera el código con
// textos neutros como Opción A, nunca con medicina inventada. Solo las usan las pruebas. Sirven para
// revisar que todo siga bien con 4, 5, 6 o 10 opciones (D-080 y la reunión del equipo de octubre).
import type { DemoQuestion, DemoQuestionBatch } from '../schemas/content';
import { taggableBiasKeys, topicTaxonomy } from '@/demo/content';

const OPTION_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'] as const;

/** Rama, tema y subtema que existen en la taxonomía, para que la pregunta valide contra ella */
function firstPlace() {
  const branch = topicTaxonomy.branches[0];
  const topic = branch?.topics[0];
  const subtopic = topic?.subtopics[0];
  if (!branch || !topic || !subtopic) throw new Error('La taxonomía de temas está vacía');
  return { branch: branch.key, topic: topic.key, subtopic: subtopic.key };
}

export interface SyntheticOptions {
  /** Posición de la correcta, de 0 a la cantidad de opciones menos 1. Por defecto la primera */
  correctIndex?: number;
  /** Número de la pregunta dentro del lote, para su clave bN-qNN */
  number?: number;
  batch?: number;
}

/**
 * Una pregunta válida con la cantidad de opciones que pida la prueba. Cada distractor lleva uno de
 * los sesgos que se pueden etiquetar, por turnos, y el set canónico es la correcta con los tres
 * primeros distractores
 */
export function makeSyntheticQuestion(
  optionCount: number,
  options: SyntheticOptions = {},
  overrides: Partial<DemoQuestion> = {},
): DemoQuestion {
  if (!Number.isInteger(optionCount) || optionCount < 1 || optionCount > OPTION_KEYS.length)
    throw new RangeError(`Cantidad de opciones fuera de rango ${optionCount}`);
  const keys = OPTION_KEYS.slice(0, optionCount);
  const correctIndex = options.correctIndex ?? 0;
  const biases = [...taggableBiasKeys];
  let distractor = 0;
  const rows = keys.map((key, index) => {
    const letter = key.toUpperCase();
    if (index === correctIndex)
      return { key, text: `Opción ${letter}`, correct: true, rationale: `Justificación ${letter}` };
    const bias = biases[distractor % biases.length] as string;
    distractor += 1;
    return {
      key,
      text: `Opción ${letter}`,
      correct: false,
      bias,
      rationale: `Justificación ${letter}`,
    };
  });
  const canonical = [
    keys[correctIndex] as string,
    ...keys.filter((_, index) => index !== correctIndex).slice(0, 3),
  ];
  const number = String(options.number ?? 1).padStart(2, '0');
  return {
    key: `b${options.batch ?? 1}-q${number}`,
    caseKey: null,
    caseOrder: null,
    ...firstPlace(),
    vignette: 'Escribe aquí el caso clínico de prueba.',
    prompt: 'Pregunta de prueba sobre la forma del banco.',
    polarity: 'affirmative',
    task: 'diagnosis',
    difficulty: 3,
    options: rows,
    canonical,
    explanation: Array.from({ length: 100 }, () => 'palabra').join(' '),
    gpcRefs: ['Guía de práctica clínica de prueba'],
    ...overrides,
  };
}

/** Un lote con una pregunta por cada cantidad de opciones, con claves b1-q01, b1-q02... */
export function makeSyntheticBatch(optionCounts: readonly number[]): DemoQuestionBatch {
  return {
    batch: 1,
    status: 'pending_physician_review',
    cases: [],
    questions: optionCounts.map((count, index) =>
      makeSyntheticQuestion(count, { number: index + 1, correctIndex: index % count }),
    ),
  };
}
