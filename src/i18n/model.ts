// Textos del modelo del alumno, la comparación con otros alumnos y los consejos que salen de ellos (B14, 4 y 5
// del plan de B14). Fuera de t para que no entren al JavaScript inicial. src/i18n/model.test.ts revisa que
// ninguno diga puntaje estimado, probabilidad, plaza, ranking ni lugar número, y que no haya signos de
// exclamación. Español de México con trato de tú.
import { plural } from './features';

/** Junta frases con comas y una y antes de la última */
const join = (parts: readonly string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1] ?? ''}`;

export const modelTexts = {
  // ------------------------------------------------------------------ Dificultad (Progreso)
  difficulty: {
    hint: (provisional: number, calibrated: number) =>
      `Tu exactitud en preguntas fáciles, medias y difíciles. La dificultad empieza con la que estimó el médico. Cuando ${provisional} alumnos distintos contestan una pregunta, se mide con ellos y queda provisional, y desde ${calibrated} queda calibrada.`,
    /** De dónde salió la dificultad de las respuestas de un grupo. Solo dice lo que hay */
    sources: (physician: number, provisional: number, calibrated: number) =>
      `Dificultad ${join(
        [
          physician > 0
            ? `estimada por el médico en ${plural(physician, 'respuesta', 'respuestas')}`
            : '',
          provisional > 0
            ? `provisional con alumnos en ${plural(provisional, 'respuesta', 'respuestas')}`
            : '',
          calibrated > 0
            ? `calibrada con alumnos en ${plural(calibrated, 'respuesta', 'respuestas')}`
            : '',
        ].filter((part) => part !== ''),
      )}.`,
  },

  // ------------------------------------------------------------------ Fatiga (Conócete y Tutor)
  fatigue: {
    title: 'Fatiga en sesiones largas',
    hint: 'Si tu acierto cae hacia el final de las sesiones de más de 30 minutos.',
    unit: 'sesiones largas',
    /** Mientras el detector no esté validado con los datos de todos, aunque ya tengas tus sesiones */
    validating:
      'Todavía estamos validando este detector con los datos de los alumnos que dieron su permiso de mejora. Hasta entonces no te decimos si lo tienes, aunque ya tengas varias sesiones largas.',
    notValid:
      'Con los datos de los alumnos que dieron su permiso, este detector todavía no es lo bastante confiable para decirte si tienes fatiga. Lo seguimos revisando.',
    /** En la demostración el detector se valida con una cohorte de alumnos simulados */
    notValidSimulated:
      'Con los alumnos simulados de la demostración, este detector todavía no es lo bastante confiable para decirte si tienes fatiga.',
    simulatedValidation: 'El detector se validó con alumnos simulados.',
    waiting: (have: number, need: number) =>
      `Hacen falta ${plural(need, 'sesión larga', 'sesiones largas')} para revisar tu fatiga y llevas ${have}.`,
    detected:
      'En tus sesiones largas tu acierto baja hacia el final. Prueba bloques más cortos con pausas y deja lo difícil para el principio.',
    notDetected: 'En tus sesiones largas no vemos que tu acierto baje hacia el final.',
    /** El texto de la lectura de Conócete cuando la fatiga se mide con la tendencia dentro de la sesión */
    trendBody: (sessions: number, drop: number) =>
      `En ${plural(sessions, 'sesión', 'sesiones')} de más de 30 minutos, tu acierto ajustado ${
        drop < 0 ? 'baja' : 'sube'
      } ${Math.abs(Math.round(drop * 100))} puntos por cada 30 minutos de sesión.`,
  },

  // ------------------------------------------------------------------ Temas para reforzar (Inicio)
  reinforce: {
    /** La pista de la población. Sale de los temas del cuarto más bajo de acierto, desde 30 alumnos */
    hard: 'Este tema le cuesta a la mayoría',
    /** En la demostración los otros alumnos son simulados */
    hardSimulated: 'Este tema le cuesta a la mayoría de los alumnos simulados',
    fading: 'Tus tarjetas de este tema se te están olvidando',
    reviewCards: (topic: string) => `Repasar las tarjetas de ${topic}`,
  },

  // ------------------------------------------------------------------ Sesgos a los que eres propenso
  bias: {
    populationNote: 'Comparado con lo que eligen los demás alumnos cuando fallan.',
    populationNoteSimulated: 'Comparado con lo que eligen los alumnos simulados cuando fallan.',
    prone: 'Te atrapa seguido',
  },

  // ------------------------------------------------------------------ Cómo vas frente a otros (Progreso)
  comparison: {
    title: 'Cómo vas frente a otros',
    description: (days: number) =>
      `Tu acierto, tus repasos y tu constancia de los últimos ${days} días, puestos junto a los de otros alumnos.`,
    cohortsLabel: 'Compararte con',
    cohorts: { all: 'Todos', specialty: 'Tu especialidad' },
    specialtyFor: (name: string) => `Quienes buscan ${name}`,
    metrics: {
      sim_accuracy: 'Aciertos en simuladores',
      reviews: 'Repasos hechos',
      consistency: 'Constancia',
    },
    total: 'Total',
    /** El percentil de una fila lista, con la frase de lo que significa. Siempre de lo que ya pasó */
    percentile: (band: number) => `Percentil ${band}`,
    sentence: {
      sim_accuracy: {
        mid: (band: number, days: number) =>
          `Acertaste más que alrededor del ${band}% de los alumnos con datos en los últimos ${days} días.`,
        low: (days: number) =>
          `Tu acierto quedó debajo del de más del 95% de los alumnos con datos en los últimos ${days} días.`,
        high: (days: number) =>
          `Tu acierto superó al de más del 95% de los alumnos con datos en los últimos ${days} días.`,
      },
      reviews: {
        mid: (band: number, days: number) =>
          `Repasaste más tarjetas que alrededor del ${band}% de los alumnos con datos en los últimos ${days} días.`,
        low: (days: number) =>
          `Repasaste menos tarjetas que más del 95% de los alumnos con datos en los últimos ${days} días.`,
        high: (days: number) =>
          `Repasaste más tarjetas que más del 95% de los alumnos con datos en los últimos ${days} días.`,
      },
      consistency: {
        mid: (band: number, days: number) =>
          `Estudiaste más días que alrededor del ${band}% de los alumnos con datos en los últimos ${days} días.`,
        low: (days: number) =>
          `Estudiaste menos días que más del 95% de los alumnos con datos en los últimos ${days} días.`,
        high: (days: number) =>
          `Estudiaste más días que más del 95% de los alumnos con datos en los últimos ${days} días.`,
      },
    },
    below5: 'Por debajo del percentil 5',
    above95: 'Por arriba del percentil 95',
    calibratingLabel: 'Calibrando',
    emptyGroup: 'Todavía no hay alumnos con datos en este grupo.',
    groupCalibrating: (missing: number) =>
      `Faltan ${plural(missing, 'alumno', 'alumnos')} con datos para comparar.`,
    ownCalibratingBranch: (have: number, need: number) =>
      `Entras a la comparación de esta rama con ${need} respuestas de simulador y llevas ${have}.`,
    ownCalibratingActivity: (days: number) =>
      `Todavía no tienes actividad en los últimos ${days} días para comparar.`,
    footer:
      'Comparamos lo que ya hiciste en los últimos 30 días con alumnos que comparten sus datos sin su nombre. No es un pronóstico de tu resultado en el ENARM.',
    calculated: (date: string) => `Calculado la noche del ${date}`,
    simulated:
      'Los otros alumnos son simulados. Sirven para ver cómo funciona esta sección sin mezclar datos reales.',
    noSpecialty:
      'Elige la especialidad que buscas para compararte también con quienes buscan lo mismo.',
    goToData: 'Ir a Tus datos',
    loading: 'Cargando la comparación',
    unavailable: {
      no_cloud:
        'La comparación se calcula cada noche con los alumnos que comparten sus datos sin su nombre, y necesita tu cuenta de la nube conectada. Calibrando.',
      no_snapshot:
        'Todavía no hay una comparación publicada. Se calcula cada noche con los alumnos que comparten sus datos sin su nombre y sale cuando un grupo reúne al menos 30 alumnos con datos. Calibrando.',
    },
  },
} as const;
