// Textos de Apuntes (Fase C2, Etapa 3, D-090), en español de México con trato de tú (4.9). Se integran
// en t desde es-MX.ts.
import { plural } from './features';

export const outlineText = {
  outlines: {
    listTitle: 'Tus apuntes',
    listHint:
      'Escribe en esquema, con líneas dentro de líneas. Una marca en una línea la vuelve tarjeta, y la tarjeta ya sale en Repasar.',
    newTitle: 'Título del apunte nuevo',
    newPlaceholder: 'Por ejemplo, Insuficiencia cardiaca',
    create: 'Crear apunte',
    creating: 'Creando…',
    createFailed: 'No se pudo crear el apunte. Intenta de nuevo.',
    titleRequired: 'Escribe un título para el apunte.',
    search: 'Buscar en tus apuntes',
    noMatches: 'Ningún apunte coincide con tu búsqueda.',
    empty:
      'Todavía no tienes apuntes. Crea el primero y escribe una línea con >> para ver cómo se vuelve tarjeta.',
    open: (title: string) => `Abrir ${title}`,
    lines: (n: number) => plural(n, 'línea', 'líneas'),
    cards: (n: number) => plural(n, 'tarjeta', 'tarjetas'),
    summary: (lines: number, cards: number) =>
      `${plural(lines, 'línea', 'líneas')} · ${plural(cards, 'tarjeta', 'tarjetas')}`,
    loading: 'Abriendo tus apuntes…',
    notFound: 'No encontramos ese apunte. Puede que ya lo hayas borrado.',
    backToList: 'Todos los apuntes',

    editor: {
      titleLabel: 'Título',
      deck: (name: string) => `Las tarjetas van al mazo ${name}`,
      deckMissing: 'El mazo de este apunte ya no existe. Elige otro y tus tarjetas se pasan a él.',
      deckChange: 'Cambiar de mazo',
      deckLabel: 'Mazo de las tarjetas',
      deckMove: 'Pasar el apunte a este mazo',
      deckMoving: 'Pasando…',
      deckMoveFailed: 'No se pudo pasar el apunte a ese mazo. Intenta de nuevo.',
      deckNone: 'No tienes un mazo propio al que pasarlo. Crea uno en Mazos.',
      conflict:
        'Este apunte se cambió en otra ventana. Abre la versión nueva para no pisar sus cambios. Lo que escribiste aquí se queda en pantalla hasta que la cierres.',
      reload: 'Abrir la versión nueva',
      limits: {
        lines: 'Un apunte tiene hasta 2,000 líneas. Esa línea ya no cabe.',
        depth: 'Un apunte tiene hasta 8 niveles. No se puede meter más.',
        length: 'Una línea tiene hasta 3,000 caracteres. Lo que pasa de ahí no cabe.',
      },
      label: 'Líneas del apunte',
      placeholder: 'Escribe una línea. Prueba con Pregunta >> Respuesta',
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
      insertForward: 'Marca de pregunta y respuesta',
      insertBoth: 'Marca de concepto y definición',
      insertCloze: 'Marca de hueco',
      insertTag: 'Etiqueta',
      insertLink: 'Enlace a otro apunte',
      rename: 'Guardar el título',
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
      none: 'Ninguna línea tiene marca todavía. Escribe Pregunta >> Respuesta en una línea.',
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
        'Escribe la marca en medio de una línea. Todo lo que no tiene marca queda como apunte.',
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

    // Tarjetas que salen de un apunte, vistas desde el editor de mazos y desde Explorar
    fromOutline: {
      note: 'Esta tarjeta sale de un apunte. Cámbiala en el apunte y se actualiza sola.',
      open: 'Abrir el apunte',
      leech:
        'Esta tarjeta sale de un apunte y se cambia en el apunte. Puedes suspenderla, abrir el apunte o seguir con ella.',
    },
  },
} as const;
