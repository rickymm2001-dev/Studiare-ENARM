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
