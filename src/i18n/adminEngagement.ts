// Textos de la sección Correos y alertas de Plataforma (pantalla 25, B15). Suelto, como los otros textos que
// cada pantalla diferida importa, para no sumar al JavaScript inicial. Trato de tú y sin dos puntos en la prosa.
import { plural } from './features';

export const adminEngagementText = {
  title: 'Correos y alertas',
  description:
    'Prende o pausa el envío de correos, mira cuántos salieron en los últimos 7 días y manda un error de prueba para comprobar que las alertas te llegan. Todo está apagado de fábrica y se prende cuando pones las llaves de Resend, PostHog y Sentry.',
  needsCloud:
    'Los interruptores viven en el servidor. Conecta la cuenta de la nube de un admin para verlos y cambiarlos.',
  loading: 'Cargando los correos…',
  saved: 'Listo. El cambio ya vale para todos.',
  saveFailed:
    'No se pudo guardar. Revisa tu conexión y que tu cuenta sea admin con su segundo factor, y vuelve a intentar.',
  delivery: {
    title: 'Envío de correos',
    switchLabel: 'Mandar los correos de la cola',
    switchHint:
      'Apagado, no sale ningún correo (recordatorios, fin de la prueba, pase por vencer, facturas ni reportes) y los recordatorios ni se encolan. Al prenderlo no se manda lo viejo, un recordatorio de más de 6 horas o una prueba que ya terminó se descarta.',
    on: 'Prendido',
    off: 'Apagado',
    paused: 'En pausa',
  },
  kinds: {
    trial_ending: 'Fin de la prueba gratis',
    pass_expiring: 'Pase por vencer',
    invoice_requested: 'Solicitud de factura, al equipo',
    content_report: 'Reporte de una pregunta, al médico',
    distractor_flags: 'Opciones por revisar, al médico',
    daily_review_reminder: 'Recordatorio diario de repaso',
  } as Record<string, string>,
  counts: {
    caption: (days: number) =>
      `Correos de los últimos ${plural(days, 'día', 'días')}, sin destinatarios`,
    queued: 'En cola',
    sent: 'Mandados',
    skipped: 'Saltados',
    failed: 'Fallidos',
  },
  pause: 'Pausar',
  resume: 'Reanudar',
  pauseLabel: (kind: string) => `Pausar ${kind}`,
  resumeLabel: (kind: string) => `Reanudar ${kind}`,
  analytics: {
    title: 'Eventos de dinero a PostHog',
    switchLabel: 'Encolar y mandar los eventos de cobros y suscripciones',
    switchHint:
      'Apagado, la base no encola ningún evento. Prendido, solo salen los de alumnos que dieron el permiso Medición de uso, con su ID seudónimo y sin correos ni nombres.',
  },
  alerts: {
    title: 'Alertas de errores',
    hint: 'Manda un error de prueba con un mensaje fijo y sin datos de nadie, uno desde el navegador y otro desde las funciones. Si Sentry está bien configurado, te llegan dos correos en unos minutos.',
    button: 'Mandar error de prueba',
    sending: 'Mandando…',
    browser: {
      sent: 'Salió el error de prueba del navegador.',
      blocked:
        'El navegador no pudo mandar su error de prueba. Falta la dirección de Sentry de la app o el destino todavía no está prendido.',
      unavailable:
        'El aviso del navegador llega con el destino de errores a Sentry y todavía no está conectado.',
    },
    server: {
      sent: 'Salió el error de prueba de las funciones.',
      missing_dsn: 'A las funciones les falta SENTRY_DSN, así que no salió nada de su lado.',
      forbidden: 'Las funciones no reconocieron tu sesión como admin con segundo factor.',
      failed: 'No se pudo llamar a la función monitoring-test. Puede faltar desplegarla.',
    },
  },
} as const;
