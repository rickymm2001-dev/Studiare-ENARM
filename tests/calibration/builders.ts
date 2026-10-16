// Ayudas para armar a mano la entrada de los motores de la noche en las pruebas. Las filas son las que
// exportan las funciones calibration_*, con seudónimos y ids opacos. Nada de esto es contenido médico.
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import type {
  AnswerRow,
  BankItemRow,
  CalibrationInput,
  ExposureRow,
} from '@/engines/calibration/types';

/** Una pregunta de 4 opciones, A la correcta, y B, C y D con su etiqueta de sesgo */
export function bankItem(
  key: string,
  overrides: Partial<BankItemRow> = {},
  optionCount = 4,
): BankItemRow {
  const tags = ['anchoring', 'premature_closure', 'framing_effect', 'availability_heuristic'];
  const letters = 'ABCDEFGHIJ'.slice(0, optionCount).split('');
  return {
    versionId: `v-${key}`,
    questionId: `q-${key}`,
    branch: 'pediatrics',
    topic: 'neonatology',
    subtopic: 'neonatal_jaundice',
    language: 'es',
    physician: 3,
    variantOf: null,
    words: 60,
    current: true,
    canonical: letters.slice(0, 4).map((letter) => `o-${key}-${letter}`),
    options: letters.map((letter, index) => ({
      id: `o-${key}-${letter}`,
      correct: index === 0,
      tag: index === 0 ? null : (tags[(index - 1) % tags.length] as string),
      words: 8,
    })),
    previous: null,
    ...overrides,
  };
}

export const optionId = (key: string, letter: string) => `o-${key}-${letter}`;

export interface AnswerSpec {
  person: string;
  key: string;
  /** Letra de la opción elegida. A es la correcta */
  letter?: string;
  seq: number;
  daysBefore?: number;
  ms?: number | null;
  session?: string | null;
  minute?: number | null;
  sessionKind?: AnswerRow['sessionKind'];
  confidence?: AnswerRow['confidence'];
  changes?: number;
  versionKey?: string;
}

/** Una respuesta. El acierto sale de la letra, como lo deriva la base del banco */
export function answer(spec: AnswerSpec): AnswerRow {
  const letter = spec.letter ?? 'A';
  return {
    person: spec.person,
    session: spec.session === undefined ? `${spec.person}|s1` : spec.session,
    versionId: `v-${spec.versionKey ?? spec.key}`,
    optionId: optionId(spec.key, letter),
    correct: letter === 'A',
    sessionKind: spec.sessionKind === undefined ? 'practice' : spec.sessionKind,
    daysBefore: spec.daysBefore ?? 3,
    minute: spec.minute === undefined ? 5 : spec.minute,
    ms: spec.ms === undefined ? 40_000 : spec.ms,
    confidence: spec.confidence === undefined ? 'unsure' : spec.confidence,
    changes: spec.changes ?? 0,
    seq: spec.seq,
  };
}

/** La pantalla de opciones, A, B, C y D por omisión, un seq antes de la respuesta */
export function exposure(
  person: string,
  key: string,
  seq: number,
  letters: readonly string[] = ['A', 'B', 'C', 'D'],
  versionKey?: string,
): ExposureRow {
  return {
    person,
    versionId: `v-${versionKey ?? key}`,
    options: letters.map((letter) => optionId(key, letter)),
    seq,
  };
}

/** La entrada vacía con los ajustes y umbrales de fábrica. Se le pone encima lo que haga falta */
export function emptyInput(overrides: Partial<CalibrationInput> = {}): CalibrationInput {
  return {
    asOfDay: '2026-10-15',
    settings: FACTORY_MODEL_SETTINGS,
    thresholds: FACTORY_THRESHOLDS,
    bank: [],
    people: [],
    answers: [],
    exposures: [],
    activity: [],
    motives: [],
    labelPairs: [],
    ...overrides,
  };
}
