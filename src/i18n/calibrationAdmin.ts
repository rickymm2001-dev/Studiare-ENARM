// Textos de la pantalla Calibración del admin, la sección Modelo del alumno y calibración de Plataforma
// y el historial de Acuerdo del médico (B14, 7.2 del plan). Fuera de t para que no entren al
// JavaScript inicial. Español de México con trato de tú, sin signos de exclamación y sin dos puntos.
// src/i18n/calibrationAdmin.test.ts revisa que no hablen de puntaje, de probabilidad ni de lugares en
// una lista. Son cifras de todos juntos: aquí nunca aparece un alumno suelto.
import { plural } from './features';

const num = (value: number) => value.toLocaleString('es-MX');
const share = (value: number) => `${Math.round(value * 100)} %`;

export const calibrationAdminTexts = {
  // ------------------------------------------------------------------ Pantalla Calibración
  description:
    'Lo que hizo la calibración de la noche con los alumnos que dieron su permiso, lo que publicó y el interruptor para encenderla. Son cifras de todos juntos. Aquí no aparece ningún alumno ni ninguna respuesta suelta.',
  needsCloud: 'Esta pantalla necesita la cuenta de la nube conectada como admin.',
  refresh: 'Actualizar',

  // ------------------------------------------------------------------ Última corrida
  status: {
    title: 'Última corrida',
    noRuns: 'Todavía no ha corrido ninguna calibración.',
    noRunsHelp:
      'Si ya agregaste la llave SUPABASE_CALIBRATION_KEY en los secretos del repositorio, entra a GitHub, Actions, calibration y dale Run workflow con Solo reporte prendido. Sin la llave, la corrida termina como not_configured y no deja registro aquí.',
    startedAt: (when: string, ago: string) => `Empezó el ${when}, ${ago}.`,
    lastGood: (ago: string) => `La última corrida buena fue ${ago}.`,
    noGoodRun:
      'Hay corridas, pero ninguna ha terminado bien todavía. Revisa el motivo de la más reciente.',
    stale: {
      title: 'La calibración lleva más de 48 horas sin una corrida buena',
      body: 'Mientras el repositorio sea público, GitHub apaga lo programado después de 60 días sin actividad. Para volver a prenderla sigue estos pasos.',
      steps: [
        'Entra a GitHub, a Actions y elige calibration.',
        'Si ves el aviso de que el workflow está apagado, dale Enable workflow.',
        'Lánzalo a mano con Run workflow y Solo reporte prendido, y vuelve aquí para ver la corrida.',
      ],
      open: 'Abrir calibration en GitHub',
    },
    publication: {
      none: 'Todavía no se publica nada a los alumnos. En Solo reporte la calibración calcula y guarda cada corrida sin cambiar lo que ven.',
      at: (when: string) => `Lo que ven los alumnos viene de la corrida del ${when}.`,
    },
    switchOn: 'La calibración está encendida.',
    switchOff: 'La calibración está apagada. Las noches terminan como skipped y no leen nada.',
  },

  /** Estados, modos y disparadores de una corrida, con la frase que se muestra */
  runStatus: {
    running: 'Corriendo',
    ok: 'Terminó bien',
    partial: 'Terminó con aviso',
    failed: 'Falló',
    skipped: 'Se saltó',
    interrupted: 'Se interrumpió',
  } as Record<string, string>,
  modes: { dry_run: 'Solo reporte', apply: 'Publicar' } as Record<string, string>,
  triggers: { schedule: 'Programada', manual: 'A mano', selftest: 'Autotest' } as Record<
    string,
    string
  >,
  reasons: {
    disabled: 'La calibración estaba apagada.',
    running: 'Ya había otra corrida en marcha.',
    not_configured: 'Faltaba la llave en GitHub.',
    timeout: 'Pasó del tiempo límite.',
    kappa_mismatch: 'El kappa de la noche no coincide con el del tablero del médico.',
    invalid_page: 'La base mandó una página que no se entendió.',
    store_error: 'La base respondió con un error.',
    compute_error: 'Falló el cálculo.',
    publish_error: 'No se pudo publicar el resultado.',
    unexpected: 'Falló por algo que no se esperaba.',
    network: 'Falló la conexión.',
  } as Record<string, string>,

  // ------------------------------------------------------------------ Interruptor y modo
  control: {
    title: 'Interruptor y modo',
    hint: 'Cambian lo que hace la siguiente corrida. Empieza en Solo reporte y pasa a Publicar después de dos noches limpias.',
    enabled: 'Calibración encendida',
    enabledHint: 'Apagada, la noche termina como skipped con disabled y no lee nada.',
    mode: 'Modo',
    modeHint: {
      dry_run:
        'Calcula y guarda la corrida con sus cifras, pero no cambia nada de lo que ven los alumnos.',
      apply:
        'Aplica todo. Pone la dificultad calibrada en el catálogo, deja listas las variantes para examen, marca los distractores que casi nadie elige y publica la comparación y la población.',
    } as Record<string, string>,
    save: 'Guardar',
    confirm:
      'Publicar cambia lo que ven los alumnos desde la siguiente corrida. ¿Quieres que la calibración publique?',
    confirmYes: 'Sí, publicar',
    cancel: 'Cancelar',
    saved: 'Guardado. La siguiente corrida usa estos ajustes.',
    failed: 'No se pudo guardar. Intenta de nuevo.',
  },

  // ------------------------------------------------------------------ Corridas
  runs: {
    title: 'Últimas corridas',
    hint: (n: number) =>
      `Las últimas ${plural(n, 'corrida', 'corridas')}, la más reciente primero. Solo traen números y códigos.`,
    empty: 'Todavía no hay corridas.',
    github: (id: string) => `Corrida ${id} en GitHub`,
    details: 'Ver los conteos',
    noCounts: 'Esta corrida no guardó conteos.',
    consenters: (n: number) => plural(n, 'alumno con permiso', 'alumnos con permiso'),
    items: (physician: number, provisional: number, calibrated: number) =>
      `Preguntas ${num(physician)} del médico, ${num(provisional)} provisionales, ${num(calibrated)} calibradas`,
    flags: (n: number) => plural(n, 'marca nueva', 'marcas nuevas'),
    cells: (ready: number, calibrating: number) =>
      `Comparación ${plural(ready, 'celda lista', 'celdas listas')} y ${num(calibrating)} calibrando`,
    fatigue: (label: string) => `Fatiga ${label.toLowerCase()}`,
    parityMatch: 'Kappa coincide',
    parityMismatch: 'Kappa no coincide',
    yes: 'Sí',
    no: 'No',
    counts: {
      consenters: 'Alumnos con permiso',
      answers: 'Respuestas leídas',
      firstAttempts: 'Primeros intentos que cuentan',
      repeatAttempts: 'Repeticiones que no cuentan',
      unknownVersion: 'Respuestas de una versión que ya no está',
      rapidExcluded: 'Respuestas demasiado rápidas',
      noExposure: 'Respuestas sin lectura previa',
      inconsistentExposure: 'Respuestas con lectura que no cuadra',
      cappedDays: 'Días con tope',
      cappedAttempts: 'Intentos arriba del tope',
      itemRows: 'Preguntas medidas',
      itemsPhysicianEstimate: 'Con dificultad del médico',
      itemsProvisional: 'Provisionales',
      itemsCalibrated: 'Calibradas',
      variantsReady: 'Variantes listas para examen',
      optionRows: 'Opciones medidas',
      cellsReady: 'Celdas de comparación listas',
      cellsCalibrating: 'Celdas de comparación calibrando',
      comparisonStudents: 'Alumnos en la comparación',
      populationTopics: 'Temas en la población',
      populationBiasTags: 'Sesgos en la población',
      populationMotiveBranches: 'Ramas con motivos de error',
      populationIndicators: 'Indicadores de conducta',
      fatigueState: 'Detector de fatiga',
      fatigueStudents: 'Alumnos con sesiones largas',
      fatigueLongSessions: 'Sesiones largas',
      fatigueMotiveReports: 'Motivos reportados al final de sesiones largas',
      agreementPairs: 'Pares de etiquetas',
      parity: 'Kappa igual al del tablero',
      catalogUpdated: 'Preguntas actualizadas en el catálogo',
      examEligible: 'Variantes aprobadas para examen',
      flagsTouched: 'Marcas de distractores revisadas',
      flagsNew: 'Marcas nuevas',
      emailsQueued: 'Correos en cola',
    } as Record<string, string>,
    fatigueStates: {
      calibrating: 'Calibrando',
      validated: 'Validado',
      not_valid: 'No válido',
    } as Record<string, string>,
  },

  // ------------------------------------------------------------------ Lo que publica
  overview: {
    title: 'Lo que publica la calibración',
    hint: 'Lo que dejó la última corrida buena. Los datos de menos de 30 alumnos no se muestran.',
    none: 'Todavía no hay una corrida buena de la que mostrar cifras.',
    items: {
      title: 'Preguntas por estado',
      physician_estimate: 'Con dificultad del médico',
      provisional: 'Provisionales',
      calibrated: 'Calibradas',
      share: (count: number, total: number) => `${num(count)} de ${num(total)}`,
      empty: 'Calibrando. Todavía no hay preguntas publicadas que contar.',
    },
    topics: {
      title: 'Temas que más cuestan',
      hint: 'Los de menor acierto entre los alumnos con permiso.',
      none: 'Calibrando. Todavía no hay temas con 30 alumnos o más.',
      line: (accuracy: number, students: number) =>
        `${share(accuracy)} de acierto con ${plural(students, 'alumno', 'alumnos')}`,
    },
    motives: {
      title: 'Motivos de error que más pesan',
      hint: 'Cómo reparten sus errores los alumnos que marcaron el motivo, por rama.',
      none: 'Calibrando. Todavía no hay ramas con 30 reportes o más.',
      reports: (n: number) => plural(n, 'reporte', 'reportes'),
      share: (label: string, value: number) => `${label} ${share(value)}`,
    },
    fatigue: {
      title: 'Detector de fatiga',
      calibrating: (have: number, need: number) =>
        `Calibrando. ${num(have)} de ${plural(need, 'alumno', 'alumnos')} con sesiones largas.`,
      validated: (students: number, sessions: number) =>
        `Validado con ${plural(students, 'alumno', 'alumnos')} y ${plural(sessions, 'sesión larga', 'sesiones largas')}. Ya se le dice a cada alumno si lo tiene.`,
      not_valid:
        'No es lo bastante confiable con los datos de los alumnos. Se sigue revisando y a los alumnos no se les dice nada.',
    },
    agreement: {
      title: 'Acuerdo del etiquetado',
      kappa: (kappa: string) => `Kappa de la noche ${kappa}`,
      none: 'Todavía no hay pares de etiquetas con los que medir el acuerdo.',
      match: 'Coincide con el tablero del médico.',
      mismatch: 'No coincide con el tablero del médico. La corrida queda con aviso.',
      unknown: 'Todavía sin comparar con el tablero del médico.',
    },
  },

  // ------------------------------------------------------------------ Plataforma, Modelo del alumno y calibración
  settings: {
    title: 'Modelo del alumno y calibración',
    hint: 'Los números con los que la calibración de la noche y la app deciden cuándo hay datos suficientes. Los lee la base y los leen todos los alumnos, así que solo se cambian con la cuenta de la nube conectada como admin.',
    needsCloud: 'Para cambiarlos, conecta la cuenta de la nube de un admin.',
    loadFailed: 'No se pudieron leer los ajustes del modelo. Intenta de nuevo.',
    features: {
      title: 'Funciones para los alumnos',
      comparison: {
        label: 'Cómo vas frente a otros',
        hint: 'La tarjeta de Progreso con el percentil de cada alumno. Apagada, la base no publica la foto y la tarjeta dice calibrando.',
      },
      adaptive: {
        label: 'Modo adaptativo',
        hint: 'La casilla Adaptativo de Simular. Apagada, el simulador elige como siempre. No da acceso a más preguntas.',
      },
    },
    groups: {
      difficulty: 'Dificultad de las preguntas',
      comparison: 'Comparación con otros alumnos',
      population: 'Población',
      adaptive: 'Modo adaptativo',
      fatigue: 'Detector de fatiga',
    },
    fields: {
      provisionalMaxSe: {
        label: 'Error estándar máximo de una pregunta provisional',
        hint: 'Además de las respuestas mínimas de Umbrales de calibración. Más bajo exige más certeza.',
      },
      calibratedMaxSe: {
        label: 'Error estándar máximo de una pregunta calibrada',
        hint: 'Más bajo exige más certeza. Debe ser menor que el de provisional.',
      },
      maxDailyFirstAttempts: {
        label: 'Primeros intentos por alumno y día',
        hint: 'Arriba de este tope el día de ese alumno no cuenta, para que nadie mueva la dificultad de todos.',
      },
      minGroupSize: {
        label: 'Alumnos por grupo para comparar',
        hint: 'Alumnos con datos que necesita un grupo para publicar su comparación. Nunca menos de 30.',
      },
      comparisonWindowDays: {
        label: 'Días que mira la comparación',
        hint: 'Días completos anteriores a la noche. De 7 a 90.',
      },
      minBranchAnswers: {
        label: 'Respuestas de simulador por rama',
        hint: 'Las que necesita un alumno en una rama para entrar a la comparación de esa rama.',
      },
      populationMinStudents: {
        label: 'Alumnos por dato de la población',
        hint: 'Alumnos que necesita cada tema, sesgo o motivo para publicarse. Nunca menos de 30.',
      },
      adaptiveMinItems: {
        label: 'Preguntas para ofrecer el modo adaptativo',
        hint: 'Preguntas al menos provisionales dentro de lo que el alumno elige.',
      },
      adaptiveTargetOffset: {
        label: 'Desplazamiento de la dificultad objetivo',
        hint: 'Logits que se suman a la habilidad del alumno. Con 0 busca preguntas de su nivel y con un número negativo salen más fáciles.',
      },
      adaptiveExploreShare: {
        label: 'Parte de la sesión que todavía calibra',
        hint: 'De 0 a 0.5. Va a preguntas que todavía juntan respuestas.',
      },
      'fatigue.minStudents': {
        label: 'Alumnos con sesiones largas para validar',
        hint: 'Los que hacen falta para decir si el detector de fatiga es confiable.',
      },
      'fatigue.minSplitHalfKappa': {
        label: 'Kappa mínimo entre sesiones pares e impares',
        hint: 'De -1 a 1. Mide si el detector da lo mismo en dos mitades de las sesiones.',
      },
      'fatigue.minMotiveReports': {
        label: 'Motivos reportados para validar',
        hint: 'Errores del último tercio de sesiones largas con su motivo marcado.',
      },
    } as Record<string, { label: string; hint: string }>,
    factory: (value: string) => `De fábrica ${value}.`,
    errors: {
      notNumber: 'Escribe un número.',
      notInteger: 'Escribe un número entero.',
      range: (min: number, max: number) => `Escribe un valor entre ${num(min)} y ${num(max)}.`,
      floor:
        'No puede ser menos de 30. Es la promesa de privacidad de la comparación y la base también la hace cumplir.',
      seOrder: 'El error estándar de calibrada debe ser menor que el de provisional.',
    },
    noticeVersion: (version: string) =>
      `Versión mínima del aviso de privacidad ${version}. Un permiso dado con un aviso anterior no cuenta para la calibración. La cambia la sesión que despliega, no esta pantalla.`,
    calibrationLink:
      'El interruptor y el modo de la calibración nocturna están en la pantalla Calibración.',
    calibrationOpen: 'Abrir Calibración',
    responsesLink:
      'Las respuestas mínimas por pregunta y los umbrales de distractores están en Umbrales de calibración, arriba.',
    save: 'Guardar',
    restore: 'Volver a lo de fábrica',
    saved: 'Guardado. Los alumnos lo toman la siguiente vez que bajan los ajustes del día.',
    restored: 'Quedó de fábrica.',
    invalid: 'Corrige los campos marcados antes de guardar.',
    failed: 'No se pudo guardar. Intenta de nuevo.',
    unused: 'Sin uso',
    unusedHint:
      'Sin uso. FSRS va de fábrica para todos y la calibración no ajusta parámetros por alumno. Queda como punto de extensión.',
  },

  // ------------------------------------------------------------------ Acuerdo del médico
  agreementHistory: {
    title: 'Acuerdo noche por noche',
    hint: 'El kappa que calculó la calibración cada noche con los pares de etiquetas del autor y del revisor, y si coincide con el del tablero de arriba.',
    night: 'Noche',
    pairs: 'Pares',
    kappa: 'Kappa',
    parity: 'Tablero',
    noKappa: 'Sin medir',
    nightOf: (date: string) => `Noche del ${date}`,
    parityMatch: 'Coincide',
    parityMismatch: 'No coincide',
    parityUnknown: 'Sin comparar',
    mismatchNote:
      'Cuando no coincide, la corrida de esa noche quedó con aviso. Revisa cuál de los dos kappa está mal antes de fiarte de ellos.',
    empty:
      'Todavía no hay noches con el acuerdo medido. Aparecen cuando la calibración nocturna termina una corrida.',
    local: 'En la demostración no hay calibración nocturna, así que no hay historial por noche.',
    needsCloud:
      'El historial por noche viene de la calibración y necesita la cuenta de la nube conectada.',
    failed: 'No se pudo leer el historial. Intenta de nuevo.',
    tableLabel: 'Historial del acuerdo por noche',
    showAll: (n: number) => `Ver las ${plural(n, 'noche', 'noches')}`,
    showFewer: 'Ver menos',
  },

  // ------------------------------------------------------------------ Marcas de distractores
  distractors: {
    calculated: (date: string, exposures: number) =>
      `Calculado la noche del ${date} con ${plural(exposures, 'exposición', 'exposiciones')}`,
  },
} as const;
