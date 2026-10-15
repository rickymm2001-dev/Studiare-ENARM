// Fecha del ENARM. La fija la CIFRHS y es la misma para todos los alumnos, así que vive en la
// plataforma y no en el perfil (D-059). Provisional hasta que se publique la convocatoria. Cuando
// exista el panel de administración, el administrador la cambia ahí.
export const ENARM_EXAM = {
  /** Primer día del examen, AAAA-MM-DD */
  date: '2027-09-13',
  provisional: true,
} as const;

/** Fecha que usan el planificador, FSRS y la cuenta regresiva. La del perfil solo en la demo */
export function examDateFor(user: { examDate: string | null }): string {
  return user.examDate ?? ENARM_EXAM.date;
}

/**
 * Reactivos por sección del ENARM (sección 6 del plan del cambio, B13). El examen completo trae 250
 * en español y 30 de comprensión de textos en inglés. Es un solo lugar para el formato, así que si la
 * convocatoria cambia, cambia aquí
 */
export const ENARM_FORMAT = { clinical: 250, english: 30 } as const;

/**
 * Cómo se acomodan las unidades de inglés en el examen completo (8.4 del plan de B13). mixed las
 * mezcla por casos con las de español, como hoy entre ramas. end las pone en un bloque al final. Se
 * cambia a end si la convocatoria vigente dice que el inglés va aparte
 */
export const ENGLISH_PLACEMENT: 'mixed' | 'end' = 'mixed';
