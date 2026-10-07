// Textos del aviso de límite de cambios de dispositivo, en español de México con trato de tú.
// Se integran en t.cloud desde features.ts.

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const pad = (n: number) => String(n).padStart(2, '0');

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Cuándo podrá volver a cambiar de dispositivo, dicho para el aviso. Usa la hora local del
 * navegador y redondea hacia arriba al minuto, para que quien llegue justo a la hora no sea rechazado
 * por segundos. Sin hora conocida dice más tarde, y si la hora ya pasó dice en unos momentos
 */
export function describeRetryTime(retryAt: number | null, now: number = Date.now()): string {
  if (retryAt === null || !Number.isFinite(retryAt)) return 'más tarde';
  if (retryAt <= now) return 'en unos momentos';
  const at = new Date(Math.ceil(retryAt / 60_000) * 60_000);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())} h`;
  const days = Math.round(
    (startOfDay(at).getTime() - startOfDay(new Date(now)).getTime()) / 86_400_000,
  );
  if (days <= 0) return `a partir de hoy a las ${time}`;
  if (days === 1) return `a partir de mañana a las ${time}`;
  return `a partir del ${at.getDate()} de ${MONTHS[at.getMonth()] ?? ''} a las ${time}`;
}

export const deviceLimitText = {
  title: 'Cambiaste de dispositivo demasiadas veces',
  body: (when: string) =>
    `Cada cuenta tiene un solo dispositivo activo y solo puedes cambiar de dispositivo unas cuantas veces en un día. Cerramos tu sesión aquí para proteger tu cuenta. Podrás volver a entrar desde este dispositivo ${when}. Tu otro dispositivo sigue con la cuenta.`,
  helpQuestion: '¿Crees que es un error o necesitas entrar ya?',
  helpLink: 'Pedir ayuda',
  helpMailSubject: 'Ayuda con el cambio de dispositivo',
  // Sin un contacto configurado no se inventa una dirección
  helpWithoutContact:
    'Si crees que es un error o necesitas entrar ya, pide ayuda al equipo de Studiare por el medio donde te dieron acceso.',
  dismiss: 'Entendido',
} as const;
