// Textos de Apuntes (Fase C2, Etapa 3, D-092, y B6 del plan del cambio), en español de México con
// trato de tú (4.9). Se integran en t desde es-MX.ts.
import { plural } from './features';

/** Una línea de una plantilla de apunte, con las que cuelgan de ella */
interface TemplateLine {
  text: string;
  children?: readonly TemplateLine[];
}

/** Una sección con una línea en blanco debajo, lista para escribir */
const section = (text: string): TemplateLine => ({ text, children: [{ text: '' }] });

export const outlineText = {
  outlines: {
    listTitle: 'Tus apuntes',
    listHint:
      'Escribe en esquema, con líneas dentro de líneas. El botón Tarjeta de cada línea la vuelve tarjeta, sin memorizar marcas, y la tarjeta ya sale en Repasar.',
    newTitle: 'Título del apunte nuevo',
    newPlaceholder: 'Por ejemplo, Insuficiencia cardiaca',
    create: 'Crear apunte',
    creating: 'Creando…',
    createFailed: 'No se pudo crear el apunte. Intenta de nuevo.',
    titleRequired: 'Escribe un título para el apunte.',
    search: 'Buscar en tus apuntes',
    noMatches: 'Ningún apunte coincide con tu búsqueda.',
    empty:
      'Todavía no tienes apuntes. Crea el primero, escribe una línea y tócale el botón Tarjeta para ver cómo se vuelve tarjeta.',
    open: (title: string) => `Abrir ${title}`,
    lines: (n: number) => plural(n, 'línea', 'líneas'),
    cards: (n: number) => plural(n, 'tarjeta', 'tarjetas'),
    summary: (lines: number, cards: number) =>
      `${plural(lines, 'línea', 'líneas')} · ${plural(cards, 'tarjeta', 'tarjetas')}`,
    loading: 'Abriendo tus apuntes…',
    notFound: 'No encontramos ese apunte. Puede que ya lo hayas borrado.',
    backToList: 'Todos los apuntes',

    // Búsqueda en todos los apuntes (B6)
    searchHint: 'Busca en los títulos y en todas las líneas, sin importar acentos ni mayúsculas.',
    searchResults: (n: number) => `${plural(n, 'apunte tiene', 'apuntes tienen')} lo que buscas.`,
    titleMatch: 'Coincide el título',
    moreLines: (n: number) => `Y ${plural(n, 'línea más', 'líneas más')} en este apunte.`,
    openLine: (title: string, line: string) => `Abrir ${title} en la línea ${line}`,

    // Crear un apunte, con su propósito, su plantilla, su tema y su mazo (B6)
    form: {
      purpose: 'Para qué es',
      purposes: { enarm: 'ENARM', class: 'Modo clase' },
      classHint:
        'Para tomar apuntes rápido en clase, con una plantilla y una materia libre de la carrera. Las tarjetas de una materia libre no cuentan en tus estadísticas del ENARM por tema ni en Conócete. Sí cuentan en tu tiempo de estudio, tu racha y tu meta del día.',
      classTitleHint: 'Si lo dejas vacío, se llama como la materia y la fecha.',
      classTitle: (subject: string, date: string) => `${subject}, ${date}`,
      startClass: 'Empezar la clase',
      options: 'Mazo, tema y plantilla',
      template: 'Plantilla',
      templates: {
        blank: 'En blanco',
        class: 'Clase',
        clinicalCase: 'Caso clínico',
        topicSummary: 'Resumen de tema',
      },
      clinicalCaseHint: 'No escribas nombres ni datos que identifiquen a un paciente.',
      deck: 'Mazo de las tarjetas',
      deckAutomatic: 'Mazo nuevo en Apuntes, con el título del apunte',
    },

    // Las líneas de cada plantilla. Cada sección trae una línea en blanco debajo para escribir
    templateLines: {
      blank: [] as readonly TemplateLine[],
      class: [
        section('Datos de la clase'),
        section('Ideas clave'),
        section('Definiciones'),
        section('Dudas para preguntar'),
        section('Para repasar'),
      ] as readonly TemplateLine[],
      clinicalCase: [
        section('Presentación del caso'),
        section('Antecedentes'),
        section('Exploración física'),
        section('Estudios'),
        section('Diagnóstico diferencial'),
        section('Diagnóstico'),
        section('Tratamiento'),
        section('Perlas para el examen'),
      ] as readonly TemplateLine[],
      topicSummary: [
        section('Definición'),
        section('Epidemiología'),
        section('Fisiopatología'),
        section('Cuadro clínico'),
        section('Diagnóstico'),
        section('Tratamiento'),
        section('Complicaciones'),
        section('Puntos clave para el examen'),
      ] as readonly TemplateLine[],
    },

    // Tema del apunte, del ENARM o una materia libre (B6)
    subject: {
      label: 'Tema',
      kinds: { none: 'Sin tema', enarm: 'Tema del ENARM', free: 'Materia libre' },
      branch: 'Rama',
      topic: 'Tema del ENARM',
      chooseBranch: 'Elige una rama',
      chooseTopic: 'Elige un tema',
      freeName: 'Materia',
      freePlaceholder: 'Por ejemplo, Anatomía',
      enarmHint:
        'Sus tarjetas cuentan en tus estadísticas de ese tema y se pueden filtrar por tema en Repasar.',
      freeHint:
        'Sus tarjetas no cuentan en tus estadísticas del ENARM por tema ni en Conócete. Sí cuentan en tu tiempo de estudio, tu racha y tu meta del día.',
      enarmRequired: 'Elige la rama y el tema, o cambia a Sin tema.',
      freeRequired: 'Escribe el nombre de la materia.',
      shownNone: 'Sin tema',
      shownFree: (name: string) => `Materia libre, ${name}`,
    },

    // Candado y vista previa en el plan Gratis (respuesta 20)
    locked: {
      title: 'Apuntes es parte de los planes de pago',
      intro:
        'Escribe tus apuntes en esquema y vuelve tarjeta cualquier línea con un botón. Las tarjetas salen solas en Repasar.',
      points: [
        'Tarjetas desde tus líneas, sin memorizar marcas',
        'Mazo y tema del ENARM para cada apunte',
        'Modo clase con plantillas y materias libres de la carrera',
        'Propuestas de tarjetas con IA ancladas a lo que escribiste, como borrador',
        'Búsqueda en todos tus apuntes y esquema para saltar a una sección',
      ],
      // El botón es el de todos los candados de Gratis (src/features/shared/lockedCta.ts)
      kept: 'Si ya tenías apuntes, siguen guardados y sus tarjetas siguen en Repasar.',
    },

    editor: {
      titleLabel: 'Título',
      deck: (name: string) => `Las tarjetas van al mazo ${name}`,
      deckMissing:
        'El mazo de este apunte ya no existe. Elige otro en Mazo y tema y tus tarjetas se pasan a él.',
      deckLabel: 'Mazo de las tarjetas',
      conflict:
        'Este apunte se cambió en otra ventana. Abre la versión nueva para no pisar sus cambios. Lo que escribiste aquí se queda en pantalla hasta que la cierres.',
      reload: 'Abrir la versión nueva',
      limits: {
        lines: 'Un apunte tiene hasta 2,000 líneas. Esa línea ya no cabe.',
        depth: 'Un apunte tiene hasta 8 niveles. No se puede meter más.',
        length: 'Una línea tiene hasta 3,000 caracteres. Lo que pasa de ahí no cabe.',
      },
      label: 'Líneas del apunte',
      placeholder: 'Escribe una línea y vuélvela tarjeta con el botón Tarjeta',
      saved: 'Guardado',
      saving: 'Guardando…',
      unsaved: 'Cambios sin guardar',
      saveFailed:
        'No se pudo guardar. Tus cambios siguen en la pantalla, se vuelve a intentar con el siguiente cambio.',
      saveInvalid:
        'No se pudo guardar porque el apunte pasa de un tope: 2,000 líneas, 8 niveles o 3,000 caracteres por línea. Revisa lo último que escribiste.',
      escapeHint:
        'Con Esc sales del editor hacia las herramientas. Con Tab metes la línea en la de arriba.',
      toolbar: 'Herramientas del apunte',
      indent: 'Meter la línea en la de arriba',
      outdent: 'Sacar la línea un nivel',
      undo: 'Deshacer',
      redo: 'Rehacer',
      insertTag: 'Etiqueta',
      insertLink: 'Enlace a otro apunte',
      rename: 'Guardar el título',
      // Volver tarjeta la línea del cursor sin escribir marcas (B6)
      card: 'Tarjeta',
      cardLabel: 'Hacer tarjeta con la línea del cursor',
      lineButton: 'Tarjeta con esta línea',
      lineCard: {
        title: 'Tipo de tarjeta de esta línea',
        hint: 'Se parte en los dos puntos, en lo que marcaste o donde está el cursor.',
        emptyLine: 'Escribe algo en la línea para volverla tarjeta.',
        kinds: {
          forward: 'Pregunta y respuesta',
          both: 'En los dos sentidos',
          cloze: 'Con hueco',
          multiline: 'Respuesta abajo',
          none: 'Quitar la tarjeta',
        },
        marks: { forward: '>>', both: '::', cloze: '{{ }}', multiline: '>>>' },
        close: 'Cerrar',
      },
      classMode: 'Modo clase',
      classModeHint: 'Solo el editor, para escribir rápido. Lo demás vuelve al salir.',
      // Las marcas en una línea debajo del editor, siempre a la vista (B6)
      marksLabel: 'Marcas',
      marks: [
        { mark: '>>', what: 'pregunta y respuesta' },
        { mark: '::', what: 'dos sentidos' },
        { mark: '{{ }}', what: 'hueco' },
        { mark: '>>>', what: 'respuesta abajo' },
        { mark: '#', what: 'etiqueta' },
        { mark: '[[ ]]', what: 'enlace' },
      ],
    },

    // Mazo y tema de un apunte abierto (B6)
    settings: {
      title: 'Mazo y tema',
      save: 'Guardar mazo y tema',
      saving: 'Guardando…',
      saved: 'Listo. Las tarjetas del apunte ya van a ese mazo y con ese tema.',
      failed: 'No se pudo guardar el mazo y el tema. Intenta de nuevo.',
      conflict:
        'No se guardaron el mazo ni el tema porque el apunte cambió en otra ventana. Abre la versión nueva y vuelve a elegirlos.',
    },

    // Esquema del apunte para saltar a una sección (B6)
    structure: {
      title: 'Esquema',
      summary: (n: number) => plural(n, 'sección', 'secciones'),
      empty:
        'Las líneas que tienen líneas debajo aparecen aquí como secciones para saltar a ellas.',
      label: 'Secciones del apunte',
    },

    // Tarjetas con IA desde el apunte, en los planes de pago (B6, D-085)
    ai: {
      title: 'Tarjetas con IA de este apunte',
      intro:
        'La IA lee las líneas que todavía no son tarjeta y propone tarjetas. Cada una trae la frase de tu apunte que la respalda y llega como borrador. Tú aceptas, editas o descartas una por una.',
      generate: 'Proponer tarjetas',
      generating: 'Proponiendo…',
      tooShort:
        'Tu apunte todavía tiene poco texto sin marcas. Escribe más líneas completas, como definiciones, dosis o criterios.',
      deckNote: (deck: string) => `Las que aceptes van al mazo ${deck}, en borrador.`,
      result: (n: number) => plural(n, 'tarjeta propuesta', 'tarjetas propuestas'),
      none: 'No salieron tarjetas de tu apunte. Prueba con líneas más completas, como definiciones, dosis o criterios.',
      quote: 'Frase de tu apunte que la respalda',
      goToLine: 'Ir a la línea',
      accept: 'Aceptar',
      acceptEdited: 'Guardar y aceptar',
      edit: 'Editar',
      cancelEdit: 'Cancelar la edición',
      discard: 'Descartar',
      proposal: (n: number) => `Propuesta ${n}`,
      accepted: (n: number) =>
        `${plural(n, 'tarjeta aceptada', 'tarjetas aceptadas')} como borrador en el mazo del apunte.`,
      acceptFailed: 'No se pudo guardar la tarjeta. Intenta de nuevo.',
      done: 'Ya decidiste todas las propuestas.',
      again: 'Proponer otra vez',
    },

    // Insignia que sale al final de una línea con marca
    badge: {
      forward: 'Tarjeta',
      backward: 'Tarjeta al revés',
      both: 'Dos tarjetas',
      multiline: 'Tarjeta con varias líneas',
      cloze: (holes: number) => (holes === 1 ? 'Tarjeta con hueco' : `${holes} tarjetas con hueco`),
    },

    preview: {
      title: 'Tarjetas de este apunte',
      count: (n: number) =>
        plural(n, 'tarjeta sale de este apunte', 'tarjetas salen de este apunte'),
      none: 'Ninguna línea es tarjeta todavía. Escribe una línea y tócale el botón Tarjeta.',
      kinds: {
        basic: 'Pregunta y respuesta',
        basic_reverse: 'Dos sentidos',
        cloze: 'Con huecos',
      },
      front: 'Frente',
      back: 'Reverso',
      issuesTitle: 'Líneas que no se volvieron tarjeta',
      issues: {
        multiline_without_children:
          'Una línea termina en >>>, pero no tiene líneas debajo que sean la respuesta.',
        nested_mark_ignored:
          'Una línea con >>> trae marcas en sus líneas de abajo. Esas marcas no crean tarjetas aparte.',
        cloze_unusable: 'Una línea tiene un hueco sin cerrar o sin respuesta.',
        too_long: 'Una línea es demasiado larga para una tarjeta.',
        too_many_cards: 'Un apunte crea hasta 500 tarjetas. Las que pasan de ahí no se crean.',
        too_many_nodes: 'Un apunte guarda hasta 2,000 líneas.',
        too_deep: 'Un apunte guarda hasta 8 niveles.',
      },
    },

    cheatsheet: {
      title: 'Marcas rápidas',
      intro:
        'El botón Tarjeta las escribe por ti. Si prefieres el teclado, escribe la marca en la línea. Lo que no tiene marca queda como apunte.',
      rows: [
        { mark: 'Pregunta >> Respuesta', what: 'Una tarjeta que pregunta lo de la izquierda.' },
        { mark: 'Respuesta << Pregunta', what: 'Una tarjeta que pregunta lo de la derecha.' },
        {
          mark: 'Concepto :: Definición',
          what: 'Dos tarjetas, una por cada lado. También sirve <>.',
        },
        { mark: 'Término ;; Descriptor', what: 'Una tarjeta hacia delante.' },
        {
          mark: 'Pregunta >>>',
          what: 'La respuesta son las líneas que cuelgan debajo. Meter una línea con Tab.',
        },
        {
          mark: 'El {{hueco}} aquí',
          what: 'Una tarjeta con huecos. Cada hueco se numera solo y también vale {{c2::así}}.',
        },
        {
          mark: '#Cardiología::Arritmias',
          what: 'Etiqueta. Pasa a las tarjetas de esa línea y de todo lo que cuelga.',
        },
        { mark: '[[Otro apunte]]', what: 'Enlace al apunte con ese título.' },
      ],
    },

    links: {
      title: 'Enlaces',
      goesTo: 'Este apunte enlaza a',
      missing: 'Sin apunte con ese título',
      backlinks: 'Mencionado en',
      none: 'Nadie enlaza a este apunte todavía.',
      open: (title: string) => `Abrir ${title}`,
    },

    remove: {
      button: 'Borrar apunte',
      title: 'Borrar este apunte',
      body: (cards: number) =>
        cards === 0
          ? 'El apunte se borra. Este apunte no tiene tarjetas.'
          : `El apunte se borra. También sus ${plural(cards, 'tarjeta', 'tarjetas')}, a menos que las conserves como tarjetas sueltas. Tu historial de repaso queda guardado en ambos casos.`,
      keepCards: 'Conservar las tarjetas como tarjetas sueltas',
      confirm: 'Sí, borrar el apunte',
      cancel: 'Cancelar',
      failed: 'No se pudo borrar el apunte. Intenta de nuevo.',
    },

    // Tarjetas que salen de un apunte, vistas desde el editor de mazos y desde Buscar tarjetas
    fromOutline: {
      note: 'Esta tarjeta sale de un apunte. Cámbiala en el apunte y se actualiza sola.',
      open: 'Abrir el apunte',
      leech:
        'Esta tarjeta sale de un apunte y se cambia en el apunte. Puedes suspenderla, abrir el apunte o seguir con ella.',
    },
  },
} as const;
