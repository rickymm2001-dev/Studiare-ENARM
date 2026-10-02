// Texto del informe de recuperación de parámetros (14.2) en docs/recovery-report.md.
import type { DetectionResult, RecoveryReport } from './recovery';

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const num = (value: number) => value.toFixed(3);

function row(
  label: string,
  goal: string,
  values: readonly string[],
  met: readonly boolean[],
): string {
  const verdict = met.every(Boolean) ? 'Sí' : met.some(Boolean) ? 'En parte' : 'No';
  return `| ${label} | ${goal} | ${values.join(' | ')} | ${verdict} |`;
}

const detectionRows = (
  label: string,
  pick: (report: RecoveryReport) => DetectionResult,
  reports: readonly RecoveryReport[],
) => [
  row(
    `${label}, detectados entre los sembrados`,
    '80% o más',
    reports.map(
      (report) =>
        `${pct(pick(report).sensitivity)} (${pick(report).detected} de ${pick(report).seeded})`,
    ),
    reports.map((report) => pick(report).sensitivity >= 0.8),
  ),
  row(
    `${label}, marcados sin nada sembrado`,
    '10% o menos',
    reports.map(
      (report) =>
        `${pct(pick(report).falsePositiveRate)} (${pick(report).flagged} de ${pick(report).notSeeded})`,
    ),
    reports.map((report) => pick(report).falsePositiveRate <= 0.1),
  ),
];

export function renderRecoveryReport(
  reports: readonly RecoveryReport[],
  seeds: readonly string[],
): string {
  const first = reports[0] as RecoveryReport;
  const header = `| Medida | Meta | ${seeds.map((seed) => `Semilla ${seed}`).join(' | ')} | Cumple |`;
  const divider = `|---|---|${seeds.map(() => '---|').join('')}---|`;
  const lines = [
    '# Informe de recuperación de parámetros (14.2)',
    '',
    'Generado por npm run recovery-report a partir de src/demo/generator/tests/recovery/recovery.test.ts. Los números son reales y salen de los motores de src/engines sobre alumnos simulados con parámetros verdaderos conocidos. No sustituyen datos reales.',
    '',
    '## Cómo se generó',
    '',
    `- ${first.students} alumnos simulados por semilla, 90 días de historial y el banco demo actual de ${first.items} preguntas (lotes 1 a 4). En promedio ${Math.round(first.responses / first.students)} respuestas por alumno, así que cada alumno ve varias veces el mismo banco`,
    '- 20% de los alumnos con una propensión de sesgo sembrada entre las 10 etiquetas más frecuentes del banco, 20% con mala lectura de negaciones (probabilidad de 0.3 a 0.5 de leer al revés una negativa) y 20% con fatiga (empieza entre el minuto 15 y el 30 de la sesión y quita de 0.05 a 0.08 logits por minuto)',
    '- Respuestas con modelo Rasch sobre la dificultad verdadera, que es la del médico más ruido normal de 0.6 logits, opciones muestreadas por el motor real en modo diverso y tiempos que dependen de las palabras y la velocidad de lectura de cada alumno',
    '- La probabilidad esperada que usan la mala lectura y la fatiga viene de la calibración de Rasch, igual que en la app',
    '- La simulación de tarjetas con FSRS no entra a esta prueba porque 14.2 no tiene metas de tarjetas',
    '',
    '## Resultados',
    '',
    header,
    divider,
    row(
      'Rasch, correlación con la dificultad verdadera',
      '0.90 o más',
      reports.map((r) => num(r.rasch.correlation)),
      reports.map((r) => r.rasch.correlation >= 0.9),
    ),
    row(
      'Elo, correlación con la dificultad verdadera',
      '0.80 o más',
      reports.map((r) => num(r.elo.correlation)),
      reports.map((r) => r.elo.correlation >= 0.8),
    ),
    row(
      'Temas, error del dominio crudo contra encogido (RMSE)',
      'El encogido es menor',
      reports.map(
        (r) =>
          `${num(r.topics.rmseRaw)} contra ${num(r.topics.rmseShrunk)}, baja ${pct(r.topics.reduction)}`,
      ),
      reports.map((r) => r.topics.rmseShrunk < r.topics.rmseRaw),
    ),
    ...detectionRows('Sesgos con el método de 7.4', (r) => r.bias, reports),
    ...detectionRows(
      'Sesgos con la variante propuesta (D-051)',
      (r) => r.bias.errorShareCorrected,
      reports,
    ),
    ...detectionRows('Mala lectura de negaciones', (r) => r.misread, reports),
    ...detectionRows('Fatiga', (r) => r.fatigue, reports),
    '',
    'Pares alumno y etiqueta sin propensión marcados como patrón',
    '',
    `- Método de 7.4. ${reports.map((r) => pct(r.bias.falsePositivePairRate)).join(', ')}`,
    `- Parte de los errores sin corrección. ${reports.map((r) => pct(r.bias.errorShare.falsePositivePairRate)).join(', ')}`,
    `- Parte de los errores con corrección de Bonferroni. ${reports.map((r) => pct(r.bias.errorShareCorrected.falsePositivePairRate)).join(', ')}`,
    '',
    '## Lectura',
    '',
    '- Rasch, Elo, temas y mala lectura cumplen sus metas en las 3 semillas',
    '- Elo sale muy alto porque cada alumno simulado responde cada pregunta varias veces. Con alumnos reales y menos respuestas por pregunta se espera más bajo, y la meta se vuelve a revisar con datos reales',
    '- Sesgos. El método de 7.4 encuentra a casi todos los alumnos sembrados, pero también marca a cerca de la mitad de los que no tienen propensión. Hay dos causas. La primera es que la atracción se mide contra todas las veces que la etiqueta estuvo a la vista, así que un alumno que se equivoca mucho parece atraído por todas las etiquetas. La segunda es que se prueban unas 20 etiquetas por alumno con un intervalo de 95% cada una, así que alguna sale arriba de la línea base por azar',
    '- Fatiga. La detección queda por debajo de la meta. El motor compara el primer y el último tercio de las sesiones de más de 30 minutos. Cuando la fatiga del alumno empieza cerca del final de sus sesiones habituales, el último tercio casi no la refleja, y con pocas sesiones largas el error estándar es grande. Los falsos positivos sí cumplen',
    '',
    '## Ajustes propuestos, pendientes de aprobación de Ricardo',
    '',
    '1. Sesgos (D-051). Medir qué parte de los errores con la etiqueta a la vista fue a esa etiqueta, con la línea base calculada igual, y corregir el nivel del intervalo por Bonferroni según cuántas etiquetas se evalúan. Ya está en el motor como opción (method error_share y familywise), sin cambiar el comportamiento por defecto. Con esto se cumplen ambas metas. Recomiendo adoptarla, porque el lenguaje de patrón probable solo es honesto si no marca a la mitad de los alumnos',
    '2. Fatiga. Opción a, mantener el método y mostrar calibrando hasta tener más sesiones largas. Opción b, cambiar la comparación por tercios por una regresión de la exactitud ajustada contra el minuto de la sesión, que aprovecha todas las respuestas. Recomiendo probar la opción b en el bloque siguiente y repetir esta prueba antes de decidir',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
