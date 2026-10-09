// El vocabulario de sesgos o de trampas (4.4, 7.11). Con kappa menor a 0.4, o sin doble etiquetado
// suficiente, la interfaz del alumno habla de trampas, porque no se puede afirmar que los médicos
// coinciden en cuál sesgo explota cada distractor. Con kappa de 0.4 o más habla de sesgos. Aquí vive
// lo que cambia entre las dos formas. Se integra en t desde es-MX.ts.
export type Vocabulary = 'bias' | 'trap';

export const vocabularyText = {
  vocabulary: {
    trap: {
      biasTipsTitle: 'Consejos por trampa',
      patternWidget: 'Patrón de trampa',
    },
    bias: {
      biasTipsTitle: 'Consejos por sesgo',
      patternWidget: 'Patrón de sesgo',
    },
  },
};
