// Textos nuevos del bloque B7 del plan del cambio (respuestas 73, 77, 82 y 83). Modo enfoque, resumen
// semanal para compartir, enlace de referidos y lo que se esconde en producción. Español de México con
// trato de tú. Se integran en t.b7 desde es-MX.ts.
import { BRAND } from '@/config/brand';
import { plural } from './features';

/** Lo que se comparte de la semana. La racha es null en modo enfoque, que la oculta */
export interface WeekShareFigures {
  studyDays: number;
  reviews: number;
  questions: number;
  streak: number | null;
}

/** Une una lista en español, con y antes del último */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1) ?? ''}`;
}

export const b7ExtrasText = {
  // Modo enfoque (respuesta 82). Un interruptor en Configuración, sección Apariencia
  focusMode: {
    label: 'Modo enfoque',
    hint: 'Oculta en toda la app las tablas, el XP, el nivel, la racha y los retos, para que solo veas lo que estudias.',
    // Fin del repaso sin el XP ganado
    reviewDone: (cards: number) => `Repasaste ${plural(cards, 'tarjeta', 'tarjetas')}.`,
  },

  // Resumen de la semana para compartir (respuesta 83). Reemplaza a Comparte tu logro de Party
  weekShare: {
    title: 'Comparte tu semana',
    hint: 'Una imagen con tus días de estudio, tus repasos, tus preguntas y tu racha de esta semana. No lleva tus aciertos ni ningún puntaje, y no se comparte nada hasta que tú lo decidas.',
    hintFocus:
      'Una imagen con tus días de estudio, tus repasos y tus preguntas de esta semana. No lleva tus aciertos ni ningún puntaje, y no se comparte nada hasta que tú lo decidas.',
    previewLabel: 'Vista previa de tu resumen de la semana',
    heading: 'Mi semana de estudio',
    week: (monday: string) => `Semana del ${monday}`,
    studyDays: 'Días de estudio',
    studyDaysValue: (days: number) => `${days.toLocaleString('es-MX')} de 7`,
    reviews: 'Repasos',
    questions: 'Preguntas',
    streak: 'Racha',
    streakValue: (days: number) => plural(days, 'día', 'días'),
    includeAlias: 'Incluir mi alias en la imagen',
    button: 'Compartir mi semana',
    working: 'Preparando la imagen…',
    shareTitle: `Mi semana en ${BRAND.name}`,
    shareText: (figures: WeekShareFigures) => {
      const parts = [
        `${plural(figures.studyDays, 'día', 'días')} de estudio`,
        plural(figures.reviews, 'repaso', 'repasos'),
        plural(figures.questions, 'pregunta', 'preguntas'),
      ];
      if (figures.streak !== null) {
        parts.push(`una racha de ${plural(figures.streak, 'día', 'días')}`);
      }
      return `Mi semana en ${BRAND.name}. ${joinList(parts)}.`;
    },
    simulatedBanner: 'Datos de demostración. No es una semana real.',
    fileName: 'mi-semana.png',
    outcomes: {
      shared: 'Listo. Elegiste dónde compartirla.',
      downloaded:
        'Tu navegador no puede compartir imágenes directamente, así que se descargó la imagen. Súbela donde quieras.',
      cancelled: 'No se compartió nada.',
      failed: 'No se pudo crear la imagen. Intenta de nuevo.',
    },
  },

  // Referidos con enlace (respuesta 77 y 4.3). La tarjeta Invita y gana un mes sigue abierta en Gratis
  referral: {
    title: 'Invita y gana un mes',
    description:
      'Comparte tu enlace. Cuando la persona que invitaste haga su primer pago, tú ganas un mes gratis.',
    yourLink: 'Tu enlace de invitación',
    share: 'Compartir enlace',
    shareTitle: `Te invito a ${BRAND.name}`,
    shareText: `Te invito a preparar el ENARM en ${BRAND.name}. Crea tu cuenta con mi enlace.`,
    shared: 'Listo. Elegiste dónde compartir tu enlace.',
    linkCopied: 'Enlace copiado',
    copyFailed: 'No se pudo copiar. Selecciona el enlace y cópialo a mano.',
    rule: 'Cuenta cuando tu invitado hace su primer cobro confirmado, no al registrarse.',
    // La bienvenida, cuando llega alguien con el enlace de un compañero
    invited: (code: string) =>
      `Vienes con la invitación de un compañero. Su código ${code} se aplica solo al entrar a tu cuenta.`,
  },

  // Producción sin herramientas de demostración (pregunta 73, 5.4)
  demoLock: {
    roleLocked:
      'En esta versión el rol no se elige en el dispositivo. Lo asigna un administrador en tu cuenta.',
  },
} as const;
