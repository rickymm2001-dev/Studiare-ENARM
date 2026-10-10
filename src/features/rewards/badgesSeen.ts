// Qué niveles de insignia ya vio el alumno en este dispositivo (Fase I). Es solo una comodidad de la
// pantalla para no repetir el aviso, así que vive en el navegador y no en la bitácora. Si el navegador
// no deja guardar, el aviso se repite, que es mejor que perder uno.
const KEY_PREFIX = 'enarm.badges.seen.v1.';

/** null si este dispositivo nunca guardó nada para el alumno, que es distinto de no haber visto ninguna */
export function loadSeenBadges(userId: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${userId}`);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return null;
  }
}

export function saveSeenBadges(userId: string, seen: ReadonlySet<string>): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, JSON.stringify([...seen]));
  } catch {
    // Sin espacio o sin acceso. Se avisará otra vez
  }
}
