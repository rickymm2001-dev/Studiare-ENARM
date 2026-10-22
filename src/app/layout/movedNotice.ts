// Lo que decide si el aviso de la mudanza se ve y qué dice (B17, 3.4). Sin React, para probarlo con fechas fijas.
// Las dos variables llegan al construir la demo de GitHub Pages (VITE_MOVED_TO y VITE_MOVED_ON) y son públicas.
// Sin las dos, o con una mal escrita, no hay aviso: la app funciona igual

export interface MovedNoticeInfo {
  /** El origen nuevo, como https://tudominio.mx. Es lo único que se pone en el enlace */
  url: string;
  /** tudominio.mx */
  host: string;
  /** AAAA-MM-DD, el día de la mudanza */
  date: string;
  /** "15 de diciembre", con el año si no es el actual */
  dateLabel: string;
  /** Ya llegó el día. El aviso deja de decir "se muda" */
  arrived: boolean;
}

/** AAAA-MM-DD en la hora de este navegador, que es la que el alumno vive */
export function dayKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function originOf(value: unknown): URL | null {
  if (typeof value !== 'string') return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const bare =
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    (url.pathname === '/' || url.pathname === '') &&
    url.search === '' &&
    url.hash === '';
  return bare ? url : null;
}

function validDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const day = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day ? null : day;
}

export function movedNoticeOf(
  env: { VITE_MOVED_TO?: unknown; VITE_MOVED_ON?: unknown },
  now: Date,
): MovedNoticeInfo | null {
  const target = originOf(env.VITE_MOVED_TO);
  const date = validDay(env.VITE_MOVED_ON);
  if (target === null || date === null) return null;
  const moveDay = new Date(`${date}T00:00:00Z`);
  const sameYear = moveDay.getUTCFullYear() === now.getFullYear();
  const dateLabel = new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(moveDay);
  return {
    url: target.origin,
    host: target.host,
    date,
    dateLabel,
    arrived: dayKey(now) >= date,
  };
}

/** Dónde se recuerda que el alumno cerró el aviso, con el día. Solo es una comodidad de este navegador */
export const MOVED_NOTICE_STORAGE_KEY = 'enarm.movedNotice.dismissedOn';

export function isDismissedToday(today: string): boolean {
  try {
    return localStorage.getItem(MOVED_NOTICE_STORAGE_KEY) === today;
  } catch {
    // Almacenamiento bloqueado. El aviso se ve y se cierra mientras dure la página
    return false;
  }
}

export function dismissForToday(today: string): void {
  try {
    localStorage.setItem(MOVED_NOTICE_STORAGE_KEY, today);
  } catch {
    // Sin almacenamiento no se recuerda, y no pasa nada
  }
}
