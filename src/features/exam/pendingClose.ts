// Cierre pendiente de un examen (V5-B0, defecto importante 1 del diagnóstico de la beta). El examen
// guardado en el navegador puede haber terminado sin acabar de registrarse, porque el alumno salió
// de Resultados mientras decía Guardando tus respuestas o el teléfono cerró la pestaña a la mitad.
// Aquí solo se decide si hay algo que retomar. Un examen en curso nunca cuenta, porque todavía se
// puede contestar, y uno cerrado ya no tiene nada que registrar. El cierre mismo lo hace closeExam,
// que avanza por pasos anotados en el estado y no duplica nada en la bitácora.
import { isClosed, isFinished, type ExamState } from './examState';
import { loadExamState } from './examStorage';

/**
 * true si el examen terminó, porque el alumno lo dio por terminado o se le acabó el tiempo, y todavía
 * falta registrar alguna respuesta, el fin de la sesión o los errores al repaso
 */
export function hasPendingClose(state: ExamState | null): state is ExamState {
  return state !== null && isFinished(state) && !isClosed(state);
}

/** El examen guardado del alumno que falta por cerrar, o null si no hay examen o no falta nada */
export function loadPendingClose(
  userId: string,
  storage?: Parameters<typeof loadExamState>[1],
): ExamState | null {
  const state = loadExamState(userId, storage);
  return hasPendingClose(state) ? state : null;
}
