// Textos del recorrido guiado de ocho pasos, sus botones y la línea Ver el recorrido de Configuración
// (B15, 4.2 a 4.6 del plan de B15). Fuera de t para que no entren al JavaScript inicial, que está al límite
// de los 300 KB (14.4). Solo los importan el recorrido, que carga con lazy cuando empieza, y la línea del
// Perfil, como lo hacen consents.ts y studentSync.ts, y no se integran en t. Un paso por cada clave de
// TOUR_STEPS (src/features/tour/steps.ts). Español de México con trato de tú, sin signos de exclamación y
// sin dos puntos en la prosa. Ningún texto promete resultados médicos ni de puntaje
import type { TourStep } from '@/features/tour/steps';

export const tourTexts = {
  steps: {
    welcome: {
      title: 'Te enseñamos Studiare en un minuto',
      text: 'Son siete paradas cortas. Puedes saltar la introducción cuando quieras y volver a verla en Configuración.',
    },
    home: {
      title: 'Inicio',
      text: 'Aquí ves lo de hoy, tus repasos, tus misiones y lo que te conviene reforzar.',
    },
    review: {
      title: 'Repasar',
      text: 'Tus tarjetas con repetición espaciada. En Ajustes del repaso eliges tus metas, el Pomodoro y los recordatorios.',
    },
    outlines: {
      title: 'Apuntes',
      text: 'Escribe en esquema y convierte líneas en tarjetas. En el teléfono está en Más. En Gratis lo ves con candado.',
    },
    simulator: {
      title: 'Simular',
      text: 'Preguntas tipo ENARM por rama o el examen completo de 280, con su parte en inglés.',
    },
    progress: {
      title: 'Progreso',
      text: 'Tu avance por rama, tus sesgos y por qué fallas, con lo que ya pasó.',
    },
    party: {
      title: 'Party',
      text: 'Grupos con tus amigos, retos y duelos. Invita y gana un mes. En Gratis lo ves con candado.',
    },
    settings: {
      title: 'Configuración',
      text: 'Tu perfil y tu plan, la apariencia y tu privacidad. Aquí vuelves a ver este recorrido.',
    },
  } satisfies Record<TourStep, { title: string; text: string }>,
  /** El contador que va al principio del título, así el lector de pantalla lo dice (4.4) */
  counter: (number: number, total: number) => `Paso ${String(number)} de ${String(total)}`,
  skip: 'Saltar introducción',
  back: 'Atrás',
  next: 'Siguiente',
  finish: 'Terminar',
  /** La línea de Perfil, junto a Tu sesión (4.6) */
  settings: {
    title: 'Recorrido por Studiare',
    description: 'Vuelve a ver las paradas principales de la app, en un minuto.',
    button: 'Ver el recorrido',
  },
} as const;
