// Textos del área del médico de la Fase E (pantallas 18 a 22), en español de México con trato de tú
// (4.9). Se integran en t desde es-MX.ts.
import { plural } from './features';
import { taskNames } from './insights';

const num = (value: number) => value.toLocaleString('es-MX');

export const physicianText = {
  /** Las descripciones de las pantallas del médico. Sus títulos siguen en t.screens */
  descriptions: {
    questionEditor:
      'Caso, enunciado, hasta 10 opciones con su etiqueta, set canónico, explicación, referencias, la fuente del texto en inglés, versiones y la revisión a ciegas.',
    agreement:
      'Acuerdo entre la etiqueta del autor y la que pone a ciegas el revisor, con kappa, y lo que te falta etiquetar.',
  },
  /** Banco de preguntas (pantalla 17). Salió de t para no pesar en lo que la app carga al abrir */
  bank: {
    listTitle: 'Preguntas',
    search: 'Buscar en la pregunta o el caso',
    all: 'Todas',
    statusLabel: 'Estado',
    pages: 'Páginas del banco',
    previous: 'Anterior',
    next: 'Siguiente',
    pageOf: (page: number, total: number) => `Página ${page} de ${total}`,
    physicianHint: 'Las preguntas que te asignaron para revisar.',
    adminHint: 'Todo el banco, con a quién está asignada cada pregunta.',
    emptyTitle: 'Todavía no tienes preguntas asignadas',
    emptyBody: 'Un admin te asignará subespecialidades para revisar.',
    count: (n: number) => `${n.toLocaleString('es-MX')} preguntas`,
    status: {
      draft: 'Borrador',
      in_review: 'En revisión',
      approved: 'Aprobada',
      rejected: 'Rechazada',
    },
    statsLabel: 'Preguntas por estado',
    unassigned: 'Sin asignar',
    importBank: 'Importar banco',
    // Sección del examen (B13). Español son las ramas clínicas e Inglés es Inglés médico
    sectionLabel: 'Sección',
    sections: { clinical: 'Español', english: 'Inglés' } as Record<string, string>,
  },
  agreementScreen: {
    stats: {
      label: 'Etiquetado a ciegas en cifras',
      pending: 'Por etiquetar',
      pendingCaption: 'preguntas en revisión que te esperan',
      pairs: 'Pares',
      pairsCaption: 'del autor y del revisor',
      kappa: 'Kappa',
      kappaCaption: 'acuerdo más allá del azar',
      noKappa: 'Sin medir',
    },
    vocabulary: {
      title: 'Cómo habla la app del alumno',
      trap: 'La interfaz del alumno habla de trampas, porque todavía no se puede afirmar que los médicos coincidan en el sesgo de cada distractor.',
      bias: 'La interfaz del alumno habla de sesgos, porque los médicos coinciden lo suficiente al etiquetar.',
      rule: (threshold: number) =>
        `Habla de sesgos con kappa de ${threshold.toLocaleString('es-MX')} o más.`,
      calibrating: 'Faltan distractores etiquetados a ciegas por un revisor para fiarse de kappa.',
      unit: 'pares de autor y revisor',
      current: (kappa: string, lower: string, upper: string) =>
        `Kappa global ${kappa}, con intervalo de 95 % de ${lower} a ${upper}.`,
    },
    byTag: {
      title: 'Acuerdo por etiqueta',
      hint: 'Las etiquetas con menos acuerdo van primero. Ahí conviene revisar la definición con el otro médico.',
      tag: 'Etiqueta',
      kappa: 'Kappa',
      interval: 'Intervalo de 95 %',
      pairs: 'Pares',
      undefined: 'No definido',
      none: 'Todavía no hay pares con los que medir el acuerdo por etiqueta.',
    },
    queue: {
      title: 'Por etiquetar a ciegas',
      hint: 'Las preguntas que revisas y que esperan tu etiquetado a ciegas. Ábrelas en el editor y etiqueta el sesgo que explota cada distractor, sin ver lo que puso el autor.',
      empty:
        'No tienes preguntas en revisión por etiquetar. O ya terminaste, o todavía no te mandan preguntas a revisar.',
      adminNote:
        'Las etiquetas las ponen los médicos al revisar cada pregunta. Aquí ves cómo va el acuerdo. Para etiquetar entra como médico.',
      progress: (done: number, total: number) => `${done} de ${total} etiquetados`,
      open: 'Etiquetar a ciegas',
      failed: 'No se pudo leer tu cola. Intenta de nuevo.',
      remaining: (n: number) => plural(n, 'pregunta por etiquetar', 'preguntas por etiquetar'),
    },
    failed: 'No se pudo leer el acuerdo. Intenta de nuevo.',
    retry: 'Intentar de nuevo',
  },

  questionEditor: {
    back: 'Volver al banco',
    edit: 'Editar',
    noQuestion: {
      title: 'Elige una pregunta',
      description: 'Abre una pregunta desde el banco y toca Editar para llegar aquí.',
    },
    notFound: {
      title: 'No encontramos esa pregunta',
      description: 'Puede que ya no exista en esta base. Vuelve al banco y elige otra.',
    },
    notAssigned: {
      title: 'Esta pregunta no es tuya',
      description: 'Solo editas las preguntas que un admin te asignó. Pídele que te la asigne.',
    },
    blind: {
      title: 'Primero etiqueta a ciegas',
      description:
        'Esta pregunta está en el doble etiquetado y todavía te faltan distractores por etiquetar. Para que tus etiquetas salgan a ciegas, el editor se abre cuando termines.',
      cta: 'Ir a mi cola de etiquetado',
    },
    status: {
      title: 'Estado de la versión',
      version: (n: number) => `Versión ${n}`,
      hint: 'Lo que editas se guarda como una versión nueva en borrador. Las anteriores no cambian y siguen en el historial.',
      move: {
        draft: 'Regresar a borrador',
        in_review: 'Enviar a revisión',
        approved: 'Aprobar',
        rejected: 'Rechazar',
      } as Record<string, string>,
      reopen: 'Reabrir revisión',
      moved: (status: string) => `La versión quedó en ${status.toLowerCase()}.`,
      failed: 'No se pudo cambiar el estado. Intenta de nuevo.',
      stale: 'Hay una versión más nueva de esta pregunta. Recarga para verla.',
      unverifiedGpc: (n: number) =>
        n === 1
          ? 'Una referencia de GPC sigue por verificar.'
          : `${n} referencias de GPC siguen por verificar.`,
      unsaved: 'Guarda o descarta tus cambios antes de cambiar el estado.',
    },
    sections: {
      case: 'Caso y enunciado',
      options: 'Opciones',
      meta: 'Explicación, tema y estructura',
      gpc: 'Referencias de GPC',
      history: 'Historial de versiones',
    },
    case: {
      vignette: 'Viñeta clínica',
      vignetteHint: 'Déjala vacía si la pregunta es directa.',
      vignetteSerial:
        'Esta viñeta es del caso seriado. Editarla crea un caso nuevo y queda fuera de este editor.',
      prompt: 'Frase de la pregunta',
      promptHint: 'Ahí se buscan las negaciones. No pongas el caso en esta frase.',
      // Inglés médico (B13). El texto de lectura es la viñeta del caso
      vignetteEnglish: 'Texto en inglés',
      vignetteEnglishHint:
        'El texto de lectura, en inglés y tal como sale de su fuente, hasta 8,000 caracteres. Déjalo vacío solo si la pregunta no lleva texto.',
      promptEnglish: 'Pregunta en inglés',
      promptEnglishHint: 'Ahí se buscan las negaciones en inglés, como NOT, EXCEPT o LEAST.',
    },
    // Inglés médico (B13). El idioma sale de la rama y no se elige
    language: {
      badge: 'Inglés',
      note: 'Esta pregunta es en inglés porque su rama es Inglés médico. El texto, la pregunta y las opciones van en inglés, y la explicación y las justificaciones en español.',
    },
    // La fuente del texto de una pregunta en inglés (B13, 1.4 y 5.4 del plan de B13)
    passage: {
      title: 'Fuente del texto',
      hint: 'Cada texto en inglés lleva su fuente y su licencia a la vista junto al texto. Sin una fuente con una licencia aceptada, la pregunta no se puede aprobar.',
      sourceTitle: 'Título de la fuente',
      sourceTitleHint:
        'Como aparece en la página, con quien la publica. Con el texto propio del equipo se deja vacío.',
      license: 'Licencia del texto',
      licensePick: 'Elige la licencia',
      licenseOutside: (name: string) => `${name} (no está en la lista)`,
      url: 'Enlace del texto',
      urlHint:
        'La dirección completa de donde sale el texto, con https. El texto propio del equipo no la pide.',
      accepted:
        'Se aceptan texto propio del equipo, dominio público, CC0, CC BY y CC BY-SA, con el texto sin cambios. No se acepta nada con NC ni ND.',
      preview: 'Así se verá bajo el texto',
      complete: 'La fuente está completa.',
      titleMissing: 'Escribe el título de la fuente.',
      licenseNotAllowed: 'Esta licencia no está en la lista. Elige una de las que se aceptan.',
      urlMissing: 'Escribe el enlace de donde sale el texto.',
      urlInvalid: 'Escribe el enlace completo, con https://.',
    },
    options: {
      count: (n: number) => `${n} de 10 opciones`,
      hint: 'Una sola correcta y de 4 a 10 en total. El set canónico es lo que ve el alumno por defecto.',
      title: (n: number) => `Opción ${n}`,
      text: 'Texto de la opción',
      correct: 'Es la correcta',
      key: 'Clave',
      distractor: 'Distractor',
      tag: 'Sesgo o trampa que explota',
      tagNone: 'Elige una etiqueta',
      secondary: 'Otros sesgos que también aplican',
      secondaryHint: 'No entran al cálculo de kappa.',
      rationale: 'Por qué atrae, o por qué es correcta',
      canonical: 'En el set canónico',
      canonicalHint: 'Con ella en el set, el alumno la ve por defecto.',
      remove: 'Quitar opción',
      removed: 'Opción quitada.',
      add: 'Agregar opción',
      full: 'Ya tienes 10 opciones.',
      minimum: 'Una pregunta lleva al menos 4 opciones.',
    },
    meta: {
      explanation: 'Explicación',
      explanationHint: 'Qué explica la clave y por qué las demás no.',
      branch: 'Rama troncal',
      topic: 'Subespecialidad',
      subtopic: 'Subtema',
      difficulty: 'Dificultad estimada',
      difficultyOption: (n: number) =>
        ['Muy fácil', 'Fácil', 'Media', 'Difícil', 'Muy difícil'][n - 1] ?? String(n),
      structure: 'Estructura de la pregunta',
      structureHint: 'Tu etiqueta gana sobre la automática.',
      polarity: 'Polaridad',
      task: 'Tipo de tarea',
      format: 'Formato',
      auto: (summary: string) => `Sugerencia automática ${summary}`,
      useAuto: 'Usar la sugerencia',
      autoNone: 'El motor no detectó la tarea de esta pregunta.',
      taskPick: 'Elige la tarea',
      polarities: { affirmative: 'Afirmativa', negative: 'Negativa' } as Record<string, string>,
      formats: {
        clinical_case: 'Caso clínico',
        direct: 'Directa',
        serial_case: 'Caso seriado',
      } as Record<string, string>,
      tasks: Object.fromEntries(
        Object.entries(taskNames).map(([key, name]) => [
          key,
          name.charAt(0).toUpperCase() + name.slice(1),
        ]),
      ) as Record<string, string>,
      kinds: 'Tipo de reactivo',
      kindsHint: 'Marca los reactivos que son imperfectos a propósito. Ningún tipo se rechaza.',
      kindNames: {
        inverse_resolution: 'Resolución inversa',
        incoherent: 'Con incoherencias',
        control: 'De control',
        obscure_detail: 'Con datos oscuros',
        patient_perspective: 'Desde el paciente',
      } as Record<string, string>,
      clues: 'Datos del caso y su fuerza',
      cluesHint: 'Qué tanto define cada dato al diagnóstico.',
      clueText: 'Dato del caso',
      clueStrength: 'Fuerza',
      strengths: {
        pathognomonic: 'Patognomónico',
        characteristic: 'Característico',
        nonspecific: 'Inespecífico',
      } as Record<string, string>,
      addClue: 'Agregar dato',
      removeClue: 'Quitar dato',
    },
    gpc: {
      hint: 'Solo el título general de la guía. No pongas claves, años ni páginas que no hayas comprobado.',
      title: 'Título de la guía',
      status: 'Estado',
      toVerify: 'Por verificar',
      verified: 'Verificada',
      add: 'Agregar referencia',
      remove: 'Quitar referencia',
      none: 'Sin referencias todavía.',
    },
    history: {
      hint: 'Cada versión es inmutable. Aquí ves qué cambió respecto a la anterior.',
      current: 'Actual',
      first: 'Primera versión',
      noChanges: 'Sin cambios de contenido',
      changed: (parts: string[]) => `Cambió ${parts.join(', ')}`,
      parts: {
        vignette: 'la viñeta',
        source: 'la fuente del texto',
        prompt: 'la frase de la pregunta',
        options: 'las opciones',
        tags: 'las etiquetas',
        canonical: 'el set canónico',
        explanation: 'la explicación',
        taxonomy: 'el tema',
        structure: 'la estructura',
        difficulty: 'la dificultad',
        gpc: 'las referencias',
        itemKinds: 'el tipo de reactivo',
        cognitive: 'el nivel cognitivo',
        clues: 'los datos del caso',
      } as Record<string, string>,
      at: (date: string) => `Guardada el ${date}`,
    },
    save: {
      saved: 'Guardaste la versión nueva en borrador.',
      failed: 'No se pudo guardar. Intenta de nuevo.',
      invalid: 'Corrige esto antes de guardar',
      noChanges: 'No hay cambios que guardar.',
    },
    issues: {
      prompt_empty: 'La frase de la pregunta no puede estar vacía.',
      prompt_long: 'La frase de la pregunta pasa de 1,000 caracteres.',
      vignette_long: 'La viñeta pasa de 8,000 caracteres.',
      explanation_long: 'La explicación pasa de 4,000 caracteres.',
      topic_mismatch: 'La subespecialidad no es de esa rama.',
      subtopic_mismatch: 'El subtema no es de esa subespecialidad.',
      difficulty_range: 'La dificultad va de 1 a 5.',
      options_count: 'La pregunta lleva de 4 a 10 opciones.',
      correct_count: 'Marca exactamente una opción como correcta.',
      option_text_empty: 'Escribe el texto de la opción.',
      option_text_long: 'El texto de la opción pasa de 1,000 caracteres.',
      option_text_repeated: 'El texto se repite con otra opción.',
      option_rationale_empty: 'Explica por qué atrae, o por qué es correcta.',
      option_rationale_long: 'La explicación de la opción pasa de 1,500 caracteres.',
      option_tag_missing: 'Elige el sesgo que explota este distractor.',
      option_tag_unknown: 'Esa etiqueta no se puede usar en un distractor.',
      option_secondary_repeats: 'La etiqueta principal no se repite entre las otras.',
      option_secondary_many: 'Son demasiadas etiquetas adicionales. El máximo es 5.',
      canonical_count: 'El set canónico lleva al menos 2 opciones.',
      canonical_without_correct: 'El set canónico incluye la correcta.',
      canonical_without_distractor: 'El set canónico incluye al menos un distractor.',
      gpc_empty: 'Una referencia de GPC no tiene título.',
      clue_empty: 'Un dato del caso no tiene texto.',
      task_missing: 'Elige la tarea de la pregunta. No se pudo detectar sola.',
      passage_long: 'La fuente del texto pasa de 300 caracteres. Acorta el enlace.',
      language_branch_mismatch:
        'El idioma no va con la rama. Inglés médico va en inglés y las demás ramas en español.',
    } as Record<string, string>,
    issueAt: (n: number, message: string) => `Opción ${n}. ${message}`,
  },

  reportsScreen: {
    stats: {
      label: 'Reportes por estado',
      open: 'Abiertos',
      resolved: 'Resueltos',
      dismissed: 'Descartados',
    },
    hintPhysician: 'Errores que los alumnos reportan en las preguntas que te asignaron.',
    hintAdmin: 'Errores que los alumnos reportan en cualquier pregunta del banco.',
    filter: {
      label: 'Qué reportes ver',
      open: 'Abiertos',
      resolved: 'Resueltos',
      dismissed: 'Descartados',
      all: 'Todos',
    },
    empty: {
      openTitle: 'No hay reportes abiertos',
      openDescription: 'Cuando un alumno reporte un error en una pregunta, lo verás aquí.',
      otherTitle: 'No hay reportes en esta vista',
      otherDescription: 'Cambia el filtro para ver los demás.',
    },
    notes: (n: number) =>
      n === 1
        ? 'Hay un reporte de un apunte de alumno. Los apuntes son privados y no se revisan aquí.'
        : `Hay ${num(n)} reportes de apuntes de alumnos. Los apuntes son privados y no se revisan aquí.`,
    group: {
      title: 'Reportes de una pregunta',
      open: (n: number) => plural(n, 'abierto', 'abiertos'),
      total: (n: number) => plural(n, 'reporte', 'reportes'),
      edit: 'Abrir en el editor',
      showQuestion: 'Ver la pregunta',
      resolveOpen: (n: number) => `Resolver ${num(n)} abiertos`,
      dismissOpen: (n: number) => `Descartar ${num(n)} abiertos`,
      outdatedHint:
        'Algunos reportes son de una versión anterior. Si ya corregiste la pregunta, resuélvelos.',
    },
    row: {
      reportedOn: (date: string) => `Reportado el ${date}`,
      version: (n: number | null) => (n === null ? 'Versión que ya no está' : `Versión ${n}`),
      outdated: 'Versión anterior',
      resolve: 'Resolver',
      dismiss: 'Descartar',
      reopen: 'Reabrir',
      status: { open: 'Abierto', resolved: 'Resuelto', dismissed: 'Descartado' } as Record<
        string,
        string
      >,
      resolvedOn: (date: string) => `Cerrado el ${date}`,
    },
    changed: (n: number, status: string) =>
      n === 1
        ? `Un reporte quedó como ${status.toLowerCase()}.`
        : `${num(n)} reportes quedaron como ${status.toLowerCase()}.`,
    failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  },

  draftsScreen: {
    stats: {
      label: 'Borradores por revisar',
      questions: 'Preguntas',
      tips: 'Consejos',
      cards: 'Tarjetas',
    },
    hint: 'Todo lo que escribe la IA entra aquí como borrador y no llega a un alumno hasta que un médico lo apruebe.',
    sections: {
      label: 'Qué revisar',
      questions: 'Preguntas reestructuradas',
      tips: 'Consejos por sesgo',
      cards: 'Tarjetas de mazos públicos',
    },
    draftLabel: 'Borrador de IA pendiente de revisión médica',
    questions: {
      requestTitle: 'Pedir una propuesta',
      requestHint:
        'Elige una pregunta marcada y cómo reestructurarla. La propuesta llega aquí como borrador, con la original al lado.',
      markedHint:
        'Solo se reestructuran las preguntas marcadas, las que tienen un reporte de error abierto o un distractor que casi nadie elige. Las de Inglés médico no se reestructuran con IA.',
      markedEmpty:
        'Todavía no hay preguntas marcadas. Aparecen cuando un alumno reporta un error o cuando un distractor casi no se elige.',
      markedFailed:
        'No se pudieron leer los reportes y los distractores. Intenta de nuevo más tarde.',
      markedCount: (n: number) => plural(n, 'pregunta marcada', 'preguntas marcadas'),
      markReasons: {
        open_report: 'Reporte de error abierto',
        non_functional_distractor: 'Distractor que casi nadie elige',
      } as Record<string, string>,
      search: 'Buscar una pregunta marcada',
      searchHint: 'Escribe parte de la frase o del caso.',
      noResults: 'No hay preguntas marcadas con ese texto que se puedan reestructurar.',
      pick: 'Elegir',
      chosen: 'Pregunta elegida',
      transform: 'Cómo reestructurarla',
      transforms: {
        to_except: 'Cambiar a una pregunta de excepto',
        change_anchor: 'Cambiar el dato que ancla el caso',
        next_step: 'Mover la pregunta al siguiente paso del manejo',
      } as Record<string, string>,
      ask: 'Proponer con IA',
      asking: 'Pidiendo la propuesta',
      created: 'La propuesta quedó en la cola, abajo.',
      reused: 'Ya había una propuesta igual esperando revisión. Es la de abajo.',
      failed: {
        serial_case: 'Las preguntas de un caso seriado no se reestructuran.',
        variant: 'Una variante no se reestructura otra vez.',
        few_options: 'La pregunta necesita al menos dos opciones en su set canónico.',
        english:
          'Las preguntas en inglés no se reestructuran con IA. Solo se reestructura el banco en español.',
        offline: 'Esta función necesita conexión.',
        not_marked:
          'Esa pregunta no está marcada. Solo se reestructuran las que tienen un reporte abierto o un distractor que casi nadie elige.',
        invalid_output:
          'La propuesta no pasó las revisiones automáticas. Pasa con las preguntas de salud mental, que no se reestructuran con IA. Prueba con otra pregunta.',
        bad_response:
          'La propuesta no pasó las revisiones automáticas. Pasa con las preguntas de salud mental, que no se reestructuran con IA. Prueba con otra pregunta.',
        other: 'No se pudo pedir la propuesta. Intenta de nuevo.',
      } as Record<string, string>,
      pendingTitle: 'Propuestas por revisar',
      pendingEmpty: 'No hay propuestas por revisar. Pide una arriba.',
      original: 'Pregunta original',
      proposal: 'Propuesta',
      rationale: 'Qué cambió',
      quote: 'Frase de la explicación original que la respalda',
      modes: {
        template: 'Respuesta de ejemplo, sin IA',
        mock: 'Respuesta de ejemplo del modo simulado',
        real: 'Escrita por el modelo',
      } as Record<string, string>,
      reviewHint:
        'Completa la etiqueta y la razón de cada opción nueva y ajusta lo que necesites. Las reglas son las del editor.',
      approve: 'Aprobar como variante',
      approveHint:
        'La variante entra al banco aprobada y no cuenta para el examen hasta tener las exposiciones mínimas.',
      reject: 'Rechazar',
      approvedNotice: 'Variante creada. Ya está en el banco.',
      rejectedNotice: 'Propuesta rechazada. No se creó nada.',
      decisionFailed: 'No se pudo guardar la decisión. Intenta de nuevo.',
      decidedTitle: 'Propuestas ya decididas',
      decidedEmpty: 'Todavía no has decidido ninguna.',
      status: {
        approved: 'Aprobada',
        edited: 'Aprobada con cambios',
        rejected: 'Rechazada',
        draft: 'Borrador',
      } as Record<string, string>,
      openVariant: 'Abrir la variante en el editor',
      decidedOn: (date: string) => `Decidida el ${date}`,
      originalGone: 'La pregunta original ya no está en el banco.',
    },
    tips: {
      hint: 'El texto base de cada consejo es un borrador. Apruébalo, edítalo o recházalo. Los alumnos ven lo aprobado sin la marca de borrador y no ven lo rechazado.',
      status: {
        draft: 'Borrador',
        approved: 'Aprobado',
        edited: 'Aprobado con cambios',
        rejected: 'Rechazado',
      } as Record<string, string>,
      text: 'Texto del consejo',
      base: 'Texto base',
      count: (n: number, max: number) => `${num(n)} de ${num(max)} caracteres`,
      approve: 'Aprobar',
      reject: 'Rechazar',
      reopen: 'Volver a borrador',
      saved: 'Decisión guardada.',
      invalid: (min: number, max: number) =>
        `El consejo lleva de ${num(min)} a ${num(max)} caracteres.`,
      failed: 'No se pudo guardar. Intenta de nuevo.',
    },
    cards: {
      hint: 'Tarjetas de mazos públicos que esperan una decisión. Aparecen cuando un alumno sigue el mazo.',
      empty: {
        title: 'No hay tarjetas por revisar',
        description:
          'Cuando un alumno siga un mazo público, sus tarjetas en borrador llegan aquí para que las apruebes o las rechaces.',
      },
      approve: 'Aprobar',
      reject: 'Rechazar',
      showMore: (n: number) => `Mostrar ${num(n)} más`,
      remaining: (n: number) => plural(n, 'tarjeta por revisar', 'tarjetas por revisar'),
      decided: (status: string) => `Tarjeta ${status.toLowerCase()}.`,
      front: 'Frente',
      back: 'Reverso',
      failed: 'No se pudo guardar. Intenta de nuevo.',
    },
  },

  importScreen: {
    hint: 'Sube el banco que llenaste con la plantilla. Antes de guardar nada ves qué entra, qué se omite y por qué.',
    template: {
      title: 'Plantilla',
      hint: 'El Excel trae listas desplegables con los temas y los sesgos, y una fila de ejemplo que se omite. El CSV y el JSON usan los mismos encabezados.',
      excel: 'Plantilla de Excel',
      csv: 'Plantilla CSV',
      json: 'Plantilla JSON',
      guide: 'La guía de columnas está en docs/bank-import.md.',
    },
    file: {
      title: 'Archivo',
      label: 'Archivo del banco',
      hint: 'Excel (.xlsx), CSV o JSON, hasta 50 MB. Un ID en cada fila evita duplicados si lo subes otra vez.',
      reading: 'Leyendo el archivo',
      // El botón y el texto del input nativo salen en inglés, por eso van propios (H07 de B2)
      choose: 'Elegir archivo',
      none: 'Ningún archivo elegido',
    },
    errors: {
      unsupported: 'Ese formato no se puede leer. Usa Excel (.xlsx), CSV o JSON.',
      too_large: 'El archivo pasa de 50 MB. Divídelo en partes.',
      corrupt: 'No se pudo abrir el archivo. Revisa que no esté dañado.',
      empty: 'El archivo no tiene filas con datos.',
      too_many_rows: 'El archivo trae más de 20,000 filas. Divídelo en partes.',
      other: 'No se pudo leer el archivo. Intenta de nuevo.',
    } as Record<string, string>,
    summary: {
      title: 'Esto pasaría al importar',
      label: 'Resumen de la importación',
      rows: 'Filas leídas',
      ready: 'Listas',
      problems: 'Con problemas',
      unchanged: 'Sin cambios',
      newQuestions: (n: number) => plural(n, 'pregunta nueva', 'preguntas nuevas'),
      newVersions: (n: number) => plural(n, 'versión nueva de una pregunta', 'versiones nuevas'),
      unchangedDetail: (n: number) =>
        `${plural(n, 'ya está igual', 'ya están iguales')} en el banco.`,
      examples: (n: number) =>
        `Se omitió ${plural(n, 'fila de ejemplo', 'filas de ejemplo')} de la plantilla.`,
      draftNote: 'Todo entra como borrador. Un médico lo aprueba después desde el banco.',
    },
    problems: {
      title: 'Filas con problemas',
      hint: 'No se importan. Corrígelas en el archivo y vuelve a subirlo. Las que ya entraron no se duplican.',
      row: (n: number) => `Fila ${n}`,
      table: 'Archivo',
      id: 'ID',
      message: 'Problema',
      showMore: (n: number) => `Mostrar ${num(n)} más`,
      download: 'Descargar el reporte de errores',
      reportColumns: ['Fila', 'ID', 'Problema'] as const,
      reportFile: 'reporte-de-errores-del-banco.csv',
    },
    run: {
      import: (n: number) => `Importar ${num(n)} ${n === 1 ? 'pregunta' : 'preguntas'}`,
      nothing: 'No hay filas listas para importar.',
      importing: (done: number, total: number) => `Guardando ${num(done)} de ${num(total)}`,
      again: 'Revisar otro archivo',
    },
    done: {
      title: 'Importación terminada',
      created: (n: number) => `${plural(n, 'pregunta nueva', 'preguntas nuevas')} en el banco.`,
      newVersions: (n: number) =>
        `${plural(n, 'versión nueva', 'versiones nuevas')} de preguntas que ya estaban.`,
      unchanged: (n: number) => `${plural(n, 'pregunta sin cambios', 'preguntas sin cambios')}.`,
      failed: (n: number) =>
        `${plural(n, 'pregunta no se pudo guardar', 'preguntas no se pudieron guardar')}. Vuelve a subir el archivo para intentarlas otra vez.`,
      goBank: 'Ver el banco',
    },
  },

  // Banco en la nube (B11, 4.2 del plan de B11). Banco del médico, revisión a ciegas en el editor,
  // pendientes, avisos con casilla, conflictos con el Sheet, distractores y errores de las funciones
  bankScreen: {
    views: {
      label: 'Qué preguntas ver',
      to_review: 'Por revisar',
      my_drafts: 'Mis borradores',
      incomplete: 'Incompletas',
      reported: 'Con reporte',
      conflict: 'Con conflicto',
      published: 'Publicadas',
      all: 'Todas',
    } as Record<string, string>,
    open: 'Abrir',
    openQuestion: (key: string) => `Abrir la pregunta ${key}`,
    sheetId: (key: string) => `ID del Sheet ${key}`,
    fromSheet: 'Viene del Sheet',
    version: (n: number) => `Versión ${n}`,
    published: (n: number) => `Publicada la versión ${n}`,
    author: (alias: string) => `Autor ${alias}`,
    reviewer: (alias: string) => `Revisor ${alias}`,
    pending: (n: number) => plural(n, 'pendiente', 'pendientes'),
    flags: (n: number) => plural(n, 'aviso por confirmar', 'avisos por confirmar'),
    reports: (n: number) => plural(n, 'reporte abierto', 'reportes abiertos'),
    distractors: (n: number) =>
      plural(n, 'distractor que casi nadie elige', 'distractores que casi nadie eligen'),
    blindPending: 'Te falta etiquetar a ciegas',
    conflict: 'Conflicto con el Sheet',
    missing: 'Ya no está en el Sheet',
    retireRequested: 'El Sheet pide retirarla',
    retired: 'Retirada',
    noPreview: 'Sin texto que mostrar',
    emptyView: 'No hay preguntas en esta vista. Cambia el filtro para ver las demás.',
    failed: 'No se pudo leer el banco. Intenta de nuevo.',
    retry: 'Intentar de nuevo',
    importHint: 'Las preguntas se escriben en el Sheet del banco. La sincronización las trae aquí.',
    myReviews: {
      title: 'Mis revisiones del mes',
      hint: 'Se paga por pregunta revisada. Varias rondas sobre la misma pregunta en el mes cuentan una vez. Los distractores atendidos van aparte.',
      approved: 'Aprobadas',
      changesRequested: 'Cambios pedidos',
      rejected: 'Rechazadas',
      reviewed: 'Preguntas revisadas',
      distractors: 'Distractores atendidos',
    },
    demoNote:
      'En la demostración trabajas sobre el banco de este navegador. Tú eres el revisor de lo que tienes asignado y la etiqueta del autor es la del banco.',
  },

  review: {
    readOnly:
      'Solo lectura. Los médicos escriben, etiquetan y deciden. Desde aquí ves la pregunta completa y su historia.',
    notWriter: 'Esta pregunta no es tuya. Pide al admin que te la asigne para editarla.',
    sheet: {
      title: 'Esta pregunta viene del Sheet',
      body: (key: string) =>
        `Esta pregunta viene del Sheet (${key}). Corrígela en el Sheet para no crear un conflicto.`,
      editAnyway: 'Editar aquí de todos modos',
    },
    conflict: {
      title: 'Conflicto con el Sheet',
      body: 'El Sheet cambió esta pregunta y también se editó aquí. Nada se pisa hasta que elijas.',
      keepApp: 'Conservar la de la app',
      takeSheet: 'Usar la del Sheet',
      keptApp:
        'Se conserva la versión de la app. Copia tu corrección al Sheet para que vuelvan a coincidir.',
      tookSheet: 'La siguiente sincronización traerá el renglón del Sheet como versión nueva.',
      failed: 'No se pudo resolver el conflicto. Intenta de nuevo.',
    },
    blind: {
      title: 'Paso 1. Etiqueta a ciegas',
      hint: 'Elige el sesgo o la trampa que explota cada distractor. No ves lo que puso el autor ni sus justificaciones hasta terminar. Cada etiqueta se guarda al elegirla.',
      progress: (done: number, total: number) => `${done} de ${total} distractores etiquetados`,
      correct: 'Correcta. No se etiqueta.',
      option: (letter: string) => `Sesgo del distractor ${letter}`,
      choose: 'Elige una etiqueta',
      saved: (bias: string, letter: string) => `Guardaste ${bias} en la opción ${letter}.`,
      revealed: 'Terminaste el etiquetado. Ya ves la pregunta completa.',
      failed: 'No se pudo guardar la etiqueta. Intenta de nuevo.',
      locked: 'Tus etiquetas de esta versión ya están cerradas.',
    },
    decide: {
      title: 'Paso 2. Decide',
      hint: 'Ya ves lo del autor. Revisa qué cambió, los pendientes y los avisos antes de decidir.',
      changes: 'Qué cambió contra la versión anterior',
      firstVersion: 'Es la primera versión.',
      noChanges: 'Sin cambios de contenido.',
      incompleteTitle: 'Lo que le falta para aprobarse',
      incompleteNone: 'No le falta nada.',
      flagsTitle: 'Confirma antes de aprobar',
      comment: 'Comentario para el autor',
      commentHint: 'Obligatorio para pedir cambios o rechazar.',
      approve: 'Aprobar',
      requestChanges: 'Pedir cambios',
      reject: 'Rechazar',
      approvedPublished: 'Aprobaste la versión. Ya está publicada para los alumnos.',
      approvedWaiting:
        'Aprobaste la versión. Se publica cuando las demás preguntas de su caso estén aprobadas.',
      changesRequested: 'Pediste cambios. La versión regresó a borrador con tu comentario.',
      rejected: 'Rechazaste la versión. Lo publicado antes sigue publicado.',
      blockers: {
        incomplete: 'Faltan pendientes por completar.',
        flags: 'Faltan casillas por confirmar.',
      } as Record<string, string>,
    },
    submit: {
      title: 'Mandar a revisión',
      hint: 'La versión va al revisor asignado, que es otro médico. Antes tiene que estar completa.',
      action: 'Mandar a revisión',
      sent: 'Mandaste la versión a revisión.',
      incomplete: 'Completa los pendientes antes de mandarla.',
      decided:
        'Esta versión ya tiene una decisión. Guarda tus cambios como versión nueva para mandarla otra vez.',
    },
    waiting: 'Esta versión espera la decisión del revisor.',
    blindWaiting:
      'Eres el revisor. No ves lo del autor ni editas hasta etiquetar a ciegas, cuando la manden a revisión.',
    closed: (status: string) => `La versión más reciente quedó ${status.toLowerCase()}.`,
    saveNotes: {
      savedIncomplete: (n: number) =>
        `Guardaste la versión nueva en borrador. Le ${n === 1 ? 'falta' : 'faltan'} ${plural(n, 'pendiente', 'pendientes')} para aprobarse.`,
    },
    decisions: {
      title: 'Decisiones',
      names: {
        approve: 'Aprobó',
        request_changes: 'Pidió cambios',
        reject: 'Rechazó',
      } as Record<string, string>,
      by: (decision: string, alias: string, date: string) => `${decision} ${alias} el ${date}`,
    },
    source: {
      sheet: 'Del Sheet',
      import: 'Importada',
      app: 'Escrita en la app',
      ai_variant: 'Variante de IA',
    } as Record<string, string>,
    hiddenRationale: 'Escondida hasta que termines el etiquetado.',
    distractorFlags: (n: number) =>
      plural(n, 'distractor que casi nadie elige', 'distractores que casi nadie eligen'),
  },

  /** Lo que le falta a una versión para aprobarse (3.4), con la letra de la opción cuando aplica */
  incomplete: {
    task_undetected:
      'Falta la tarea. No se pudo detectar, así que escríbela en la columna Tarea del Sheet o elígela en el editor.',
    explanation_missing: 'Falta la explicación.',
    references_missing: 'Faltan las referencias.',
    rationale_missing: (letter: string) => `Falta la justificación de la opción ${letter}.`,
    bias_missing: (letter: string) => `Falta el sesgo del distractor ${letter}.`,
    bias_unknown: (letter: string) => `El sesgo del distractor ${letter} no está en la lista.`,
    prompt_missing: 'Falta la frase de la pregunta.',
    options_count: 'La pregunta lleva de 4 a 10 opciones.',
    correct_count: 'Marca exactamente una opción como correcta.',
    canonical_invalid: 'El set canónico lleva la correcta y al menos un distractor.',
    // Inglés médico (B13). Los dos primeros son pendientes y el tercero impide mandar a revisión
    passage_source_missing:
      'Falta la fuente del texto en inglés. Llena la fuente, la licencia y el enlace del texto.',
    license_not_allowed:
      'La licencia del texto en inglés no está en la lista. Elige Texto propio del equipo Studiare, Dominio público, CC0, CC BY o CC BY-SA.',
    language_branch_mismatch:
      'El idioma no va con la rama. Inglés médico va en inglés y las demás ramas en español.',
    other: (code: string) => `Pendiente ${code}.`,
  },

  /** La línea de la fuente del texto bajo un texto en inglés (B13, 2.3 y 5.4 del plan de B13) */
  sourceLine: {
    label: 'Fuente del texto.',
    incomplete: 'La fuente del texto está incompleta.',
    missing: 'Este texto en inglés no tiene fuente.',
    newTab: ' (se abre en otra pestaña)',
  },

  /** Avisos con casilla que el revisor confirma al aprobar (3.4) */
  flags: {
    topic_inferred: 'Confirmo la subespecialidad, que se dedujo del subtema.',
    kind_control_check: 'Confirmo que es un reactivo De control.',
    other: (code: string) => `Confirmo el aviso ${code}.`,
  },

  distractors: {
    title: 'Distractores que casi nadie elige',
    hint: 'Los marca la calibración cuando un distractor tiene muchas exposiciones y casi ninguna elección. Edita la pregunta, déjala así o descarta la marca.',
    calibrating:
      'Calibrando. La cola se llena cuando la calibración con los alumnos que dieron permiso empiece a mandar cifras.',
    question: (key: string) => `Pregunta ${key}`,
    figures: (exposures: number, choices: number, attraction: string) =>
      `${num(exposures)} exposiciones, ${num(choices)} elecciones, atracción de ${attraction}`,
    edit: 'Editar la pregunta',
    keep: 'Dejarla así',
    dismiss: 'Descartar',
    note: 'Nota opcional',
    resolved: {
      edited: 'Marcaste el distractor como editado.',
      kept: 'Dejaste el distractor así.',
      dismissed: 'Descartaste la marca.',
    } as Record<string, string>,
    failed: 'No se pudo guardar. Intenta de nuevo.',
  },

  importCloud: {
    physician:
      'Las preguntas se escriben en el Sheet del banco. La sincronización las trae al banco.',
    adminHint:
      'Con la nube, el archivo sube al banco de la nube en borrador, con el mismo convertidor y el mismo reporte de renglones que la sincronización del Sheet.',
    run: (n: number) => `Subir ${plural(n, 'renglón', 'renglones')} a la nube`,
    uploading: 'Subiendo a la nube',
    done: (created: number, versioned: number, rejected: number) =>
      `Listo. ${plural(created, 'pregunta nueva', 'preguntas nuevas')}, ${plural(versioned, 'versión nueva', 'versiones nuevas')} y ${plural(rejected, 'renglón rechazado', 'renglones rechazados')}.`,
    failed: 'No se pudo subir el archivo. Intenta de nuevo.',
    busy: 'Hay una sincronización en curso. Espera a que termine e intenta de nuevo.',
  },

  /** Errores de las funciones del banco, con lo que el médico puede hacer */
  errors: {
    stale: 'Alguien más guardó o sincronizó una versión nueva. Recargamos la pregunta.',
    same_author_reviewer:
      'Autor y revisor tienen que ser distintos. Pide al admin que asigne otro médico.',
    blind_labels: 'Primero termina el etiquetado a ciegas.',
    incomplete: 'La versión tiene pendientes. Complétalos antes de seguir.',
    not_assigned: 'No tienes asignada esta pregunta.',
    flags_unconfirmed: 'Confirma las casillas antes de aprobar.',
    sync_busy: 'Hay una sincronización en curso. Intenta en un minuto.',
    report_limit: 'Se llegó al tope de reportes del día.',
    deck_unauthorized:
      'Un mazo de terceros necesita la autorización confirmada por el dueño antes de publicarse.',
    deck_files_missing: 'Faltan archivos de esta versión del mazo. Vuelve a subirlos.',
    forbidden: 'No tienes permiso para hacer esto.',
    no_session: 'Tu sesión se cerró. Vuelve a entrar.',
    invalid: 'La base no aceptó el cambio. Revisa los datos e intenta de nuevo.',
    not_found: 'No encontramos esa pregunta.',
    network:
      'Necesitas conexión. El banco del equipo vive en el servidor. Revisa tu internet y tu sesión e intenta de nuevo.',
    unknown: 'Algo salió mal. Intenta de nuevo.',
  } as Record<string, string>,
};
