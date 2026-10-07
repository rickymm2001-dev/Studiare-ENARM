// Práctica en curso del simulador. Vive en memoria mientras el alumno pasa de la pregunta a la
// retroalimentación y al resumen (pantallas 4, 5 y 6).
import { create } from 'zustand';

export type McqConfidence = 'guessed' | 'unsure' | 'sure';

export interface PracticeAnswer {
  questionVersionId: string;
  optionVersionId: string;
  correct: boolean;
  /** null si no se preguntó. La pregunta de seguridad viene apagada (D-087) */
  confidence: McqConfidence | null;
  msToAnswer: number;
  xp: number;
  /** Opciones mostradas en orden */
  shownOptionIds: string[];
  /** Opciones que descartó antes de responder */
  eliminatedOptionIds: string[];
  /** Posición, desde 0, en que cayó la correcta. Sirve para repartirla parejo en las siguientes */
  correctPosition: number;
  /** La pregunta fallada quedó en Mis errores para el repaso */
  sentToReview: boolean;
}

export interface PracticeState {
  sessionId: string | null;
  userId: string | null;
  questionIds: string[];
  index: number;
  answers: PracticeAnswer[];
  startedAt: number;
  /** Ya se registró el fin de la sesión */
  ended: boolean;
  /** Práctica libre o duelo de Party. Es el tipo de sesión que queda en la bitácora */
  kind: 'practice' | 'challenge';
  /** El duelo que se juega. null en una práctica libre */
  duelId: string | null;
  /** Trampas a las que el alumno dirigió las opciones. Vacío es el muestreo variado */
  targetTags: string[];
  set: (patch: Partial<Omit<PracticeState, 'set'>>) => void;
}

export const usePractice = create<PracticeState>()((set) => ({
  sessionId: null,
  userId: null,
  questionIds: [],
  index: 0,
  answers: [],
  startedAt: 0,
  ended: false,
  kind: 'practice',
  duelId: null,
  targetTags: [],
  set: (patch) => {
    set(patch);
  },
}));

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Hora actual. Fuera del render para que React no la marque como cálculo impuro */
export function clock(): number {
  return Date.now();
}
