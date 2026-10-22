// Lo que la encuesta de los primeros días recuerda en este dispositivo, en localStorage (B18, hallazgo 5 de la revisión).
// Son dos cosas, las dos solo comodidades. La clave de la franja guarda qué hizo la persona con ella (Ahora no, No quiero
// contestarla) y la del borrador guarda las respuestas a medias y el comentario, que es texto libre. Se borran juntas al
// cerrar sesión, al Borrar mis datos y al Eliminar mi cuenta, para que un borrador o una decisión no sobrevivan a la
// cuenta en un navegador que se comparte.
//
// Vive aparte de surveyState.ts porque lo llaman preferences.ts (cerrar sesión) y la sección de datos, que sí van en el
// JavaScript inicial, y surveyState trae las listas de preguntas y no tiene por qué ir ahí. Aquí solo hay dos nombres y una
// función. Sin React ni Dexie.

/** Dónde se recuerda qué hizo la persona con la franja. Una entrada por cuenta */
export const SURVEY_STORAGE_KEY = 'enarm.survey.v1';
/** Dónde se guarda el borrador. Una entrada por cuenta */
export const SURVEY_DRAFT_STORAGE_KEY = 'enarm.survey.draft.v1';

/**
 * Quita de este dispositivo el borrador y el estado de la franja, de todas las cuentas que lo usaron. Una entrada por
 * cuenta en cada clave, así que se quitan las claves enteras: al cerrar sesión o borrar datos no hace falta saber de quién
 * eran, y otra persona del mismo navegador solo vuelve a ver la franja si le toca. Sin almacenamiento no hay nada que
 * quitar, y nunca lanza
 */
export function forgetSurveyLocal(): void {
  for (const key of [SURVEY_STORAGE_KEY, SURVEY_DRAFT_STORAGE_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Almacenamiento bloqueado o ventana privada: no hay nada guardado que quitar
    }
  }
}
