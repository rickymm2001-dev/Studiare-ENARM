// Textos de la encuesta de los primeros días (B18 del plan del cambio, 1.3 a 1.6, 2.4 y 4 del diseño). Fuera de t para
// que no entren al JavaScript inicial, que está al límite de los 300 KB (14.4). Los importan solo los módulos diferidos
// de la encuesta (la franja, la pantalla y su formulario, la línea de Privacidad y la tarjeta del equipo), como lo hacen
// consents.ts y engagement.ts, y no se integran en t. Una prueba revisa que cada pregunta y cada opción de
// src/config/surveys.ts tenga su texto aquí.
//
// Español de México con trato de tú, sin signos de exclamación y sin dos puntos en la prosa. Nunca dice que la encuesta
// es anónima. Es con un código y sin tu nombre ni tu correo, y como somos pocos quien lee puede deducir de quién es. La
// encuesta es un dato que el alumno da a propósito y no depende de Medición de uso, y lo dice la pantalla.
import type { Blocker, CommentProblem, DaysUsed, Recommend, UsedFeature } from '@/config/surveys';

interface ScaleText {
  label: string;
  /** El extremo bajo y el alto, que se ven siempre junto a los cinco números */
  low: string;
  high: string;
}

interface ChoiceText<O extends string> {
  label: string;
  hint?: string;
  options: Record<O, string>;
}

/** El texto de cada pregunta, por id. Una prueba lo compara con las preguntas de la configuración */
const questions: {
  days_used: ChoiceText<DaysUsed>;
  used: ChoiceText<UsedFeature>;
  clarity: ScaleText;
  ease: ScaleText;
  useful: ScaleText;
  blockers: ChoiceText<Blocker>;
  recommend: ChoiceText<Recommend>;
} = {
  days_used: {
    label: '¿Cuántos días usaste Studiare esta semana?',
    options: { d0: 'Ninguno', d1_2: '1 o 2', d3_4: '3 o 4', d5_6: '5 o 6', d7: 'Los 7' },
  },
  used: {
    label: '¿Qué usaste?',
    hint: 'Marca todo lo que aplique.',
    options: {
      review: 'Repasar',
      practice: 'Simular por rama',
      exam: 'Examen completo',
      outlines: 'Apuntes',
      progress: 'Progreso',
      party: 'Party',
      tutor: 'Tutor',
      import: 'Importar mazos',
      none: 'Nada todavía',
    },
  },
  clarity: {
    label: 'Al empezar, ¿qué tan claro fue qué hacer primero?',
    low: 'Nada claro',
    high: 'Muy claro',
  },
  ease: { label: '¿Qué tan fácil fue usarlo?', low: 'Muy difícil', high: 'Muy fácil' },
  useful: {
    label: '¿Qué tan útil te parece para preparar el ENARM?',
    low: 'Nada útil',
    high: 'Muy útil',
  },
  blockers: {
    label: '¿Qué te frenó o te molestó?',
    hint: 'Elige hasta 3.',
    options: {
      unclear_start: 'No entendí cómo empezar',
      error: 'Algo falló',
      slow: 'Fue lento',
      few_questions: 'Faltaron preguntas o mazos',
      not_like_exam: 'Las preguntas no se parecen al examen',
      confusing_design: 'Me confundió el diseño',
      nothing: 'Nada me frenó',
    },
  },
  recommend: {
    label: '¿Se lo recomendarías a un compañero que prepara el ENARM?',
    options: { yes: 'Sí', maybe: 'Tal vez', no: 'No' },
  },
};

const problems: Record<CommentProblem, string> = {
  too_long: 'El comentario pasa de 500 caracteres. Acórtalo para enviarlo.',
  email:
    'Tu comentario parece traer un correo o una arroba. Quítalo para enviarlo, porque lo van a leer personas del equipo.',
  phone:
    'Tu comentario parece traer un teléfono o un número largo. Quítalo para enviarlo, porque lo van a leer personas del equipo.',
};

export const surveyTexts = {
  /** El título de la pantalla en la barra y en la pestaña. El de la tarjeta es title */
  screenTitle: 'Encuesta',
  title: 'Cuéntanos cómo te fue en tu primera semana',
  intro:
    'Son 8 preguntas y tardas unos 2 minutos. Es opcional y no cambia nada de lo que tienes en Studiare.',
  privacy:
    'Esto no es parte de la analítica. Lo que respondas lo guardamos porque lo escribes ahora, con un código y sin tu nombre ni tu correo. Lo ven el dueño y los administradores de Studiare. Como somos pocos, si escribes algo que te identifica, lo verán. No escribas datos personales ni de pacientes.',
  independent:
    'Contestarla no depende de ningún permiso de Privacidad, ni de Medición de uso ni de Mejora con tus datos sin nombre.',
  erase: 'Puedes borrar tu respuesta cuando quieras en Configuración, Privacidad.',
  draftNote:
    'Mientras contestas guardamos un borrador solo en este dispositivo. Se borra al enviar, al cerrar sesión y al borrar tus datos.',
  position: (n: number, total: number) => `Pregunta ${String(n)} de ${String(total)}`,
  questions,
  scale: {
    legendHint: 'Del 1 al 5.',
    optionLabel: (value: number, low: string, high: string) =>
      value === 1 ? `1, ${low}` : value === 5 ? `5, ${high}` : String(value),
  },
  comment: {
    label: '¿Qué cambiarías primero?',
    hint: 'Opcional. Hasta 500 caracteres. No escribas tu correo, tu teléfono ni datos de pacientes. Revisamos que no se cuele un correo o un teléfono, pero es solo una ayuda y no lo detecta todo, así que cuida lo que escribes.',
    counter: (used: number, max: number) => `${String(used)} de ${String(max)} caracteres`,
    problems,
  },
  errors: {
    heading: (count: number) =>
      count === 1
        ? 'Te falta contestar 1 pregunta'
        : `Te faltan por contestar ${String(count)} preguntas`,
    goTo: (n: number) => `Ir a la pregunta ${String(n)}`,
    commentProblem: 'Revisa tu comentario antes de enviar.',
    required: 'Falta contestar esta pregunta.',
  },
  actions: {
    send: 'Enviar mis respuestas',
    sending: 'Enviando',
    later: 'Ahora no',
    never: 'No quiero contestarla',
    answer: 'Contestar',
    erase: 'Borrar mi respuesta',
    confirmErase: 'Sí, borrar mi respuesta',
    cancel: 'Cancelar',
    backHome: 'Ir a Inicio',
    retry: 'Intentar de nuevo',
  },
  states: {
    loading: 'Revisando si tienes una encuesta pendiente',
    sent: 'Listo, gracias',
    sentBody:
      'Tu respuesta nos ayuda a corregir lo que falle antes de abrir el registro. Puedes borrarla cuando quieras en Configuración, Privacidad.',
    already: 'Ya contestaste esta encuesta',
    alreadyBody: 'Gracias. Si quieres, puedes borrar tu respuesta en Configuración, Privacidad.',
    unavailable: 'Por ahora no hay una encuesta para ti',
    unavailableBody:
      'La encuesta aparece a los pocos días de crear tu cuenta, si está abierta. Si te interesa contestarla y no te sale, escríbele a quien te invitó.',
    closed: 'Esta encuesta ya no está abierta',
    closedBody: 'Gracias por pasar. No hace falta que hagas nada.',
    needsCloud: 'La encuesta necesita tu cuenta en la nube',
    needsCloudBody:
      'Entra con tu cuenta real de Studiare para contestarla. En la demostración no se guarda nada.',
    formNotLoaded: 'No pudimos cargar el formulario. Revisa tu conexión y recarga la página.',
    loadFailed: 'No pudimos revisar si tienes una encuesta pendiente. Revisa tu conexión.',
    sendFailed:
      'No pudimos enviar tus respuestas. Revisa tu conexión y vuelve a intentar. Tu borrador sigue aquí.',
    invalid:
      'Algo en tus respuestas no se pudo guardar. Revisa que las 7 preguntas tengan respuesta y que tu comentario no traiga un correo ni un teléfono.',
    notActiveDevice:
      'Este dispositivo ya no es el activo de tu cuenta. Entra de nuevo para contestar.',
    eraseFailed: 'No pudimos borrar tu respuesta. Intenta de nuevo en un momento.',
    erased: 'Borramos tu respuesta de la encuesta.',
    nothingToErase: 'No había ninguna respuesta tuya que borrar.',
  },
  /** La franja de arriba, junto a los demás avisos. Nunca aparece dentro de una pregunta, un examen ni un repaso */
  notice: {
    region: 'Encuesta de tu primera semana',
    title: 'Cuéntanos cómo te fue en tu primera semana',
    body: 'Son 8 preguntas, unos 2 minutos, y es opcional. Se guardan con un código y sin tu nombre ni tu correo.',
    laterLabel: 'Ahora no, preguntar en 2 días',
    // Los nombres accesibles de los dos botones empiezan con su texto visible (WCAG 2.5.3, etiqueta en el nombre), para que
    // quien usa control por voz diga lo que ve. Una prueba lo revisa
    neverLabel: 'No quiero contestarla, no volver a preguntar en este dispositivo',
  },
  /** La línea de Configuración, Privacidad */
  privacyLine: {
    title: 'Encuesta de los primeros días',
    available:
      'Son 8 preguntas, unos 2 minutos, y es opcional. Se guardan con un código y sin tu nombre ni tu correo.',
    answered: 'Ya la contestaste. Puedes borrar tu respuesta cuando quieras.',
    confirm:
      'Esto borra tu respuesta y tu comentario. Si quieres, puedes contestarla de nuevo mientras siga abierta.',
  },
} as const;

/** Textos del equipo. La tarjeta de Usuarios y el botón de las invitaciones */
export const surveyAdminTexts = {
  card: {
    title: 'Encuesta de los primeros días',
    description:
      'Siete preguntas cerradas y un comentario a los pocos días de la cuenta. Las respuestas llegan con un código, sin correo, sin nombre, sin fecha y sin los días de la cuenta. Solo la ven el dueño y los administradores.',
    loading: 'Leyendo la encuesta',
    failed: 'No pudimos leer la encuesta. Revisa tu conexión e intenta de nuevo.',
    notAdmin: 'Solo el dueño y los administradores pueden ver la encuesta.',
    retry: 'Intentar de nuevo',
    settings: {
      legend: 'Cuándo se pide',
      enabled: 'Pedir la encuesta a los alumnos',
      enabledHint: 'Apagada por defecto. Se prende justo antes de invitar a los primeros alumnos.',
      delay: 'Días de espera después de crear la cuenta',
      delayHint: 'De 0 a 30. Con 0 pruebas tu propia cuenta sin esperar.',
      until: 'Solo cuentas creadas antes de',
      untilHint:
        'Opcional. Escribe el día que abres el registro y las cuentas nuevas ya no la reciben.',
      save: 'Guardar',
      saving: 'Guardando',
      saved: 'Guardamos el ajuste de la encuesta.',
      saveFailed: 'No pudimos guardar el ajuste. Intenta de nuevo.',
      invalidDelay: 'Escribe un número entero de 0 a 30.',
      invalidUntil: 'Escribe una fecha que exista, como 2026-12-01, o déjalo en blanco.',
    },
    counts: {
      region: 'Conteos de la encuesta',
      eligible: 'Cuentas que ya cumplieron los días de espera',
      answered: 'Contestaron',
      comments: 'Con comentario',
    },
    few: (answered: number) =>
      `Con ${String(answered)} ${answered === 1 ? 'respuesta' : 'respuestas'}, cualquiera puede deducir quién escribió qué. Por eso todavía no mostramos medianas.`,
    pseudonym:
      'Un código al azar no basta para ocultar de quién es una respuesta cuando son pocas personas y las conoces. Los comentarios pueden delatar a quien los escribió.',
    empty: 'Todavía no contesta nadie.',
    byQuestion: 'Por pregunta',
    median: (value: number) => `Mediana ${String(value).replace('.', ',')}`,
    notEnough: 'Sin mediana',
    responses: 'Respuestas por código',
    responsesNote: 'Ordenadas por código y no por fecha. Hasta 200.',
    commentLabel: 'Comentario',
    noComment: 'Sin comentario',
    exportCsv: 'Exportar CSV',
    exportNote:
      'El archivo trae el código y las respuestas. No trae correo, nombre, fecha ni días de la cuenta.',
    column: {
      code: 'Código',
      answers: 'Respuestas',
      comment: 'Comentario',
    },
    /** Los encabezados del CSV, una columna por pregunta y el comentario. Nada que diga de quién es */
    csv: {
      fileName: 'Studiare-encuesta-primeros-dias.csv',
      columns: [
        'Código',
        'Días que usó',
        'Qué usó',
        'Claridad',
        'Facilidad',
        'Utilidad',
        'Qué le frenó',
        'Recomendaría',
        'Comentario',
      ],
    },
    scaleSummary: (clarity: number, ease: number, useful: number) =>
      `Claridad ${String(clarity)}, facilidad ${String(ease)}, utilidad ${String(useful)}`,
    people: (n: number) => (n === 1 ? '1 persona' : `${String(n)} personas`),
  },
  invitation: {
    copy: 'Copiar mensaje de invitación',
    copyLabel: (email: string) => `Copiar mensaje de invitación para ${email}`,
    copied: (email: string) =>
      `Copiamos el mensaje de invitación para ${email}. Pégalo en su chat.`,
    copyFailed: 'No pudimos copiar el mensaje. Selecciónalo aquí y cópialo a mano.',
    sameEmail:
      'Cada persona entra con el mismo correo que invitaste. Si va a usar Google, invita el correo de su cuenta de Google. Con otro correo, Studiare le dice que está abierto solo con invitación.',
    /** El mensaje que Ricardo pega en su chat. appUrl es la dirección donde corre la app y email el correo invitado */
    message: (appUrl: string, email: string) =>
      [
        'Hola. Ya tienes tu invitación a Studiare, la plataforma para preparar el ENARM.',
        '',
        `Entra a ${appUrl} con este correo exacto, ${email}.`,
        '',
        'Hay dos caminos para entrar.',
        '1. Pide el código al correo. Te llega un código de un solo uso y lo escribes en la misma página.',
        '2. Entra con Google, si ese es el correo de tu cuenta de Google.',
        '',
        'Tu cuenta funciona en un dispositivo a la vez. Puedes cambiar de dispositivo cuando quieras, y el anterior sale de la sesión.',
        '',
        'Si algo falla, escríbeme con una captura y la hora.',
      ].join('\n'),
  },
} as const;
