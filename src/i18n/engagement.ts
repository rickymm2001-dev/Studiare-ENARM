// Textos de los recordatorios por correo, la página Darte de baja y la sección Correos y alertas del admin
// (B15, 3.6, 3.7 y 2.4 del plan de B15). Fuera de t para que no entren al JavaScript inicial, que está al
// límite de los 300 KB (14.4). Los importan solo las pantallas diferidas que los usan, como lo hacen
// consents.ts y studentSync.ts, y no se integran en t. Lo llenan el paquete B (la sección de Ajustes del
// repaso y la página de baja, aquí) y el paquete A (la sección del admin). Español de México con trato de
// tú, sin signos de exclamación y sin dos puntos en la prosa

/** La hora en punto en formato de 12 horas, como la dice un mexicano. 20 es 8:00 p. m. */
export function hourLabel(hour: number): string {
  const suffix = hour >= 12 ? 'p. m.' : 'a. m.';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(twelve)}:00 ${suffix}`;
}

/** Una dirección de correo con la mayor parte oculta, para decir a dónde llega sin enseñarla completa */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.trim().split('@');
  if (local === '' || domain === '') return '';
  return `${local.slice(0, 1)}***@${domain}`;
}

export const engagementTexts = {
  reminders: {
    title: 'Recordatorios por correo',
    needsCloud: 'Los recordatorios por correo necesitan tu cuenta en la nube.',
    loading: 'Leyendo tus recordatorios',
    loadFailed: 'No pudimos leer tus recordatorios. Revisa tu conexión e intenta de nuevo.',
    retry: 'Intentar de nuevo',
    enable: 'Mandarme un recordatorio por correo',
    enableHint: 'Un correo con cuántas tarjetas te tocan ese día. Lo puedes apagar cuando quieras.',
    unsubscribed:
      'Te diste de baja desde un correo. Si los vuelves a prender, te los mandamos otra vez.',
    hour: 'Hora del recordatorio',
    hourHint: 'Hora en punto, de las 5 de la mañana a las 11 de la noche.',
    frequency: 'Cada cuándo',
    frequencies: { daily: 'Diario', weekdays: 'Lunes a viernes', custom: 'Días que elijas' },
    days: 'Días de la semana',
    /** Del lunes al domingo, que es como los ordena una semana de estudio. El número es el del servidor */
    dayOrder: [1, 2, 3, 4, 5, 6, 0] as const,
    dayNames: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const,
    needsDay: 'Elige al menos un día.',
    onlyWhenDue: 'Solo si tengo pendientes',
    onlyWhenDueHint: 'Si ese día no te toca ninguna tarjeta, no te mandamos nada.',
    sentTo: (masked: string) => `Llega a ${masked}`,
    timeZone: (zone: string) => `Con la hora de ${zone.replace('_', ' ')}.`,
    saved: 'Guardamos tus recordatorios.',
    saveFailed: 'No pudimos guardar tus recordatorios. Intenta de nuevo en un momento.',
    notActiveDevice: 'Este dispositivo no es el activo de tu cuenta. Entra de nuevo para guardar.',
  },
  unsubscribe: {
    title: 'Darte de baja de los recordatorios',
    description: 'Los recordatorios de repaso por correo de Studiare.',
    question: '¿Ya no quieres recordatorios de repaso por correo?',
    confirm: 'Darme de baja',
    working: 'Dándote de baja',
    done: 'Listo. Ya no te mandaremos recordatorios. Puedes volver a prenderlos en Ajustes del repaso.',
    already:
      'Ya estabas dado de baja. Puedes volver a prender los recordatorios en Ajustes del repaso.',
    invalid:
      'Este enlace ya no sirve. Para apagar los recordatorios, entra a Studiare y ve a Ajustes del repaso, en Repasar.',
    failed: 'No pudimos darte de baja ahora. Intenta de nuevo en un momento.',
    goToApp: 'Ir a Studiare',
    goToSettings: 'Ir a Ajustes del repaso',
  },
} as const;
