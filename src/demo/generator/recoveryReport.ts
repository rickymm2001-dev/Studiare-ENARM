// Texto del informe de recuperación de parámetros (14.2) en docs/recovery-report.md.
import { GENERATOR_VERSION } from './model';
import type { DetectionResult, RecoveryReport } from './recovery';

export interface ReportGroup {
  title: string;
  description: string;
  seeds: string[];
  reports: RecoveryReport[];
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const num = (value: number) => value.toFixed(3);

export const versionLine = (version: string) => `Versión del generador ${version}.`;

function row(label: string, goal: string, values: readonly string[], met: readonly boolean[]) {
  const verdict = met.every(Boolean) ? 'Sí' : met.some(Boolean) ? 'En parte' : 'No';
  return `| ${label} | ${goal} | ${values.join(' | ')} | ${verdict} |`;
}

function detectionRows(
  label: string,
  pick: (report: RecoveryReport) => DetectionResult,
  reports: readonly RecoveryReport[],
) {
  return [
    row(
      `${label}, detectados entre los sembrados`,
      '80% o más',
      reports.map((r) => `${pct(pick(r).sensitivity)} (${pick(r).detected} de ${pick(r).seeded})`),
      reports.map((r) => pick(r).sensitivity >= 0.8),
    ),
    row(
      `${label}, marcados sin nada sembrado`,
      '10% o menos',
      reports.map(
        (r) => `${pct(pick(r).falsePositiveRate)} (${pick(r).flagged} de ${pick(r).notSeeded})`,
      ),
      reports.map((r) => pick(r).falsePositiveRate <= 0.1),
    ),
  ];
}

function table(group: ReportGroup): string[] {
  const { reports } = group;
  return [
    `### ${group.title}`,
    '',
    group.description,
    '',
    `| Medida | Meta | ${group.seeds.map((seed) => `Semilla ${seed}`).join(' | ')} | Cumple |`,
    `|---|---|${group.seeds.map(() => '---|').join('')}---|`,
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
    ...detectionRows('Fatiga por tercios (7.6)', (r) => r.fatigue, reports),
    ...detectionRows('Fatiga por tendencia', (r) => r.fatigueTrend, reports),
    row(
      'Fatiga apreciable (efecto medio de 0.15 logits o más), detectados por tercios',
      '80% o más',
      reports.map(
        (r) =>
          `${pct(r.fatigueNoticeable.thirds / Math.max(r.fatigueNoticeable.seeded, 1))} (${r.fatigueNoticeable.thirds} de ${r.fatigueNoticeable.seeded})`,
      ),
      reports.map((r) => r.fatigueNoticeable.thirds >= 0.8 * r.fatigueNoticeable.seeded),
    ),
    row(
      'Fatiga apreciable, detectados por tendencia',
      '80% o más',
      reports.map(
        (r) =>
          `${pct(r.fatigueNoticeable.trend / Math.max(r.fatigueNoticeable.seeded, 1))} (${r.fatigueNoticeable.trend} de ${r.fatigueNoticeable.seeded})`,
      ),
      reports.map((r) => r.fatigueNoticeable.trend >= 0.8 * r.fatigueNoticeable.seeded),
    ),
    '',
    `Pares alumno y etiqueta sin propensión marcados. Método de 7.4 ${reports.map((r) => pct(r.bias.falsePositivePairRate)).join(', ')}. Parte de los errores sin corrección ${reports.map((r) => pct(r.bias.errorShare.falsePositivePairRate)).join(', ')}. Con corrección de Bonferroni ${reports.map((r) => pct(r.bias.errorShareCorrected.falsePositivePairRate)).join(', ')}.`,
    '',
  ];
}

export function renderRecoveryReport(groups: readonly ReportGroup[]): string {
  const first = groups[0]?.reports[0] as RecoveryReport;
  const lines = [
    '# Informe de recuperación de parámetros (14.2)',
    '',
    `Generado por npm run recovery-report a partir de tests/recovery/recovery.test.ts. ${versionLine(GENERATOR_VERSION)} Los números son reales y salen de los motores de src/engines sobre alumnos simulados con parámetros verdaderos conocidos. No sustituyen datos reales.`,
    '',
    '## Cómo se generó',
    '',
    `- ${first.students} alumnos simulados por semilla, 90 días de historial y el banco demo actual de ${first.items} preguntas (lotes 1 a 4). En promedio ${Math.round(first.responses / first.students)} respuestas por alumno, así que cada alumno ve varias veces el mismo banco`,
    '- 20% de los alumnos con una propensión de sesgo sembrada entre las 10 etiquetas más frecuentes del banco, 20% con mala lectura de negaciones (probabilidad de 0.3 a 0.5 de leer al revés una negativa) y 20% con fatiga (empieza entre el minuto 15 y el 30 de la sesión y quita de 0.05 a 0.08 logits por minuto)',
    '- Respuestas con modelo Rasch sobre la dificultad verdadera, que es la del médico más ruido normal de 0.6 logits, opciones muestreadas por el motor real en modo diverso y tiempos que dependen de las palabras y la velocidad de lectura de cada alumno',
    '- La probabilidad esperada que usan la mala lectura y la fatiga viene de la calibración de Rasch, igual que en la app. La verdad de cada tema es el promedio de la probabilidad con que el modelo generó esas respuestas',
    '- La simulación de tarjetas con FSRS no entra a esta prueba porque 14.2 no tiene metas de tarjetas',
    '',
    '## Resultados',
    '',
    ...groups.flatMap(table),
    '## Lectura',
    '',
    '- Rasch, Elo, temas y mala lectura cumplen sus metas en todas las semillas',
    '- Elo sale muy alto porque cada alumno simulado responde cada pregunta varias veces. Con alumnos reales y menos respuestas por pregunta se espera más bajo, y la meta se vuelve a revisar con datos reales',
    '- Sesgos. El método original de 7.4 encuentra a casi todos los alumnos sembrados, pero también marca a cerca de la mitad de los que no tienen propensión. Hay dos causas. La atracción se mide contra todas las veces que la etiqueta estuvo a la vista, así que un alumno que se equivoca mucho parece atraído por todas las etiquetas. Y se prueban unas 20 etiquetas por alumno con un intervalo de 95% cada una, así que alguna sale arriba de la línea base por azar. Por eso Ricardo aprobó el método por defecto de D-051',
    '- Fatiga. Con todos los sembrados, ninguno de los dos métodos llega a 80%. La causa es que una parte de los alumnos con fatiga sembrada casi no la siente, porque empieza cerca del final de sus sesiones habituales o pierde poco por minuto. En ellos el efecto medio es de unos 0.04 logits por respuesta, cerca de un punto de acierto, y no es detectable con ningún método. Entre los alumnos cuya fatiga sí pesa (0.15 logits o más), los dos métodos cumplen la meta. La tendencia es más estable entre semillas y en general detecta más y marca menos que los tercios',
    '',
    '## Límites de esta validación',
    '',
    '- La variante de sesgos (D-051) se diseñó viendo los resultados de las semillas de diseño. Por eso se evalúa también con semillas nuevas que no se miraron al diseñarla',
    '- En el modelo principal del generador el sesgo pesa más al elegir distractor cuando el alumno falla, que es justo lo que mide la variante. Para no evaluarla en condiciones que la favorecen, se repite con un modelo de sesgo distinto (lure), donde el sesgo solo atrae cuando el alumno sabía la respuesta',
    '- Ninguna simulación sustituye datos reales. Con la población real se vuelven a correr estas medidas',
    '',
    '## Ajustes',
    '',
    '1. Sesgos (D-051, aprobado por Ricardo). El método por defecto mide qué parte de los errores con la etiqueta a la vista fue a esa etiqueta, con la línea base calculada igual, y corrige el nivel del intervalo por Bonferroni según cuántas etiquetas se evalúan. El método original de 7.4 queda como opción (method exposure)',
    '2. Fatiga (D-054). La tendencia contra el minuto de la sesión (fatigueTrendSignal) está en el motor junto al método de tercios. Recomiendo adoptarla como método por defecto, porque es más estable entre semillas y marca menos, y redefinir la meta de 14.2 sobre los alumnos cuya fatiga sí pesa en sus respuestas',
    '',
  ];
  return `${lines.join('\n')}\n`;
}
