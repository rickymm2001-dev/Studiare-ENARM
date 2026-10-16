// Reporte de la elección de modelo (B12, 4.6 del plan), docs/eval-ai-report.md. Lleva métricas por
// motor y candidato, costo medido, latencias, negativas, cortes, la calificación del juez, lo elegido
// por motor y la proyección por alumno. Nunca lleva texto de casos ni razones del juez, que van al
// detalle de private/ con --json.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import { ENGINE_MAX_TOKENS } from './candidates.ts';
import type { CaseSet } from './cases.ts';
import type { BatchEvalResult } from './batch.ts';
import {
  gateRun,
  overallSummary,
  runKey,
  type EngineChoice,
  type JudgeSummary,
  type RankedCandidate,
} from './choice.ts';
import type { MatrixResult } from './matrix.ts';
import { PROFILE_LABELS, STUDENT_PROFILES, type Projection } from './projection.ts';
import type { OpenAiModel } from './openaiModels.ts';
import { percent, summarizeGroup } from './run.ts';

export interface MatrixReportInput {
  mode: 'real' | 'mock';
  /** Fecha de la corrida, AAAA-MM-DD */
  date: string;
  repeat: number;
  matrix: MatrixResult;
  choices: readonly EngineChoice[];
  /** null sin --judge */
  judge: { kind: 'real' | 'simulated'; model: string } | null;
  projection: Projection;
  spentUsd: number;
  maxCostUsd: number;
  caseCounts: Partial<Record<CaseSet, number>>;
}

const usd = (value: number) => (value < 0.01 ? value.toFixed(5) : value.toFixed(4));
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** El gasto de la corrida. En modo simulado es teórico y no hay tope */
function spendText(mode: 'real' | 'mock', spent: number, max: number): string {
  if (mode === 'mock') return `Costo teórico ${usd(spent)} dólares, sin gasto real.`;
  return `Gasto ${usd(spent)} dólares de un tope de ${Number.isFinite(max) ? max : 'sin límite'}.`;
}

const SET_LABELS: Readonly<Record<CaseSet, string>> = {
  synthetic: 'sintéticos',
  demo: 'del banco de demostración',
  adversarial: 'adversarios',
  bank: 'del banco real (private/)',
};

function judgeCell(item: RankedCandidate, judged: boolean, chosen: boolean): string {
  if (!judged) return 'sin juez';
  if (!item.gate.passed) return 'no aplica';
  // El juez va del más barato al más caro y para cuando uno pasa
  if (!item.judge) return chosen ? 'no hizo falta' : 'sin calificar';
  const critical = item.judge.critical > 0 ? `, ${item.judge.critical} críticos` : '';
  return `${item.judge.mean.toFixed(2)}${critical}`;
}

function engineSection(
  engine: AiEngine,
  input: MatrixReportInput,
  choice: EngineChoice | undefined,
): string[] {
  const runs = input.matrix.runs.filter((run) => run.engine === engine);
  if (runs.length === 0 || !choice) return [];
  const lines = [
    `### ${engine}`,
    '',
    '| Candidato | Modelo | Esfuerzo | Razonamiento | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const item of choice.ranked) {
    const run = runs.find((entry) => entry.candidate.name === item.candidate.name);
    if (!run) continue;
    const summary = overallSummary(run);
    lines.push(
      `| ${item.candidate.name} | ${item.candidate.id} | ${item.candidate.effort ?? 'ninguno'} | ${item.candidate.thinking ?? 'ninguno'} | ${usd(item.costPerCallUsd)} | ${percent(summary.schemaValid, summary.cases)} | ${percent(summary.grounded, summary.answerCases)} | ${percent(summary.rejectedRight, summary.rejectionCases)} | ${percent(summary.adversarialRight, summary.adversarialCases)} | ${summary.refusals} | ${summary.cutoffs} | ${seconds(item.p95LatencyMs)} | ${judgeCell(item, input.judge !== null, choice.chosen !== null)} | ${item.gate.passed ? 'pasa' : item.gate.failures.join('; ')} |`,
    );
  }
  for (const skipped of input.matrix.skipped.filter((entry) => entry.engine === engine)) {
    lines.push(
      `| ${skipped.candidate.name} | ${skipped.candidate.id} | ${skipped.candidate.effort ?? 'ninguno'} | ${skipped.candidate.thinking ?? 'ninguno'} | | | | | | | | | | ${skipped.reason} |`,
    );
  }
  lines.push('', `Elegido. ${choice.reason}`, '');
  return lines;
}

/** La configuración de lo elegido, lista para DEFAULT_CONFIG (contrato C4) */
function chosenConfig(choices: readonly EngineChoice[]): string[] {
  const rows = choices
    .filter((choice): choice is EngineChoice & { chosen: NonNullable<EngineChoice['chosen']> } =>
      Boolean(choice.chosen),
    )
    .map(
      (choice) =>
        `  ${choice.engine}: { id: '${choice.chosen.id}', effort: ${choice.chosen.effort ? `'${choice.chosen.effort}'` : 'null'}, thinking: ${choice.chosen.thinking ? `'${choice.chosen.thinking}'` : 'null'}, maxTokens: ${ENGINE_MAX_TOKENS[choice.engine]} },`,
    );
  if (rows.length === 0) return ['Ningún motor tiene candidato elegido todavía.', ''];
  return ['```ts', 'models: {', ...rows, '}', '```', ''];
}

function projectionSection(projection: Projection): string[] {
  const lines = [
    '| Perfil | Hipótesis | Informes | Consejos | Secciones de tarjetas | Costo al mes (USD) | Alumnos al día con el presupuesto |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const profile of projection.profiles) {
    const counts = STUDENT_PROFILES[profile.profile];
    lines.push(
      `| ${PROFILE_LABELS[profile.profile]} | ${counts.forgetting} | ${counts.weekly_report} | ${counts.bias_tips} | ${counts.flashcards} | ${usd(profile.monthlyUsd)}${profile.overDailyCap ? ' (lo frena el tope por alumno)' : ''} | ${Number.isFinite(profile.studentsPerDay) ? profile.studentsPerDay : 'sin límite'} |`,
    );
  }
  lines.push('');
  if (projection.restructureMonthlyUsd !== null) {
    lines.push(
      `Preguntas reestructuradas, 20 al mes por lote en todo el sistema, ${usd(projection.restructureMonthlyUsd)} dólares al mes.`,
      '',
    );
  }
  if (projection.missing.length > 0) {
    lines.push(
      `Sin costo medido de ${projection.missing.join(', ')}, que no entra a la cuenta.`,
      '',
    );
  }
  return lines;
}

export function formatMatrixReport(input: MatrixReportInput): string {
  const counts = Object.entries(input.caseCounts)
    .filter(([, count]) => count > 0)
    .map(([set, count]) => `${count} ${SET_LABELS[set as CaseSet]}`);
  const lines = [
    '# Evaluación de modelos de IA (B12)',
    '',
    `Corrida del ${input.date} en modo ${input.mode === 'mock' ? 'simulado, con respuestas fijas y sin gasto real' : 'real'}. Casos ${counts.join(', ')}, con ${input.repeat} ${input.repeat === 1 ? 'repetición' : 'repeticiones'}. ${
      input.judge
        ? `Juez ${input.judge.kind === 'simulated' ? 'simulado, sin valor de calidad' : `${input.judge.model} a ciegas y por lote`}.`
        : 'Sin juez.'
    } ${spendText(input.mode, input.spentUsd, input.maxCostUsd)}`,
    '',
  ];
  if (input.mode === 'mock') {
    lines.push(
      'Este reporte es del modo simulado y solo prueba el camino. Falta la corrida real con la clave de evaluaciones, que lo reemplaza con --write (9.2).',
      '',
    );
  }
  if (input.matrix.stoppedByBudget) {
    lines.push(
      'La corrida se detuvo al llegar al tope de costo. Lo que no terminó no puede elegirse.',
      '',
    );
  }
  lines.push('## Resultado por motor', '');
  for (const engine of AI_ENGINES) {
    lines.push(
      ...engineSection(
        engine,
        input,
        input.choices.find((choice) => choice.engine === engine),
      ),
    );
  }
  lines.push('## Configuración elegida', '');
  if (input.mode === 'mock') {
    lines.push(
      'Del modo simulado, solo para ver el formato. Con respuestas fijas todos los candidatos contestan igual, así que esto no se aplica.',
      '',
    );
  }
  lines.push(...chosenConfig(input.choices));
  lines.push('## Costo por alumno al mes', '', ...projectionSection(input.projection));
  lines.push(
    '## Notas',
    '',
    '- Las compuertas se revisan en cada repetición. Esquema al primer intento en 98% o más y 100% después del reintento, anclaje, rechazos y adversarios en 100%, cero negativas, cero cortes por max_tokens y latencia p95 de 20 s en informe y consejos y de 30 s por sección en tarjetas, sin la primera llamada de cada esquema',
    '- El juez califica a ciegas, solo a quien pasó las compuertas. Pasa con media de 3.3 o más y ningún texto con marca crítica. Puede preferir textos de Claude frente a los de otro proveedor (10.8). La palabra final es de los dos médicos en la compuerta 1',
    '- Las hipótesis van por lote en producción, así que en la proyección cuestan la mitad de lo medido aquí',
    '- Si Haiku 5.5 se niega en más de 1% de un motor, ese motor sube a Sonnet 5.5 (10.16). Aquí una sola negativa ya no pasa las compuertas',
    '- Este reporte no lleva texto de casos ni razones del juez. Ese detalle va a private/eval-ai/ con --json',
    '',
  );
  return lines.join('\n');
}

/**
 * Reemplaza una sección de segundo nivel del reporte, o la agrega al final. Así la comparación con
 * OpenAI se escribe sin borrar la elección de modelo
 */
export function replaceSection(document: string, heading: string, body: string): string {
  const title = `## ${heading}`;
  const section = `${title}\n\n${body.trim()}\n`;
  const start = document.indexOf(`${title}\n`);
  if (start === -1) return `${document.trimEnd()}\n\n${section}`;
  const after = document.indexOf('\n## ', start + title.length);
  return `${document.slice(0, start)}${section}${after === -1 ? '' : `\n${document.slice(after + 1)}`}`;
}

export function writeReportSection(file: string, heading: string, body: string): void {
  const current = existsSync(file)
    ? readFileSync(file, 'utf8')
    : '# Evaluación de modelos de IA (B12)\n';
  writeFileSync(file, replaceSection(current, heading, body));
}

// ---------------------------------------------------------------------------------------------
// Secciones que escriben otras corridas

export const OPENAI_SECTION = 'Comparación con OpenAI';
export const BATCH_SECTION = 'Camino por lotes';
export const CURRENT_SECTION = 'Casos con la configuración actual';
const KEPT_SECTIONS = [CURRENT_SECTION, BATCH_SECTION, OPENAI_SECTION] as const;

/** El texto de una sección de segundo nivel, sin su título, o null si no está */
export function sectionOf(document: string, heading: string): string | null {
  const title = `## ${heading}\n`;
  const start = document.indexOf(title);
  if (start === -1) return null;
  const after = document.indexOf('\n## ', start + title.length);
  return document.slice(start + title.length, after === -1 ? undefined : after).trim();
}

/** Escribe la elección de modelo y conserva las secciones de la comparación y del lote */
export function writeMatrixReport(file: string, body: string): void {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : '';
  let document = body;
  for (const heading of KEPT_SECTIONS) {
    const kept = sectionOf(current, heading);
    if (kept !== null) document = replaceSection(document, heading, kept);
  }
  writeFileSync(file, `${document.trimEnd()}\n`);
}

export interface OpenAiSectionInput {
  date: string;
  matrix: MatrixResult;
  judges: ReadonlyMap<string, JudgeSummary>;
  judged: boolean;
  models: readonly OpenAiModel[];
  spentUsd: number;
  maxCostUsd: number;
}

/** La comparación con OpenAI (4.5). Mismos casos, mismas guardas y mismo juez a ciegas */
export function formatOpenAiSection(input: OpenAiSectionInput): string {
  const lines = [
    `Corrida del ${input.date}. ${spendText('real', input.spentUsd, input.maxCostUsd)} Solo viajaron casos de evaluación con texto del banco de demostración o sintético y referencias seudónimas. No cambia nada en producción.`,
    '',
    '| Motor | Modelo | Costo por llamada (USD) | Esquema al 1er intento | Anclaje | Rechazos | Adversarios | Negativas | Cortes | p95 | Juez | Compuertas |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const engine of AI_ENGINES) {
    for (const run of input.matrix.runs.filter((entry) => entry.engine === engine)) {
      const summary = overallSummary(run);
      const gate = gateRun(run);
      const judge = input.judges.get(runKey(engine, run.candidate.name));
      const judgeText = !input.judged
        ? 'sin juez'
        : judge
          ? `${judge.mean.toFixed(2)}${judge.critical > 0 ? `, ${judge.critical} críticos` : ''}`
          : 'no aplica';
      lines.push(
        `| ${engine} | ${run.candidate.id} | ${usd(summary.costPerCallUsd)} | ${percent(summary.schemaValid, summary.cases)} | ${percent(summary.grounded, summary.answerCases)} | ${percent(summary.rejectedRight, summary.rejectionCases)} | ${percent(summary.adversarialRight, summary.adversarialCases)} | ${summary.refusals} | ${summary.cutoffs} | ${seconds(summary.p95LatencyMs)} | ${judgeText} | ${gate.passed ? 'pasa' : gate.failures.join('; ')} |`,
      );
    }
  }
  lines.push(
    '',
    ...input.models.map(
      (model) =>
        `- ${model.id}, gama ${model.tier === 'cheap' ? 'barata' : 'media'}, a ${model.price.input} y ${model.price.output} dólares por millón de tokens de entrada y salida, leídos el ${model.checkedAt} en ${model.source}`,
    ),
    '- El juez es Claude y puede preferir textos de Claude frente a los de OpenAI (10.8). La compuerta humana decide lo que llega a alumnos',
  );
  return lines.join('\n');
}

export interface BatchSectionInput {
  date: string;
  mode: 'real' | 'mock';
  engine: AiEngine;
  model: string;
  result: BatchEvalResult;
}

/** La prueba del camino por lotes (4.7) */
export function formatBatchSection(input: BatchSectionInput): string {
  const summary = summarizeGroup(input.engine, input.result.results);
  const waited = input.result.rounds.reduce((sum, round) => sum + round.waitedMs, 0);
  const failures = Object.entries(input.result.failures)
    .map(([type, count]) => `${count ?? 0} ${type}`)
    .join(', ');
  return [
    `Corrida del ${input.date} en modo ${input.mode === 'mock' ? 'simulado' : 'real'}, ${input.engine} con ${input.model}.`,
    '',
    `- ${input.result.rounds.length} ${input.result.rounds.length === 1 ? 'lote' : 'lotes'} con ${input.result.rounds.reduce((sum, round) => sum + round.requests, 0)} peticiones, ${(waited / 60_000).toFixed(1)} minutos hasta ended${input.result.rounds.some((round) => round.canceled) ? ', con alguno cancelado por pasar de una hora' : ''}`,
    `- Casos ${summary.cases}, esquema al primer intento ${percent(summary.schemaValid, summary.cases)}, anclaje ${percent(summary.grounded, summary.answerCases)}, rechazos ${percent(summary.rejectedRight, summary.rejectionCases)} y negativas ${summary.refusals}`,
    `- Costo al 50% de ${usd(input.result.costUsd)} dólares, ${usd(summary.costPerCallUsd)} por llamada`,
    `- Lotes borrados en Anthropic al terminar ${input.result.rounds.every((round) => round.deleted) ? 'sí' : 'no, revisar'}${failures ? `. Fallas del lote ${failures}` : ''}`,
    '- Cada petición del lote es la misma del camino al momento, capturada del mismo proveedor del núcleo',
  ].join('\n');
}
