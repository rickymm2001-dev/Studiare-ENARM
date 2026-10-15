// Textos del admin para el banco en la nube (B11, 4.3 y 4.9 del plan de B11). Las pantallas Banco y
// Sheet, Revisiones de médicos y Catálogo de mazos, la sección Banco de Plataforma, la clave del Sheet
// en Usuarios, y una frase con su acción para cada código de renglón de la sincronización
// (SyncProblemCode y SyncNoticeCode de src/data/bank/contracts.ts) y para cada error BK de las funciones
// del banco. Español de México con trato de tú y sin signos de exclamación. No entran a t ni a lo que
// la app carga al abrir. Solo los importan las pantallas del admin, perezosas. El menú y los títulos de
// las pantallas viven en bankAdminNav.ts.
import type { SyncNoticeCode, SyncProblemCode } from '@/data/bank/contracts';
import type { ServerNoticeCode } from '@/data/cloud/bankAdmin';
import { plural } from './features';

const num = (value: number) => value.toLocaleString('es-MX');
/** El valor de una lista entre comillas, o nada si no viene */
const quoted = (value?: string) => (value ? ` ${value}` : '');

/** Cada motivo de rechazo de un renglón, con lo que hay que hacer en el Sheet (3.3 y 3.4) */
const problems: Record<SyncProblemCode, (column: string, value?: string) => string> = {
  id_missing: () => 'El renglón no tiene ID. Escribe el siguiente número fijo en la columna ID.',
  id_format: (_column, value) =>
    `El ID${quoted(value)} no tiene la forma de las claves del banco, como GO-0001. Corrígelo a mano, sin fórmula.`,
  id_duplicate: (_column, value) =>
    `El ID${quoted(value)} se repite en otro renglón. Cada pregunta lleva un ID que nunca se reusa.`,
  branch_unknown: (_column, value) =>
    `La rama troncal${quoted(value)} no está en la lista. Elígela en el desplegable.`,
  topic_unknown: (_column, value) =>
    `La subespecialidad${quoted(value)} no es de esa rama. Elige la subespecialidad en la lista.`,
  subtopic_unknown: (_column, value) =>
    `El subtema${quoted(value)} no es de esa subespecialidad. Elige el subtema en la lista.`,
  subtopic_is_topic: (_column, value) =>
    `El subtema${quoted(value)} es una subespecialidad. Elige el subtema en la lista.`,
  difficulty_invalid: (_column, value) =>
    `La dificultad${quoted(value)} no va del 1 al 5. Escribe un número del 1 al 5.`,
  kind_unknown: (_column, value) =>
    `El tipo de reactivo${quoted(value)} no está en la lista. Elígelo en el desplegable.`,
  task_unknown: (_column, value) =>
    `La tarea${quoted(value)} no está en la lista. Elígela en el desplegable.`,
  task_undetected: () =>
    'No se pudo detectar la tarea de la pregunta. Elige la tarea en la columna Tarea.',
  polarity_invalid: (_column, value) =>
    `La polaridad${quoted(value)} no está en la lista. Elige Afirmativa o Negativa.`,
  text_too_long: (column) => `El texto de ${column} pasa del límite. Acórtalo.`,
  prompt_missing: () => 'Falta la pregunta. Escribe la frase de la pregunta.',
  correct_invalid: (_column, value) =>
    `La respuesta correcta${quoted(value)} no es una de las opciones del renglón. Escribe la letra de una opción.`,
  options_few: () => 'El renglón tiene menos de 4 opciones. Completa al menos 4, desde la A.',
  option_gap: (column) =>
    `Hay un hueco en las opciones antes de ${column}. Llénalas seguidas desde la A.`,
  option_orphan: (column) =>
    `${column} tiene justificación o sesgo pero no tiene texto. Escribe la opción o borra lo demás.`,
  canonical_invalid: (_column, value) =>
    `El set canónico${quoted(value)} no tiene la correcta y un distractor. Corrige las letras.`,
  template_placeholder: (column) =>
    `${column} todavía tiene el texto de ejemplo de la plantilla. Reemplázalo con el tuyo.`,
  case_inconsistent: (_column, value) =>
    `El caso${quoted(value)} tiene órdenes repetidos, con huecos o sin el 1. Corrige Caso y Orden en el caso de todos sus renglones.`,
  language_branch_mismatch: (_column, value) =>
    `El Idioma${quoted(value)} no va con la rama. Inglés médico va en Inglés y las demás ramas en Español. Corrige el Idioma o la Rama troncal.`,
};

/** Cada aviso de un renglón que sí entra (3.4), con los que solo pone la base */
const notices: Record<SyncNoticeCode | ServerNoticeCode, string> = {
  topic_inferred: 'La subespecialidad se dedujo del subtema. El revisor la confirma al aprobar.',
  kind_control_check: 'Dice De control. El revisor confirma o corrige el tipo al aprobar.',
  structure_auto: 'La tarea o la polaridad se detectaron solas. Revísalas si no coinciden.',
  status_approved_ignored:
    'El Estado dice Aprobado y se ignoró. Solo un médico revisor aprueba, en la app.',
  status_unknown:
    'El Estado no es Borrador, Lista para revisión ni Retirar. Se tomó como Borrador.',
  bias_none_on_correct:
    'La correcta decía Ninguno en Sesgo. Se tomó como vacío, que es lo correcto.',
  author_unknown: 'La clave de Autor no es de ningún médico. Revisa la clave en Usuarios.',
  reviewer_unknown: 'La clave de Revisor no es de ningún médico. Revisa la clave en Usuarios.',
  author_is_reviewer:
    'Autor y Revisor son el mismo médico. No se asignó revisor. Pon la clave de otro médico.',
  case_rows_apart:
    'Los renglones de este caso no están juntos. Entraron igual, juntarlos ayuda a leer.',
  language_unknown: 'El Idioma no está en la lista. Quedó en español.',
  language_inferred: 'El Idioma estaba vacío en Inglés médico. Quedó en inglés.',
  english_case_size:
    'Un caso de lectura en inglés lleva dos o tres preguntas, como en el ENARM. Este tiene otro número y entró igual.',
  not_ready:
    'Pide Lista para revisión pero le faltan pendientes o un revisor distinto del autor. Quedó en borrador.',
  author_differs:
    'El Autor del Sheet no es el que asignó el admin en la app. Se quedó el de la app. Corrige el Autor del Sheet o reasigna en Asignaciones.',
  reviewer_differs:
    'El Revisor del Sheet no es el que asignó el admin en la app. Se quedó el de la app. Corrige el Revisor del Sheet o reasigna en Asignaciones.',
};

export const bankAdminText = {
  /** La descripción de cada pantalla. Su título está en t.screens, desde bankAdminNav.ts */
  descriptions: {
    bankAdmin:
      'Avance del banco hacia la meta, sincronización con el Google Sheet, conflictos, faltantes, asignaciones y avisos de lectura.',
    physicianReviews:
      'Revisiones por médico y por mes, con el monto si hay tarifa, y el CSV que cuadra.',
    deckCatalogAdmin:
      'Sube un mazo de Anki por submazo, revisa su licencia y su autorización y publícalo para los planes de pago.',
  },
  needsCloud: 'Esta pantalla necesita la cuenta de la nube conectada como admin.',
  retry: 'Intentar de nuevo',
  failed: 'No se pudo leer. Intenta de nuevo.',

  overview: {
    title: 'Avance del banco',
    goal: (published: number, goal: number) =>
      `${num(published)} de ${num(goal)} preguntas aprobadas y publicadas para abrir el banco.`,
    english: (n: number) =>
      `Inglés médico aparte, ${plural(n, 'pregunta publicada', 'preguntas publicadas')}.`,
    byBranch: 'Publicadas por rama',
    noBranch: 'Todavía no hay preguntas publicadas.',
    counts: {
      drafts: 'Borradores',
      incomplete: 'Incompletas',
      inReview: 'En revisión',
      conflicts: 'Conflictos',
      missing: 'Faltan en el Sheet',
      retireRequested: 'Piden retiro',
      retired: 'Retiradas',
    },
  },

  open: {
    title: 'Abrir el banco a los alumnos',
    openNow: 'El banco está abierto. Los alumnos estudian con las preguntas aprobadas.',
    closedNow:
      'El banco está cerrado. Los alumnos siguen con el banco de demostración y los médicos ya trabajan en la nube.',
    open: 'Abrir el banco',
    close: 'Cerrar el banco',
    confirmOpen: (approved: number, goal: number) =>
      `Hay ${num(approved)} aprobadas de la meta de ${num(goal)}. Al abrirlo, todos los alumnos dejan el banco de demostración en su siguiente sesión. Confirma para abrirlo.`,
    confirmClose:
      'Al cerrarlo, los alumnos vuelven al banco de demostración y conservan lo que ya bajaron. Confirma para cerrarlo.',
    confirm: 'Confirmar',
    cancel: 'Cancelar',
    opened: 'El banco quedó abierto. Los alumnos lo ven al recargar.',
    closed: 'El banco quedó cerrado.',
    failed: 'No se pudo cambiar. Revisa tu sesión de admin e intenta de nuevo.',
  },

  sync: {
    title: 'Sincronización con el Sheet',
    hint: 'Cada hora y con Sincronizar ahora. Nunca aprueba, nunca publica y nunca retira sin ti.',
    enabled: 'Prendida',
    disabled: 'Apagada. Se prende con la sesión y el conector cuando exista la cuenta de servicio.',
    mode: { dry_run: 'Solo reporte', apply: 'Aplicar' } as Record<string, string>,
    modeLabel: (mode: string) => `Modo ${mode}`,
    target: 'Contra qué Sheet',
    targets: { real: 'Sheet real', test: 'Sheet de prueba, siempre solo reporte' } as Record<
      string,
      string
    >,
    now: 'Sincronizar ahora',
    started: 'La sincronización empezó. Su reporte aparece abajo cuando termine.',
    skipped: (reason: string) => `La sincronización no corrió. ${reason}`,
    failed: 'No se pudo pedir la sincronización. Intenta de nuevo.',
    refresh: 'Actualizar',
    runs: 'Últimas corridas',
    noRuns: 'Todavía no hay corridas.',
    run: {
      at: (date: string) => `Corrida del ${date}`,
      trigger: { cron: 'Cada hora', manual: 'Sincronizar ahora', import: 'Importación' } as Record<
        string,
        string
      >,
      target: { real: 'Sheet real', test: 'Sheet de prueba', file: 'Archivo' } as Record<
        string,
        string
      >,
      status: {
        running: 'En curso',
        ok: 'Terminada',
        partial: 'Terminada con renglones por corregir',
        failed: 'Falló',
        skipped: 'No corrió',
        interrupted: 'Interrumpida',
      } as Record<string, string>,
      show: 'Ver renglones',
      selected: 'Renglones de esta corrida',
    },
    reasons: {
      disabled: 'La sincronización está apagada.',
      not_configured: 'Falta la cuenta de servicio o el ID del Sheet en los secretos.',
      too_soon: 'La anterior empezó hace menos de un minuto.',
      running: 'Hay otra corrida en curso.',
      no_changes: 'El Sheet no cambió desde la corrida anterior.',
      id_formula:
        'La columna ID tiene fórmulas, así que corrió en solo reporte. Fija los ID antes de aplicar.',
      columns_missing: 'Al Sheet le faltan columnas obligatorias.',
      shutdown: 'La función se apagó a media corrida.',
      stale: 'La corrida se quedó sin terminar.',
      internal: 'Error interno de la función.',
      sheet_error: 'Google no respondió bien al leer el Sheet.',
    } as Record<string, string>,
    reason: (reason: string | null) => reason ?? '',
    counts: {
      read: 'Leídos',
      empty: 'Vacíos',
      example: 'Ejemplo',
      unchanged: 'Sin cambios',
      created: 'Nuevos',
      versioned: 'Versiones nuevas',
      converged: 'Coinciden',
      meta: 'Metadatos',
      incomplete: 'Incompletos',
      rejected: 'Rechazados',
      conflict: 'Conflictos',
      missing: 'Faltantes',
    } as Record<string, string>,
    rows: {
      title: 'Renglones',
      hint: 'Solo los que cambiaron o tienen algo que corregir. Nunca el texto de una pregunta.',
      none: 'Esta corrida no tiene renglones que mostrar.',
      row: (n: number | null) => (n === null ? 'Ya no está' : `Renglón ${num(n)}`),
      key: 'ID',
      outcome: 'Resultado',
      detail: 'Qué hacer',
      csv: 'Descargar CSV',
      csvFile: (date: string) => `sincronizacion-${date}.csv`,
      csvColumns: ['Renglón', 'ID', 'Resultado', 'Qué hacer'] as const,
      outcomes: {
        created: 'Nueva',
        versioned: 'Versión nueva',
        converged: 'Coincide con la app',
        meta: 'Cambió autor, revisor o estado',
        conflict: 'Conflicto con la app',
        rejected: 'Rechazado',
        missing: 'Desapareció del Sheet',
      } as Record<string, string>,
      line: (row: string, message: string) => `${row}. ${message}`,
      missing: 'Desapareció del Sheet. Elige en Faltantes si se retira o se queda.',
      conflict: 'Cambió en el Sheet y en la app. Resuélvelo en Conflictos.',
    },
    problems,
    notices,
    problemOther: (code: string, column: string) => `${column}. Código ${code}.`,
    noticeOther: (code: string) => `Aviso ${code}.`,
  },

  attention: {
    conflicts: 'Conflictos',
    conflictsHint:
      'Cambiaron en el Sheet y en la app. Conserva la de la app y copia la corrección al Sheet, o usa la del Sheet.',
    noConflicts: 'No hay conflictos.',
    keepApp: 'Conservar la de la app',
    takeSheet: 'Usar la del Sheet',
    missing: 'Faltantes y retiros',
    missingHint:
      'Ya no están en el Sheet o el Sheet pide Retirar. Nada se retira solo. Ordenar o filtrar mal el Sheet no saca preguntas.',
    noMissing: 'No hay preguntas faltantes.',
    retire: 'Retirar',
    keep: 'Dejarla',
    resolved: 'Listo.',
    failed: 'No se pudo guardar. Intenta de nuevo.',
    open: 'Abrir',
  },

  assign: {
    title: 'Asignaciones',
    hint: 'Autor y revisor por subespecialidad, y el revisor por omisión de lo que llega del Sheet sin Revisor. Autor y revisor tienen que ser distintos.',
    branch: 'Rama troncal',
    topic: 'Subespecialidad',
    author: 'Autor',
    reviewer: 'Revisor',
    keep: 'Dejar como está',
    assign: 'Asignar a toda la subespecialidad',
    assigned: (n: number) => `Asignaste ${plural(n, 'pregunta', 'preguntas')}.`,
    defaultReviewer: 'Revisor por omisión de la subespecialidad',
    setDefault: 'Guardar revisor por omisión',
    defaultSaved: 'Guardaste el revisor por omisión.',
    currentDefault: (alias: string) => `Revisor por omisión ahora, ${alias}.`,
    inactiveDefault: (alias: string) =>
      `El revisor por omisión era ${alias}, pero ya no es médico. No se usa hasta que elijas otro.`,
    noDefault: 'Esta subespecialidad no tiene revisor por omisión.',
    defaults: 'Revisores por omisión',
    inactive: 'ya no es médico',
    noPhysicians: 'No hay cuentas con rol de médico. Nombra médicos en Usuarios.',
    failed: 'No se pudo asignar. Intenta de nuevo.',
  },

  alerts: {
    title: 'Avisos de lectura',
    hint: 'Volúmenes raros de lectura por alumno, sin las preguntas. No bloquean, dejan rastro.',
    none: 'No hay avisos.',
    kinds: {
      daily_volume: 'Muchas preguntas nuevas en un día',
      week_share: 'Leyó gran parte del banco en una semana',
      brake: 'Topó el freno por minuto u hora',
    } as Record<string, string>,
    line: (alias: string, kind: string, day: string, value: string) =>
      `${alias || 'Sin alias'}. ${kind} el ${day}, con ${value}.`,
  },

  errors: {
    BK002: 'Alguien más guardó o sincronizó una versión nueva. Recarga.',
    BK003: 'Autor y revisor tienen que ser distintos, o falta otro médico para revisar.',
    BK004: 'Falta el etiquetado a ciegas, o la etiqueta ya está cerrada.',
    BK005: 'La versión tiene pendientes.',
    BK006: 'Llegó al tope de reportes del día.',
    BK007: 'No tiene asignada esta pregunta.',
    BK008: 'Faltan casillas por confirmar.',
    BK009: 'Hay una sincronización en curso o fue muy seguida. Intenta en un minuto.',
    BK010:
      'Un mazo de terceros necesita la autorización confirmada por el dueño antes de publicarse.',
    BK011: 'Faltan archivos de esta versión del mazo en Storage. Vuelve a subirlos.',
  } as Record<string, string>,

  reviews: {
    from: 'Desde',
    to: 'Hasta',
    show: 'Ver',
    rate: (rate: number | null) =>
      rate === null
        ? 'Sin tarifa por pregunta revisada. El reporte da solo conteos.'
        : `Tarifa de ${rate.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })} por pregunta revisada.`,
    rule: 'Se paga por pregunta revisada. Varias rondas del mismo revisor sobre una pregunta en el mes cuentan una vez. Aprobar, pedir cambios y rechazar cuentan cada decisión y se ven por separado. Los distractores atendidos van aparte. Mes en hora de Mérida.',
    none: 'No hay revisiones en ese rango.',
    columns: {
      month: 'Mes',
      physician: 'Médico',
      code: 'Clave',
      approved: 'Aprobadas',
      changesRequested: 'Cambios pedidos',
      rejected: 'Rechazadas',
      reviewed: 'Preguntas revisadas',
      distractors: 'Distractores atendidos',
      rate: 'Tarifa',
      amount: 'Monto',
    },
    total: 'Total',
    tableLabel: 'Revisiones por médico y mes',
    summaryCsv: 'Descargar CSV del resumen',
    detailCsv: 'Descargar CSV del detalle',
    summaryFile: (from: string, to: string) => `revisiones-resumen-${from}-a-${to}.csv`,
    detailFile: (from: string, to: string) => `revisiones-detalle-${from}-a-${to}.csv`,
    detailColumns: [
      'Fecha',
      'Mes',
      'Médico',
      'Clave',
      'Pregunta',
      'Versión',
      'Decisión',
      'Paga',
    ] as const,
    pays: 'Sí',
    doesNotPay: 'No, otra ronda de la misma pregunta en el mes',
    decisions: {
      approve: 'Aprobó',
      request_changes: 'Pidió cambios',
      reject: 'Rechazó',
    } as Record<string, string>,
    invalidRange: 'La fecha final va después de la inicial.',
  },

  platform: {
    title: 'Banco',
    hint: 'Freno de lectura de los planes de pago, avisos al admin, tope de reportes por alumno y la tarifa por pregunta revisada. Se guardan en el servidor.',
    fields: {
      perMinute: 'Preguntas nuevas por minuto antes del freno',
      perHour: 'Preguntas nuevas por hora antes del freno',
      alertDaily: 'Aviso al pasar de estas preguntas nuevas en un día',
      alertWeekShare: 'Aviso al leer en 7 días esta parte del banco, de 0.01 a 1',
      reportsPerDay: 'Reportes de error por alumno al día',
      maxFetch: 'Preguntas por petición',
      perReviewMxn: 'Tarifa por pregunta revisada en pesos, vacía si no hay',
    },
    save: 'Guardar ajustes del banco',
    saved: 'Guardaste los ajustes del banco.',
    invalid: 'Revisa los valores. Cada uno va en su rango.',
    failed: 'No se pudo guardar. Revisa tu sesión de admin.',
    needsCloud:
      'Los ajustes del banco viven en el servidor. Conecta la cuenta de la nube para cambiarlos.',
  },

  weights: {
    provisionalMark: 'Provisionales',
    officialMark: 'Oficiales',
    source: (source: string) => `Fuente de los pesos de fábrica. ${source}.`,
    provisional: 'Los pesos siguen siendo provisionales',
    provisionalHint:
      'Apágalo cuando la convocatoria publique los pesos oficiales y los hayas capturado aquí.',
    clinical: 'Las 7 ramas de los 250 reactivos en español',
    english: 'Inglés médico, aparte de los 250',
    englishHint: 'Comprensión de textos en inglés. No cuenta en el reparto de las ramas.',
  },

  users: {
    code: 'Clave del Sheet',
    current: (code: string) => `Clave actual ${code}.`,
    noCode: 'Todavía no tiene clave del Sheet.',
    codeHint: 'De 2 a 8 letras o números, empieza con letra. Va en Autor y Revisor del Sheet.',
    save: 'Guardar clave',
    saved: (alias: string, code: string) => `${alias} ahora firma como ${code} en el Sheet.`,
    taken: 'Esa clave ya es de otro médico.',
    notPhysician: 'Solo un médico lleva clave del Sheet.',
    invalid: 'La clave lleva de 2 a 8 letras o números y empieza con letra.',
    failed: 'No se pudo guardar la clave.',
  },

  decks: {
    list: 'Mazos del catálogo',
    none: 'Todavía no hay mazos en el catálogo.',
    status: { draft: 'Borrador', published: 'Publicado', retired: 'Retirado' } as Record<
      string,
      string
    >,
    versionStatus: {
      uploading: 'Subiendo',
      published: 'Publicada',
      retired: 'Retirada',
    } as Record<string, string>,
    license: { own: 'Propio', third_party: 'De terceros' } as Record<string, string>,
    version: (n: number, status: string, uploaded: number, files: number) =>
      `Versión ${n}. ${status}, ${num(uploaded)} de ${num(files)} archivos.`,
    downloads: (n: number) => plural(n, 'descarga', 'descargas'),
    authorization: {
      title: 'Autorización',
      own: 'Mazo propio, no necesita autorización.',
      pending: 'De terceros. Falta que el dueño confirme la autorización escrita.',
      confirmed: (date: string) => `Autorización confirmada por el dueño el ${date}.`,
      note: 'Quién autorizó, cuándo y dónde vive el documento',
      confirm: 'Confirmar autorización',
      confirmed_notice: 'Confirmaste la autorización del mazo.',
      ownerOnly: 'Solo el dueño confirma la autorización.',
    },
    publish: 'Publicar esta versión',
    published: 'La versión quedó publicada. La anterior quedó retirada.',
    alreadyPublished: 'Esa versión ya estaba publicada.',
    retire: 'Retirar el mazo',
    retired: 'El mazo quedó retirado del catálogo.',
    upload: {
      title: 'Subir un mazo',
      hint: 'Elige el .apkg. Se abre aquí en tu navegador, se parte por submazo y sube por partes de hasta 5 MB. Nada se publica hasta que lo publiques.',
      file: 'Archivo .apkg',
      choose: 'Elegir archivo',
      none: 'Ningún archivo elegido',
      reading: 'Leyendo el mazo',
      readFailed: 'No se pudo abrir el mazo. Revisa que sea un .apkg de Anki.',
      key: 'Clave del mazo',
      keyHint:
        'De 3 a 48 minúsculas, números o guiones, como paco-pediatria. No cambia entre versiones.',
      name: 'Nombre',
      description: 'Descripción',
      author: 'Autor con crédito visible',
      license: 'Licencia',
      note: 'Autorización escrita. Quién, cuándo y dónde guardas el documento',
      subjects: (n: number) => plural(n, 'submazo', 'submazos'),
      subject: (name: string, notes: number, cards: number, size: string) =>
        `${name}. ${plural(notes, 'nota', 'notas')}, ${plural(cards, 'tarjeta', 'tarjetas')}, ${size}.`,
      branch: 'Rama',
      topic: 'Tema',
      noTopic: 'Sin tema',
      register: 'Subir al catálogo',
      uploading: (done: number, total: number) => `Subiendo ${num(done)} de ${num(total)} archivos`,
      uploaded: 'La versión quedó subida. Revísala y publícala abajo.',
      failed: 'No se pudo subir. Intenta de nuevo, los archivos ya subidos no se repiten.',
      licenseOwnerOnly:
        'Este mazo es de terceros. Solo el dueño puede pasarlo a propio, porque uno propio se publica sin su confirmación.',
      invalid: 'Revisa la clave, el nombre, el autor y, si es de terceros, la autorización.',
      size: (bytes: number) =>
        bytes >= 1_000_000
          ? `${(bytes / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} MB`
          : `${Math.max(1, Math.round(bytes / 1000)).toLocaleString('es-MX')} KB`,
      warnings: (n: number) =>
        `${plural(n, 'nota se omitió', 'notas se omitieron')} por estar vacías o ser muy largas.`,
    },
    failed: 'No se pudo completar. Intenta de nuevo.',
  },
};
