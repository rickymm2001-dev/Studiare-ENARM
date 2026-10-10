// Práctica en curso del simulador. Vive en memoria mientras el alumno pasa de la pregunta a la
// retroalimentación y al resumen (pantallas 4, 5 y 6). Además se guarda en la sesión de la pestaña, para
// que una recarga o un cierre por accidente a media práctica retome donde iba. Lo guardado son solo
// identificadores de preguntas y de opciones, nunca nombres, y desaparece al cerrar la pestaña.
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { z } from 'zod';

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

const answerSchema = z.object({
  questionVersionId: z.string(),
  optionVersionId: z.string(),
  correct: z.boolean(),
  confidence: z.enum(['guessed', 'unsure', 'sure']).nullable(),
  msToAnswer: z.number(),
  xp: z.number(),
  shownOptionIds: z.array(z.string()),
  eliminatedOptionIds: z.array(z.string()),
  correctPosition: z.number(),
  sentToReview: z.boolean(),
});

const savedPracticeSchema = z.object({
  sessionId: z.string().nullable(),
  userId: z.string().nullable(),
  questionIds: z.array(z.string()),
  index: z.number().int().min(0),
  answers: z.array(answerSchema),
  startedAt: z.number(),
  ended: z.boolean(),
  kind: z.enum(['practice', 'challenge']),
  duelId: z.string().nullable(),
  targetTags: z.array(z.string()),
});

export const PRACTICE_STORAGE_KEY = 'enarm.practice.v1';

/**
 * La sesión de la pestaña puede no estar disponible (modo privado, datos del sitio bloqueados) o llenarse.
 * En ese caso guardar no hace nada y la práctica sigue viviendo en memoria, en vez de romper la pregunta
 */
const tabSession: StateStorage = {
  getItem: (name) => {
    try {
      return sessionStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      sessionStorage.setItem(name, value);
    } catch {
      // Sin espacio o sin acceso. Se sigue en memoria
    }
  },
  removeItem: (name) => {
    try {
      sessionStorage.removeItem(name);
    } catch {
      // Igual que arriba
    }
  },
};

export const usePractice = create<PracticeState>()(
  persist(
    (set) => ({
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
    }),
    {
      name: PRACTICE_STORAGE_KEY,
      storage: createJSONStorage(() => tabSession),
      version: 1,
      partialize: ({ set: _set, ...saved }) => saved,
      // Lo guardado se revisa antes de usarlo. Si no cuadra con la forma esperada se descarta entero
      merge: (saved, current) => {
        const parsed = savedPracticeSchema.safeParse(saved);
        return parsed.success ? { ...current, ...parsed.data } : current;
      },
    },
  ),
);

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
