// Guarda el examen en curso en el navegador para reanudarlo tras una recarga. Vive en localStorage
// y no en la bitácora porque es estado de pantalla y no un hecho del alumno. Los hechos, como cada
// respuesta, se registran en la bitácora al ver la pregunta y al terminar. Si el contenido no es
// válido, se trata como si no hubiera examen.
import { ExamStateSchema, type ExamState } from './examState';

const storageKey = (userId: string) => `enarm.exam.v1.${userId}`;

type ReadStorage = Pick<Storage, 'getItem'>;

/**
 * Almacenamiento por defecto. Escribe siempre en memoria además de en localStorage, así si el
 * navegador bloquea el almacenamiento el examen sigue entre pantallas, aunque no sobreviva a una
 * recarga. Lo que se pasa a mano, como en las pruebas, se usa tal cual
 */
const memory = new Map<string, string>();
const defaultStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem(key) {
    try {
      const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
      if (stored !== null) return stored;
    } catch {
      // Bloqueado. Se usa lo que haya en memoria
    }
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    memory.set(key, value);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
      // Ventana privada o almacenamiento lleno. El examen sigue, pero no se podrá reanudar
    }
  },
  removeItem(key) {
    memory.delete(key);
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch {
      // Nada que limpiar
    }
  },
};

export function loadExamState(
  userId: string,
  storage: ReadStorage = defaultStorage,
): ExamState | null {
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = ExamStateSchema.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.userId === userId ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveExamState(
  state: ExamState,
  storage: Pick<Storage, 'setItem'> = defaultStorage,
): void {
  try {
    storage.setItem(storageKey(state.userId), JSON.stringify(state));
  } catch {
    // Ventana privada o almacenamiento lleno. El examen sigue, pero no se podrá reanudar
  }
}

export function clearExamState(
  userId: string,
  storage: Pick<Storage, 'removeItem'> = defaultStorage,
): void {
  try {
    storage.removeItem(storageKey(userId));
  } catch {
    // Nada que limpiar
  }
}
