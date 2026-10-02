// Textos del motor de autoconocimiento en Progreso (D-074). Cada hallazgo tiene un título, una
// frase con tus números y una acción concreta según su nivel. Las acciones siguen
// docs/ANALISIS_DOCENTE_ENARM.md. Todo es borrador pendiente de revisión médica y docente.

type Values = Record<string, number>;
type Refs = Record<string, string>;
type Level = 'strength' | 'watch' | 'focus';

const pct = (value: number | undefined) => `${Math.round((value ?? 0) * 100)}%`;
const num = (value: number | undefined) => (value ?? 0).toLocaleString('es-MX');

export const taskNames: Record<string, string> = {
  diagnosis: 'diagnóstico',
  next_step: 'siguiente paso',
  initial_study: 'estudio inicial',
  confirmatory_study: 'estudio confirmatorio',
  initial_treatment: 'tratamiento inicial',
  treatment_of_choice: 'tratamiento de elección',
  mechanism: 'mecanismo o fisiopatología',
  risk_factor: 'factor de riesgo',
  complication_prognosis: 'complicaciones y pronóstico',
  prevention_screening: 'prevención y tamizaje',
  data_interpretation: 'interpretación de datos',
};

const taskAdvice: Record<string, string> = {
  diagnosis:
    'Antes de ver las opciones, nombra tu diagnóstico y el dato que lo sostiene. Luego busca el dato que lo descartaría.',
  next_step:
    'Ubica al paciente en el algoritmo. Primero estable o inestable, luego qué ya se hizo y qué sigue según la guía.',
  initial_study:
    'Distingue el estudio inicial, el más accesible y rápido, del confirmatorio. El ENARM suele pedir el inicial.',
  confirmatory_study:
    'Repasa cuál es el estándar de oro de cada diagnóstico frecuente y cuándo se pide.',
  initial_treatment:
    'Separa lo inmediato (estabilizar, primera dosis) del tratamiento definitivo. Pregúntate qué harías en los primeros minutos.',
  treatment_of_choice:
    'Haz tarjetas de primera línea contra segunda línea de cada guía. La opción correcta casi siempre es la de la GPC vigente.',
  mechanism: 'Repasa la fisiopatología con esquemas cortos que unan causa, mecanismo y signo.',
  risk_factor:
    'Ordena los factores de riesgo por peso. El ENARM suele preguntar el más importante.',
  complication_prognosis:
    'Para cada enfermedad frecuente, aprende la complicación más común y la más grave por separado.',
  prevention_screening:
    'Repasa edades y periodicidad de tamizaje de las NOM y del esquema de vacunación vigente.',
  data_interpretation:
    'Practica leer gasometrías, laboratorios y electrocardiogramas con un orden fijo antes de ver las opciones.',
};

const hourNames: Record<string, string> = {
  madrugada: 'madrugada',
  manana: 'mañana',
  tarde: 'tarde',
  noche: 'noche',
};

export const causeNames: Record<string, string> = {
  not_studied: 'No lo había estudiado',
  forgot: 'Lo olvidé',
  confused: 'Lo confundí con otra cosa',
  misread: 'Leí mal',
  missed_detail: 'Se me pasó un detalle',
  rushed_or_tired: 'Fui muy rápido o estaba cansado',
  changed_answer: 'Cambié mi respuesta',
  other: 'Otra razón',
};

const causeAdvice: Record<string, string> = {
  not_studied:
    'Son huecos de contenido. Agrega esos temas a tu plan y empieza con su resumen y sus tarjetas.',
  forgot:
    'Lo estudiaste pero no se quedó. Crea tarjetas de esas preguntas para que entren al repaso espaciado.',
  confused:
    'Haz tablas comparativas de lo que confundes, por ejemplo dos diagnósticos parecidos, con el dato que los separa.',
  misread:
    'Lee primero la pregunta final, marca las negaciones y no respondas antes de terminar el caso.',
  missed_detail:
    'Al leer, busca a propósito edad, signos vitales, tiempo de evolución y el último dato del caso.',
  rushed_or_tired: 'Revisa tu ritmo y tus pausas. Bloques más cortos con descansos te ayudan.',
  changed_answer: 'Cambia solo si encuentras un dato concreto que leíste mal, no por duda.',
  other: 'Revisa la explicación de cada error y anota en una frase qué harías distinto.',
};

const unitNames = {
  answers: 'respuestas',
  sessions: 'sesiones',
  tagged_errors: 'errores en preguntas con trampa etiquetada',
  reviews: 'repasos de tarjetas',
  days: 'días desde que empezaste',
  changes: 'cambios de respuesta',
  causes: 'errores con causa reportada',
} as const;

interface InsightCopy {
  title: string;
  text: (values: Values, refs: Refs, level: Level) => string;
  action: (values: Values, refs: Refs, level: Level) => string;
}

const copy: Record<string, InsightCopy> = {
  pace: {
    title: 'Ritmo por pregunta',
    text: (v) =>
      `Tardas una mediana de ${num(v.seconds)} segundos por pregunta. En el ENARM tienes unos ${num(v.target)} segundos.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Practica bloques con reloj. Si una pregunta pasa de 2 minutos, marca tu mejor opción y sigue.'
        : level === 'watch'
          ? 'Vas un poco arriba del ritmo. Entrena bloques de 20 preguntas con reloj.'
          : 'Tu ritmo alcanza para terminar el examen con margen para revisar.',
  },
  rapid_guess: {
    title: 'Responder sin terminar de leer',
    text: (v) =>
      `${pct(v.share)} de tus respuestas llegan antes de lo que toma leer el caso, con ${pct(v.accuracy)} de acierto.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Lee primero la pregunta final y luego el caso buscando el dato que la responde. No contestes antes de terminar.'
        : level === 'watch'
          ? 'Te pasa a veces. Cuando sientas prisa, lee por lo menos la última línea del caso.'
          : 'Lees los casos completos antes de responder.',
  },
  stuck: {
    title: 'Preguntas en las que te atoras',
    text: (v) =>
      `${num(v.count)} preguntas te tomaron mucho más que tu ritmo normal, con ${pct(v.accuracy)} de acierto.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Quedarte más tiempo no te está ayudando. Ponte un tope de 2 minutos y vuelve al final si sobra tiempo.'
        : level === 'watch'
          ? 'Fíjate en qué temas te atoras y repásalos con tarjetas.'
          : 'Casi nunca te atoras en una pregunta.',
  },
  negation: {
    title: 'Preguntas en negativo',
    text: (v) =>
      `En preguntas con EXCEPTO o NO aciertas ${pct(v.negativeAccuracy)} y en las afirmativas ${pct(v.affirmativeAccuracy)}. ${num(v.misreads)} errores parecen de mala lectura.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Antes de elegir, repite la pregunta con la negación en voz baja. Deja encendido el resaltado de negaciones.'
        : level === 'watch'
          ? 'Rindes un poco menos en negativas. Mantén encendido el resaltado.'
          : 'Las negaciones no te hacen tropezar.',
  },
  task: {
    title: 'Tipo de pregunta más débil',
    text: (v, r) =>
      `En preguntas de ${taskNames[r.task ?? ''] ?? r.task} aciertas ${pct(v.accuracy)} y en el resto ${pct(v.rest)}.`,
    action: (_v, r) =>
      taskAdvice[r.task ?? ''] ?? 'Practica más preguntas de este tipo en el simulador.',
  },
  serial: {
    title: 'Casos seriados',
    text: (v) =>
      `En la segunda y tercera pregunta de un caso aciertas ${pct(v.later)} y en la primera ${pct(v.first)}.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Cada pregunta del caso puede traer datos nuevos. Relee el caso antes de cada una y no arrastres tu respuesta anterior.'
        : level === 'strength'
          ? 'Mantienes el hilo en los casos seriados.'
          : 'No hay diferencia clara entre la primera pregunta del caso y las siguientes.',
  },
  long_vignettes: {
    title: 'Casos largos',
    text: (v) => `En casos largos aciertas ${pct(v.long)} y en los cortos ${pct(v.short)}.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Lee primero la pregunta y luego busca en el caso solo lo que la responde. Edad, signos vitales y el último dato suelen decidir.'
        : level === 'strength'
          ? 'Los casos largos no te cuestan más.'
          : 'Sin diferencia clara entre casos largos y cortos.',
  },
  changes: {
    title: 'Cambios de respuesta',
    text: (v) =>
      `Cambiaste ${num(v.total)} veces. ${num(v.toCorrect)} fueron de mal a bien y ${num(v.toIncorrect)} de bien a mal.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Tus cambios te restan. Cambia solo si encuentras un dato concreto del caso que leíste mal, no por duda.'
        : level === 'strength'
          ? 'Tus cambios suelen ser acertados. Revisar te funciona, como muestran los estudios sobre cambiar respuestas.'
          : 'Tus cambios salen parejos. Cambia solo con un dato concreto.',
  },
  confidence: {
    title: 'Confianza contra acierto',
    text: (v) =>
      `Cuando marcas Seguro aciertas ${pct(v.sure)}, con Dudo ${pct(v.unsure)} y al adivinar ${pct(v.guessed)}.`,
    action: (v, r) =>
      r.label === 'overconfident'
        ? `Tienes ${num(v.sureErrors)} errores marcados como Seguro. Repásalos primero, ahí están los temas que crees dominar.`
        : r.label === 'underconfident'
          ? 'Sabes más de lo que crees. Confía en tu primera respuesta razonada.'
          : 'Tu confianza refleja bien lo que sabes.',
  },
  fatigue: {
    title: 'Final de sesiones largas',
    text: (v) =>
      `En ${num(v.sessions)} sesiones de más de 30 minutos, tu acierto ajustado ${(v.drop ?? 0) < 0 ? 'baja' : 'sube'} ${Math.abs(Math.round((v.drop ?? 0) * 100))} puntos del primer tercio al último.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Tu acierto cae al final. Entrena bloques largos con pausas breves, agua y algo de comer, como en el examen de 6 horas.'
        : 'Mantienes tu acierto en sesiones largas.',
  },
  best_hour: {
    title: 'Tu mejor horario',
    text: (v, r) =>
      `Aciertas más en la ${hourNames[r.best ?? ''] ?? r.best} (${pct(v.best)}) y menos en la ${hourNames[r.worst ?? ''] ?? r.worst} (${pct(v.worst)}).`,
    action: () =>
      'Deja lo más difícil para tu mejor horario. El ENARM empieza temprano, así que practica también por la mañana.',
  },
  biases: {
    title: 'Trampas que te atrapan',
    text: (v) => `Revisamos ${num(v.tagged)} errores y se reparten sin una trampa que domine.`,
    action: () => 'Sigue practicando. Con más errores el análisis se vuelve más fino.',
  },
  consistency: {
    title: 'Constancia',
    text: (v) => `Estudiaste ${num(v.days)} de los últimos ${num(v.window)} días.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Es mejor poco cada día que mucho un solo día. Ponte una meta mínima de 15 minutos diarios.'
        : level === 'watch'
          ? 'Procura no dejar pasar más de un día sin repasar. El repaso espaciado depende de eso.'
          : 'Tu constancia es lo que más ayuda a recordar a largo plazo.',
  },
  retention: {
    title: 'Retención de tarjetas',
    text: (v) =>
      `Recuerdas ${pct(v.retention)} de tus tarjetas maduras y tu meta es ${pct(v.desired)}.`,
    action: (_v, _r, level) =>
      level === 'focus'
        ? 'Olvidas más de lo planeado. Califica con honestidad, sin dar Bien cuando dudaste, y baja las tarjetas nuevas unos días.'
        : level === 'watch'
          ? 'Estás cerca de tu meta. Revisa las tarjetas que más fallas.'
          : 'Tu repaso está funcionando.',
  },
  leeches: {
    title: 'Tarjetas que se te resisten',
    text: (v) =>
      `${num(v.leeches)} tarjetas llevan 8 o más olvidos y ${num(v.hardCards)} llevan 4 o más.`,
    action: (_v, _r, level) =>
      level === 'strength'
        ? 'Ninguna tarjeta se te resiste.'
        : 'Reescribe esas tarjetas. Divídelas en preguntas más pequeñas o agrégales una imagen o un truco para recordar.',
  },
  session_length: {
    title: 'Duración de tus sesiones',
    text: (v) =>
      `Tus sesiones duran una mediana de ${num(v.minutes)} minutos en ${num(v.sessions)} sesiones.`,
    action: (v, _r, level) =>
      level === 'strength'
        ? 'La duración de tus sesiones es sostenible.'
        : (v.minutes ?? 0) > 90
          ? 'Sesiones muy largas cansan. Divídelas en bloques de 45 a 60 minutos con pausas.'
          : 'Tus sesiones son muy cortas. Bloques de 25 minutos o más te ayudan a entrar en ritmo.',
  },
  causes: {
    title: 'Por qué fallas, según tú',
    text: (v, r) =>
      `La causa que más reportas es "${causeNames[r.cause ?? ''] ?? r.cause}", en ${pct(v.share)} de ${num(v.total)} errores.`,
    action: (_v, r) => causeAdvice[r.cause ?? ''] ?? causeAdvice.other ?? '',
  },
};

export const insightText = {
  title: 'Conócete',
  description:
    'Un espacio para entender cómo estudias y cómo respondes. Cada lectura sale de tus propios datos y aparece cuando hay suficientes para que sea confiable.',
  disclaimer:
    'Son estimaciones para ayudarte a mejorar, no un diagnóstico ni una predicción de tu puntaje.',
  summary: 'Tu resumen',
  strengths: 'Lo que ya haces bien',
  focus: 'Dónde enfocarte',
  noStrengths: 'Aún no hay fortalezas claras. Aparecen al juntar más datos.',
  noFocus: 'Nada urgente por ahora. Sigue así.',
  areas: {
    exam: {
      title: 'Cómo respondes',
      hint: 'Tu técnica frente al examen. Ritmo, lectura, cambios, confianza y cansancio.',
    },
    traps: {
      title: 'Qué trampas te atrapan',
      hint: 'A qué tipo de distractor van tus errores, comparado con elegir al azar entre los que viste.',
    },
    study: {
      title: 'Cómo estudias',
      hint: 'Tus hábitos de repaso. Constancia, retención, tarjetas difíciles y duración de sesiones.',
    },
  },
  levels: { strength: 'Fortaleza', watch: 'A vigilar', focus: 'Enfócate' },
  calibratingLabel: 'Calibrando',
  calibrating: (have: number, need: number, unit: keyof typeof unitNames) =>
    `Llevas ${num(have)} de ${num(need)} ${unitNames[unit]}.`,
  whatToDo: 'Qué hacer',
  biasText: (attraction: number, baseline: number) =>
    `Cuando fallas y hay un distractor de este tipo, lo eliges ${pct(attraction)} de las veces. Al azar sería ${pct(baseline)}.`,
  biasFallbackAction:
    'Revisa la explicación de esos distractores y anota qué dato te habría salvado.',
  profileTitle: 'Tu perfil de trampas',
  profileHint:
    'Los tipos de distractor que más te atraen cuando fallas, aunque no lleguen a patrón.',
  profileShare: (share: number) => `Lo eliges ${pct(share)} de las veces que aparece al fallar`,
  copy,
};

export type InsightCopyKey = keyof typeof copy;
