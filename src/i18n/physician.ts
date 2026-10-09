// Textos del área del médico de la Fase E (pantallas 18 a 22), en español de México con trato de tú
// (4.9). Se integran en t desde es-MX.ts.
import { plural } from './features';

const num = (value: number) => value.toLocaleString('es-MX');

export const physicianText = {
  agreementScreen: {
    stats: {
      label: 'Doble etiquetado en cifras',
      sample: 'Muestra',
      sampleCaption: (questions: number, options: number) =>
        `${plural(questions, 'pregunta', 'preguntas')} y ${plural(options, 'distractor', 'distractores')}`,
      mine: 'Mis etiquetas',
      mineCaption: (done: number, total: number) => `${num(done)} de ${num(total)} distractores`,
      pairs: 'Pares',
      pairsCaption: 'etiquetados por dos médicos',
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
      calibrating: 'Faltan opciones etiquetadas por dos médicos para fiarse de kappa.',
      unit: 'opciones con dos etiquetas',
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
      title: 'Mi cola de doble etiquetado',
      hint: 'Etiqueta a ciegas el sesgo que explota cada distractor, sin ver lo que puso el autor ni otro médico. Cada etiqueta se guarda al elegirla.',
      empty:
        'No tienes preguntas de la muestra por etiquetar. O ya terminaste, o todavía no te asignan subespecialidades.',
      adminNote:
        'Las etiquetas las ponen los médicos. Aquí ves cómo va el acuerdo. Para etiquetar entra como médico.',
      progress: (done: number, total: number) => `${done} de ${total} etiquetados`,
      option: (text: string) => `Etiqueta del distractor ${text}`,
      none: 'Sin etiquetar',
      saved: 'Etiqueta guardada.',
      failed: 'No se pudo guardar la etiqueta. Intenta de nuevo.',
      showMore: (n: number) => `Mostrar ${num(n)} más`,
      remaining: (n: number) => plural(n, 'pregunta por etiquetar', 'preguntas por etiquetar'),
    },
    empty: {
      title: 'Todavía no hay preguntas',
      description: 'Cuando haya preguntas en el banco, el 20 % entra al doble etiquetado.',
    },
  },
};
