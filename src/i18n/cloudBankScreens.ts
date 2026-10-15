// Textos del alumno con el banco de la nube (B11, 4.9 del plan de B11). El tope de Gratis contado en
// el servidor, el freno de los planes de pago, el banco cerrado, el estudio sin conexión y los reportes
// de error. Viven aparte de t (es-MX.ts) para que solo los carguen las pantallas que eligen preguntas y
// no pesen en el JavaScript inicial, que está al límite de los 300 KB (14.4). Los del catálogo de mazos
// están en cloudDecks.ts. Español de México con trato de tú y sin signos de exclamación.
import type { ShortfallReason } from '@/data/bank/quota';

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString('es-MX')} ${n === 1 ? one : many}`;

/** Hora corta, como 10:42, en la zona del navegador */
export function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export const cloudBankScreensText = {
  // Bajo el título de Simular con el banco de la nube, que no es de demostración
  bankNote: (n: number) => `Banco de Studiare con ${plural(n, 'pregunta', 'preguntas')}.`,
  // Simular cuando la fuente es la nube y todavía no hay con qué elegir (5.3)
  neverDownloaded: {
    title: 'Conéctate una vez para bajar el banco',
    body: 'El banco de preguntas se baja la primera vez que abres Simular con conexión. Después puedes practicar sin conexión con lo que ya bajaste.',
  },
  closed: {
    title: 'El banco de preguntas todavía no abre',
    body: 'Los médicos siguen revisando las preguntas. Mientras tanto puedes repasar tus tarjetas y tus apuntes.',
  },
  // Freno de los planes de pago (2.3, 5.5)
  brake: (retryAt: string) =>
    `Vas muy rápido. Espera un minuto para seguir. Puedes volver a pedir preguntas a las ${shortTime(retryAt)}.`,
  // Lo que se dice cuando no llegó todo lo pedido. granted es lo que sí llegó
  shortfall: {
    title: 'Tu sesión empezó con menos preguntas',
    started: (granted: number, requested: number) =>
      `Empezaste con ${plural(granted, 'pregunta', 'preguntas')} de las ${requested.toLocaleString('es-MX')} que pediste.`,
    reasons: {
      offline:
        'Sin conexión solo puedes estudiar las preguntas que ya bajaste. Conéctate para bajar más.',
      closed: 'El banco de preguntas todavía no abre.',
      brake: 'Vas muy rápido. Espera un minuto para seguir.',
      daily_limit: 'Llegaste al límite de preguntas nuevas de hoy del plan Gratis.',
      unavailable:
        'Algunas preguntas ya no están en el banco. Vuelve a elegir para ver las nuevas.',
    } satisfies Record<ShortfallReason, string>,
    // Cuando no llegó ninguna y la sesión no empezó
    none: 'No se pudo empezar.',
    dismiss: 'Entendido',
  },
  // Reportar un error con la nube (5.4)
  report: {
    limit: 'Ya mandaste los reportes que se permiten hoy. Mañana puedes mandar más.',
    offline: 'Tu reporte quedó guardado aquí, pero no llegó al médico porque no hay conexión.',
  },
} as const;
