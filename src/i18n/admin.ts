// Textos de las pantallas de admin de la Fase D (23 costos de IA, 24 datos de demostración, 25
// configuración), en español de México con trato de tú (4.9). Se integran en t desde es-MX.ts.
import type { AiEngine } from '@/engines/aiContracts';
import { plural } from './features';

const engines: Record<AiEngine, string> = {
  forgetting: 'Hipótesis de olvidos',
  weekly_report: 'Informe semanal',
  flashcards: 'Tarjetas',
  bias_tips: 'Consejos por sesgo',
  restructure: 'Preguntas reestructuradas',
};

const usd = (value: number) => value.toLocaleString('es-MX');

export const adminText = {
  adminCosts: {
    title: 'Costos de IA',
    engines,
    stats: {
      label: 'Costos de IA en cifras',
      real: 'Gasto real',
      realCaption: (calls: number) => `${plural(calls, 'llamada', 'llamadas')} al modelo`,
      simulated: 'Gasto teórico',
      simulatedCaption: (calls: number) =>
        `${plural(calls, 'llamada simulada', 'llamadas simuladas')}, sin cobro`,
      latency: 'Latencia',
      latencyCaption: 'media por llamada',
      failed: 'Sin IA',
      failedCaption: (failed: number, retried: number) =>
        `${plural(failed, 'llamada cayó', 'llamadas cayeron')} a la plantilla y ${plural(retried, 'se reintentó', 'se reintentaron')}`,
    },
    today: {
      title: 'Hoy en el proxy',
      hint: 'Lo que el proxy lleva contado del día, que es lo que frena los límites. Se cuenta en hora de México.',
      spent: (spent: string, budget: string) => `Van ${spent} de ${budget} del presupuesto diario`,
      spentLabel: 'Presupuesto diario gastado',
      calls: (calls: number, students: number) =>
        `${plural(calls, 'llamada', 'llamadas')} de ${plural(students, 'alumno', 'alumnos')} hoy`,
      mockNote: 'El proxy está en modo simulado. Sus llamadas no gastan.',
      noProxy:
        'No hay proxy de IA disponible, como en la demo publicada. Abajo ves la bitácora de este navegador.',
    },
    empty: {
      title: 'Todavía no hay llamadas a la IA',
      description:
        'Cuando un alumno con el análisis con IA encendido abra el tutor, o genere tarjetas desde un texto, cada llamada queda aquí con su costo.',
    },
    byEngine: {
      title: 'Costo por motor',
      hint: 'El gasto real es el de las llamadas al modelo. El teórico es lo que costarían las respuestas simuladas con los precios configurados y nunca se cobra.',
    },
    byDay: { title: 'Costo por día' },
    columns: {
      engine: 'Motor',
      calls: 'Llamadas',
      realCost: 'Gasto real',
      simulatedCost: 'Gasto teórico',
      latency: 'Latencia',
      day: 'Día',
      when: 'Cuándo',
      mode: 'Modo',
      model: 'Modelo',
      tokens: 'Tokens',
      cost: 'Costo',
      outcome: 'Resultado',
      student: 'Alumno',
    },
    projection: {
      title: 'Proyección por alumno al mes',
      calibrating:
        'Para proyectar hacen falta llamadas suficientes repartidas en varios días, así una ráfaga no se toma por el uso normal.',
      units: { calls: 'llamadas', days: 'días con llamadas' },
      basis: (basis: 'real' | 'simulated', students: number, days: number) =>
        `${basis === 'real' ? 'Con el gasto real' : 'Con el gasto teórico'} de ${plural(students, 'alumno', 'alumnos')} en ${plural(days, 'día', 'días')}`,
      value: (amount: string) => `${amount} por alumno al mes`,
      simulatedNote:
        'Es teórico, calculado con respuestas simuladas. Con una clave de IA el número será el real.',
      noEstimate:
        'Todavía no hay una estimación del plan maestro con la que compararlo. Se escribe en Configuración.',
      above: (estimate: string) =>
        `Va por encima de la estimación del plan maestro, de ${estimate}.`,
      below: (estimate: string) =>
        `Va por debajo de la estimación del plan maestro, de ${estimate}.`,
    },
    log: {
      title: 'Bitácora de llamadas',
      hint: (shown: number, total: number) =>
        `Se muestran ${usd(shown)} de ${usd(total)}, las más recientes primero`,
      filterEngine: 'Motor',
      filterMode: 'Modo',
      filterOutcome: 'Resultado',
      all: 'Todos',
      none: 'Ninguna llamada coincide con los filtros.',
      tokens: (input: number, output: number) => `${usd(input)} entrada, ${usd(output)} salida`,
      theoretical: 'teórico',
    },
    modes: {
      real: 'Real',
      mock: 'Simulado',
      template: 'Respuestas fijas',
    },
    outcomes: {
      ok: 'Bien',
      retried_ok: 'Bien tras reintento',
      fallback: 'Cayó a la plantilla',
      error: 'Error',
    },
  },

  adminDemo: {
    title: 'Datos de demostración',
    notDemo: {
      title: 'Estás en Mi cuenta',
      description:
        'Los datos de demostración viven en una base aparte que nunca se mezcla con la tuya. Cambia a la base de demostración para generarlos, borrarlos o ajustarlos.',
      go: 'Ir a Cuenta y datos',
    },
    stats: {
      label: 'Datos de demostración en cifras',
      simulated: 'Alumnos simulados',
      simulatedCaption: 'con sus parámetros verdaderos',
      demoStudent: 'Alumno de la demo',
      demoStudentCaption: 'con 60 días de historial',
      yes: 'Sí',
      no: 'No',
    },
    adjust: {
      title: 'Alumnos simulados',
      ready:
        'La demostración tiene datos. Regenerar los borra y los vuelve a crear con estos ajustes, y la misma semilla da siempre los mismos datos.',
      empty:
        'La demostración está vacía. Genera al alumno de la demostración y los alumnos simulados con estos ajustes.',
    },
    fields: {
      cohort: 'Cantidad de alumnos',
      cohortHint: (min: number, max: number) =>
        `De ${min} a ${max}. Con menos se genera más rápido`,
      cohortError: (min: number, max: number) => `Escribe un número entero de ${min} a ${max}.`,
      seed: 'Semilla',
      seedHint: 'Letras, números, guion y guion bajo',
      seedError: 'Usa de 1 a 40 letras, números, guiones o guiones bajos, sin espacios.',
      examDate: 'Fecha del ENARM del alumno de la demo',
      examDateHint: 'Si la dejas vacía se usa la provisional',
      examDateError: 'Escribe una fecha válida.',
    },
    generate: 'Generar datos de demostración',
    regenerate: 'Regenerar con estos ajustes',
    clear: 'Borrar todo',
    confirmRegenerate:
      'Se borra toda la base de demostración y se vuelve a generar con estos ajustes. Tu cuenta real no se toca.',
    confirmRegenerateYes: 'Sí, borrar y regenerar',
    confirmClear:
      'Se borra toda la base de demostración y se queda vacía. Tu cuenta real no se toca. No se puede deshacer.',
    confirmClearYes: 'Sí, borrar todo',
    cancel: 'Cancelar',
    working: {
      generate: 'Generando datos simulados…',
      regenerate: 'Regenerando datos simulados…',
      clear: 'Borrando la demostración…',
    },
    done: {
      generate: (events: number) =>
        `Listo. Se guardaron ${events.toLocaleString('es-MX')} eventos simulados.`,
      regenerate: (events: number) =>
        `Listo. Se regeneró todo con ${events.toLocaleString('es-MX')} eventos simulados.`,
      clear: (_events: number) => 'Listo. La demostración quedó vacía.',
    },
    error: 'No se pudo completar la acción. Intenta de nuevo.',
  },

  adminConfig: {
    thresholds: {
      'difficulty.provisionalResponses': {
        label: 'Dificultad provisional',
        hint: 'Respuestas por pregunta para mostrar una dificultad provisional (V).',
      },
      'difficulty.calibratedResponses': {
        label: 'Dificultad calibrada',
        hint: 'Respuestas por pregunta para darla por calibrada (V).',
      },
      'sampling.variantExposuresForExam': {
        label: 'Variante en el puntaje del examen',
        hint: 'Exposiciones por distractor para que una variante cuente en el examen (J).',
      },
      'sampling.nonFunctionalRate': {
        label: 'Distractor no funcional',
        hint: 'Fracción de elección por debajo de la cual un distractor no funciona (J).',
      },
      'sampling.nonFunctionalExposures': {
        label: 'Exposiciones para juzgar un distractor',
        hint: 'Exposiciones antes de decir que no es funcional (J).',
      },
      'bias.minTaggedErrors': {
        label: 'Patrón por sesgo',
        hint: 'Errores etiquetados para hablar de un patrón por sesgo (J).',
      },
      'bias.minKappaForBiasLanguage': {
        label: 'Kappa para hablar de sesgos',
        hint: 'Con menos, la app habla de trampas y no de sesgos (J).',
      },
      'bias.doubleLabelShare': {
        label: 'Doble etiquetado',
        hint: 'Fracción de las preguntas que etiquetan dos médicos (J).',
      },
      'bias.minLabeledPairs': {
        label: 'Pares para fiarse de kappa',
        hint: 'Opciones etiquetadas por dos médicos antes de hablar de sesgos (J).',
      },
      'topics.maxIntervalWidth': {
        label: 'Dominio por tema',
        hint: 'Ancho máximo del intervalo de 95% para mostrar el dominio (J).',
      },
      'structure.minResponsesPerCategory': {
        label: 'Estructura por alumno',
        hint: 'Respuestas por categoría para mostrar el análisis de estructura (J).',
      },
      'forgetting.findingsForPattern': {
        label: 'Patrón de olvido',
        hint: 'Hallazgos del mismo tipo para confirmar un patrón y llamar a la IA (J).',
      },
      'forgetting.patternWindowDays': {
        label: 'Ventana del patrón',
        hint: 'Días en los que cuentan esos hallazgos (J).',
      },
      'fsrs.optimizeAfterReviews': {
        label: 'Optimizar FSRS por alumno',
        hint: 'Repasos para optimizar los parámetros de cada alumno. Fuera del prototipo (J).',
      },
      'fsrs.desiredRetention': {
        label: 'Retención deseada',
        hint: 'Entre 0.80 y 0.97. Cuanto más alta, más repasos (J).',
      },
    },
    thresholdsForm: {
      title: 'Umbrales de calibración',
      hint: 'Cada función que depende de datos muestra calibrando hasta llegar a su umbral. Aquí los ajustas. Los cambios valen en este navegador y se aplican al recargar la app.',
      factory: (value: string) => `De fábrica ${value}.`,
      save: 'Guardar umbrales',
      reset: 'Restablecer de fábrica',
      reload: 'Recargar ahora',
      saved: 'Guardado. Se aplica al recargar la app.',
      resetDone: 'Restablecido. Se aplica al recargar la app.',
      failed: 'No se pudo guardar. Revisa que el navegador permita guardar datos.',
      notNumber: 'Escribe un número.',
      notInteger: 'Escribe un número entero.',
    },
    weightsForm: {
      title: 'Pesos del ENARM',
      hint: 'El peso de cada rama y de cada tema decide cuánto cuenta en el dominio, el examen y el plan.',
      provisional:
        'Los de fábrica son provisionales, iguales por rama, hasta que haya los oficiales. Se guardan en este navegador y se aplican al recargar la app.',
      branchSummary: (weight: number, topics: number) =>
        `Peso ${weight} · ${plural(topics, 'tema', 'temas')}`,
      branchWeight: (name: string) => `Peso de la rama ${name}`,
      invalid: 'Escribe un número mayor que 0 y hasta 100.',
      save: 'Guardar pesos',
      reset: 'Restablecer de fábrica',
      reload: 'Recargar ahora',
      saved: 'Guardado. Se aplica al recargar la app.',
      resetDone: 'Restablecido. Se aplica al recargar la app.',
      failed: 'No se pudo guardar. Revisa que el navegador permita guardar datos.',
    },
    aiForm: {
      title: 'Modelos, precios y límites de la IA',
      hint: 'Se guardan en el proxy local y se aplican al instante. También viven en server/ai-config.local.json, que queda fuera de git. La clave nunca pasa por aquí.',
      noProxy:
        'No hay proxy de IA disponible, como en la demo publicada. Con el proxy encendido aquí cambias el modelo de cada motor, los precios y los límites. Mientras tanto viven en server/ai-config.local.json.',
      modelsTitle: 'Modelo y límite por motor',
      promptVersion: (version: string) => `Prompt ${version}`,
      model: 'Modelo',
      effort: 'Esfuerzo',
      effortHint: 'Haiku 4.5 no lo acepta',
      effortNone: 'Sin esfuerzo',
      efforts: { low: 'Bajo', medium: 'Medio', high: 'Alto' },
      maxTokens: 'Tope de tokens de salida',
      perStudent: 'Llamadas por alumno al día',
      budgetTitle: 'Presupuesto diario',
      budget: 'Presupuesto diario en dólares',
      budgetHint:
        'Al llegar a esta cifra la IA se pausa hasta el día siguiente. Solo cuenta el gasto real.',
      pricesTitle: 'Precios por millón de tokens',
      pricesHint:
        'En dólares. Las cuatro columnas son entrada, salida, escritura de caché y lectura de caché.',
      priceInput: 'Entrada',
      priceOutput: 'Salida',
      priceCacheWrite: 'Escritura de caché',
      priceCacheRead: 'Lectura de caché',
      newModelTitle: 'Agregar un modelo',
      newModelHint:
        'Para usar un modelo que no está en la lista, escribe su ID sin sufijo de fecha y sus precios.',
      newModelId: 'ID del modelo',
      save: 'Guardar en el proxy',
      saving: 'Guardando…',
      discard: 'Descartar cambios',
      saved: 'Guardado en el proxy. Ya se aplica.',
      unknownModel: 'Ese modelo no tiene precio.',
      tokensError: 'Un entero de 200 a 32,000.',
      limitError: 'Un entero de 1 a 10,000.',
      budgetError: 'Un número de 0 a 100,000.',
      priceError: 'Un número de 0 en adelante.',
      newModelIdError: 'Empieza con claude- y va sin fecha al final.',
      estimate: {
        title: 'Estimación del plan maestro',
        hint: 'Costo de IA por alumno al mes que prevé el plan maestro. La pantalla de costos la usa para decir si vas por encima o por debajo. Se guarda en este navegador.',
        label: 'Dólares por alumno al mes',
        save: 'Guardar estimación',
        saved: 'Guardada.',
        failed: 'No se pudo guardar. Revisa que el navegador permita guardar datos.',
      },
    },
  },
};
