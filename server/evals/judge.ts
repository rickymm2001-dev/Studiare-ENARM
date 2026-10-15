// Juez de npm run eval-ai --judge (B12, 4.3 y 10.8 del plan). Claude Opus 5.5 con esfuerzo alto,
// por lote para costar la mitad, a ciegas y con salida estructurada. Solo califica a los candidatos
// que pasaron las compuertas automáticas y por motor va del más barato al más caro. Si el más barato
// pasa, los más caros ya no se califican, porque la regla elige al más barato que pase todo. El juez
// simulado sirve sin clave para las pruebas y para revisar el camino, y nunca dice nada de calidad.
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages';
import { AI_ENGINES, type AiEngine } from '../../src/engines/aiContracts.ts';
import { sentenceCount } from '../../src/engines/aiGuards.ts';
import { unsupportedFacts, wordsOf } from '../../src/engines/grounding.ts';
import type { ModelPrice } from '../../supabase/functions/_shared/ai/config.ts';
import { estimateCostUsd } from '../../supabase/functions/_shared/ai/cost.ts';
import type { BatchApi, BatchRequest } from '../../supabase/functions/_shared/ai/ports.ts';
import { seededRandom, shuffled } from './bankCases.ts';
import { BATCH_DISCOUNT, worstCaseUsd, type Budget } from './budget.ts';
import {
  COST_TIE_RATIO,
  gateRun,
  JUDGE_MIN_MEAN,
  overallSummary,
  runKey,
  type CandidateRun,
  type JudgeSummary,
} from './choice.ts';
import {
  criteriaOf,
  JUDGE_EFFORT,
  JUDGE_MAX_TOKENS,
  JUDGE_MODEL,
  judgeMessage,
  rubricPrompt,
  verdictSchema,
  type Criterion,
} from './rubrics.ts';

/** Un texto para el juez. El id es ciego y no dice de qué candidato salió */
export interface JudgeItem {
  id: string;
  engine: AiEngine;
  input: unknown;
  output: unknown;
}

export interface JudgeVerdict {
  id: string;
  scores: Partial<Record<Criterion, number>>;
  critical: boolean;
  reason: string;
}

export interface JudgeOutcome {
  verdicts: JudgeVerdict[];
  /** Los ids que no se pudieron calificar */
  unjudged: string[];
  costUsd: number;
  stoppedByBudget: boolean;
}

export interface Judge {
  readonly kind: 'real' | 'simulated';
  readonly model: string;
  judge(items: readonly JudgeItem[]): Promise<JudgeOutcome>;
}

// ---------------------------------------------------------------------------------------------
// Juez real por lote

/** custom_id del lote, de 1 a 64 caracteres con letras, números, guion y guion bajo */
const CUSTOM_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function buildJudgeRequest(item: JudgeItem): BatchRequest {
  if (!CUSTOM_ID.test(item.id)) throw new Error(`El id ${item.id} no sirve como custom_id`);
  return {
    custom_id: item.id,
    params: {
      model: JUDGE_MODEL,
      max_tokens: JUDGE_MAX_TOKENS,
      system: [
        { type: 'text', text: rubricPrompt(item.engine), cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: judgeMessage(item.input, item.output) }],
      output_config: {
        format: zodOutputFormat(verdictSchema(item.engine)),
        effort: JUDGE_EFFORT,
      },
    },
  };
}

export interface BatchJudgeOptions {
  api: BatchApi;
  budget: Budget;
  price: ModelPrice;
  /** Cada cuánto se revisa el lote. 60 s por omisión */
  pollMs?: number;
  /** Cuánto se espera antes de cancelar. Una hora por omisión */
  maxWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
  clock?: () => number;
  onProgress?: (line: string) => void;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Lee una calificación de un resultado del lote. null si no sirve */
function readVerdict(
  item: JudgeItem,
  response: MessageBatchIndividualResponse,
  price: ModelPrice,
): { verdict: JudgeVerdict | null; costUsd: number } {
  if (response.result.type !== 'succeeded') return { verdict: null, costUsd: 0 };
  const message = response.result.message;
  const costUsd =
    estimateCostUsd(price, {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    }) * BATCH_DISCOUNT;
  if (message.stop_reason !== 'end_turn') return { verdict: null, costUsd };
  const text = message.content.find((block) => block.type === 'text')?.text;
  if (text === undefined) return { verdict: null, costUsd };
  try {
    const parsed = verdictSchema(item.engine).safeParse(JSON.parse(text));
    if (!parsed.success) return { verdict: null, costUsd };
    return {
      verdict: {
        id: item.id,
        scores: parsed.data.scores,
        critical: parsed.data.critical,
        reason: parsed.data.reason,
      },
      costUsd,
    };
  } catch {
    return { verdict: null, costUsd };
  }
}

export function createBatchJudge(options: BatchJudgeOptions): Judge {
  const sleep = options.sleep ?? defaultSleep;
  const clock = options.clock ?? (() => Date.now());
  const pollMs = options.pollMs ?? 60_000;
  const maxWaitMs = options.maxWaitMs ?? 3_600_000;
  return {
    kind: 'real',
    model: JUDGE_MODEL,
    async judge(items) {
      // Solo sale lo que cabe en el tope, con el peor costo de cada calificación al precio de lote
      const sent: JudgeItem[] = [];
      let reserved = 0;
      for (const item of items) {
        const chars =
          rubricPrompt(item.engine).length + judgeMessage(item.input, item.output).length;
        const worst = worstCaseUsd(options.price, chars, JUDGE_MAX_TOKENS, true);
        if (!options.budget.reserve(worst)) break;
        reserved += worst;
        sent.push(item);
      }
      const stoppedByBudget = sent.length < items.length;
      const skipped = items.slice(sent.length).map((item) => item.id);
      if (sent.length === 0) {
        return { verdicts: [], unjudged: skipped, costUsd: 0, stoppedByBudget };
      }
      let costUsd = 0;
      const verdicts: JudgeVerdict[] = [];
      try {
        const batch = await options.api.create(sent.map(buildJudgeRequest));
        options.onProgress?.(`Juez, lote de ${sent.length} textos creado`);
        const started = clock();
        let current = batch;
        let canceled = false;
        while (current.processing_status !== 'ended') {
          if (!canceled && clock() - started > maxWaitMs) {
            current = await options.api.cancel(batch.id);
            canceled = true;
            options.onProgress?.('Juez, el lote pasó del tiempo y se canceló');
            continue;
          }
          await sleep(pollMs);
          current = await options.api.retrieve(batch.id);
        }
        const byId = new Map(sent.map((item) => [item.id, item]));
        for await (const response of await options.api.results(batch.id)) {
          const item = byId.get(response.custom_id);
          if (!item) continue;
          const read = readVerdict(item, response, options.price);
          costUsd += read.costUsd;
          if (read.verdict) verdicts.push(read.verdict);
        }
        // Nada de texto queda en Anthropic más de lo necesario (10.17)
        await options.api.delete(batch.id).catch(() => undefined);
      } finally {
        options.budget.settle(reserved, costUsd);
      }
      const judged = new Set(verdicts.map((verdict) => verdict.id));
      return {
        verdicts,
        unjudged: [
          ...sent.filter((item) => !judged.has(item.id)).map((item) => item.id),
          ...skipped,
        ],
        costUsd: Math.round(costUsd * 1e6) / 1e6,
        stoppedByBudget,
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Juez simulado

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** El texto que lee el alumno o el médico en una salida */
function readableText(engine: AiEngine, output: unknown): string {
  const value = output as Record<string, unknown>;
  switch (engine) {
    case 'forgetting':
      return [value.hypothesis, value.studentMessage].filter(Boolean).join(' ');
    case 'weekly_report':
      return [
        value.summary,
        ...((value.priorities as { text: string }[] | undefined) ?? []).map((line) => line.text),
        value.habit,
        value.challenge,
      ]
        .filter(Boolean)
        .join(' ');
    case 'bias_tips':
      return str(value.tip);
    case 'flashcards':
      return ((value.cards as { front: string; back: string }[] | undefined) ?? [])
        .map((card) => `${card.front} ${card.back}`)
        .join(' ');
    case 'restructure':
      return [value.stem, value.explanation].filter(Boolean).join(' ');
    default:
      return JSON.stringify(output);
  }
}

function formatScore(engine: AiEngine, output: unknown): number {
  const value = output as Record<string, unknown>;
  switch (engine) {
    case 'forgetting': {
      const hypothesis = typeof value.hypothesis === 'string' ? value.hypothesis : '';
      const message = typeof value.studentMessage === 'string' ? value.studentMessage : '';
      const sentences = sentenceCount(message);
      return sentenceCount(hypothesis) === 1 && sentences >= 2 && sentences <= 3 ? 4 : 2;
    }
    case 'weekly_report': {
      const sentences = sentenceCount(str(value.summary));
      return sentences >= 1 && sentences <= 2 ? 4 : 2;
    }
    case 'bias_tips': {
      const sentences = sentenceCount(str(value.tip));
      return sentences >= 2 && sentences <= 4 ? 4 : 2;
    }
    case 'flashcards':
      return ((value.cards as { front: string }[] | undefined) ?? []).every(
        (card) => card.front.length <= 220,
      )
        ? 4
        : 2;
    default:
      return 4;
  }
}

/**
 * Calificación simulada con reglas que se pueden revisar. Una cifra o un fármaco que la fuente no
 * trae es marca crítica. Un texto de menos de 6 palabras es poco útil y uno fuera del formato pedido
 * baja el formato. No mide calidad médica y el reporte lo dice
 */
export function simulatedVerdict(item: JudgeItem): Omit<JudgeVerdict, 'id'> {
  const text = readableText(item.engine, item.output);
  const missing = unsupportedFacts(text, JSON.stringify(item.input));
  const critical = missing.numbers.length > 0 || missing.drugs.length > 0;
  const words = wordsOf(text).length;
  const scores: Partial<Record<Criterion, number>> = {
    accuracy: critical ? 1 : 4,
    usefulness: words >= 12 ? 4 : words >= 6 ? 3 : 2,
    clarity: 4,
    format: formatScore(item.engine, item.output),
  };
  if (item.engine === 'restructure') {
    const options = (item.output as { options?: unknown[] }).options ?? [];
    scores.distractors = options.length >= 4 ? 4 : 3;
    scores.transform = 4;
  }
  return {
    scores,
    critical,
    reason: critical ? 'Trae una cifra o un fármaco que la fuente no tiene' : 'Simulado',
  };
}

export function createSimulatedJudge(
  score: (item: JudgeItem) => Omit<JudgeVerdict, 'id'> = simulatedVerdict,
): Judge {
  return {
    kind: 'simulated',
    model: 'juez-simulado',
    judge(items) {
      return Promise.resolve({
        verdicts: items.map((item) => ({ id: item.id, ...score(item) })),
        unjudged: [],
        costUsd: 0,
        stoppedByBudget: false,
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Qué se califica y en qué orden

/**
 * Los textos de un candidato para el juez. Solo las respuestas aceptadas con contenido de la primera
 * repetición, que bastan para la calidad. Las compuertas ya revisaron las tres repeticiones
 */
export function judgeItemsOf(
  run: CandidateRun,
  inputs: ReadonlyMap<string, unknown>,
  repeats = 1,
): Omit<JudgeItem, 'id'>[] {
  return run.repeats
    .slice(0, repeats)
    .flat()
    .filter((result) => result.accepted && !result.empty && result.output !== null)
    .map((result) => ({
      engine: run.engine,
      input: inputs.get(result.id) ?? null,
      output: result.output,
    }));
}

export function summarizeVerdicts(
  engine: AiEngine,
  verdicts: readonly JudgeVerdict[],
  unjudged: number,
): JudgeSummary {
  const criteria: Record<string, number> = {};
  for (const criterion of criteriaOf(engine)) {
    const values = verdicts.flatMap((verdict) => {
      const value = verdict.scores[criterion];
      return value === undefined ? [] : [value];
    });
    criteria[criterion] = values.length
      ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100) / 100
      : 0;
  }
  const all = verdicts.flatMap((verdict) => Object.values(verdict.scores));
  const mean = all.length ? all.reduce((sum, value) => sum + value, 0) / all.length : 0;
  const critical = verdicts.filter((verdict) => verdict.critical).length;
  return {
    judged: verdicts.length,
    unjudged,
    mean: Math.round(mean * 100) / 100,
    criteria,
    critical,
    // Un texto sin calificar no deja pasar, porque podría esconder una marca crítica
    passed: verdicts.length > 0 && unjudged === 0 && mean >= JUDGE_MIN_MEAN && critical === 0,
  };
}

export interface JudgeMatrixOptions {
  /** La entrada de cada caso por su id, que el juez ve como fuente */
  inputs: ReadonlyMap<string, unknown>;
  /** Califica a todos los que pasaron las compuertas, no solo hasta el primero que pase */
  all?: boolean;
  repeats?: number;
  seed?: number;
  onProgress?: (line: string) => void;
}

export interface JudgeMatrixResult {
  summaries: Map<string, JudgeSummary>;
  /** Detalle por texto, para private/. Nunca va al reporte */
  details: { key: string; caseIndex: number; verdict: JudgeVerdict | null }[];
  costUsd: number;
  stoppedByBudget: boolean;
}

/**
 * Califica la matriz por rondas. En cada ronda entra, por motor, el candidato más barato que falta,
 * con los que empatan con él en costo. Un motor queda resuelto cuando uno de los suyos pasa. Todos
 * los textos de una ronda van en un solo lote, revueltos y con ids ciegos
 */
export async function judgeMatrix(
  runs: readonly CandidateRun[],
  judge: Judge,
  options: JudgeMatrixOptions,
): Promise<JudgeMatrixResult> {
  const random = seededRandom(options.seed ?? 20261015);
  const queues = new Map<AiEngine, CandidateRun[]>();
  for (const engine of AI_ENGINES) {
    const passing = runs
      .filter((run) => run.engine === engine && gateRun(run).passed)
      .sort((a, b) => overallSummary(a).costPerCallUsd - overallSummary(b).costPerCallUsd);
    if (passing.length > 0) queues.set(engine, passing);
  }
  const summaries = new Map<string, JudgeSummary>();
  const details: JudgeMatrixResult['details'] = [];
  let costUsd = 0;
  let stoppedByBudget = false;
  let round = 0;
  while (queues.size > 0 && !stoppedByBudget) {
    round += 1;
    const batchRuns: CandidateRun[] = [];
    for (const [engine, queue] of queues) {
      const first = queue[0];
      if (!first) {
        queues.delete(engine);
        continue;
      }
      const limit = overallSummary(first).costPerCallUsd * (1 + COST_TIE_RATIO);
      const group = options.all
        ? queue
        : queue.filter((run) => overallSummary(run).costPerCallUsd <= limit);
      batchRuns.push(...group);
      queues.set(
        engine,
        queue.filter((run) => !group.includes(run)),
      );
    }
    if (batchRuns.length === 0) break;
    const entries = batchRuns.flatMap((run) =>
      judgeItemsOf(run, options.inputs, options.repeats ?? 1).map((item, caseIndex) => ({
        run,
        caseIndex,
        item,
      })),
    );
    const blind = shuffled(entries, random).map((entry, index) => ({
      ...entry,
      id: `j${round}_${String(index).padStart(4, '0')}`,
    }));
    options.onProgress?.(`Juez, ronda ${round} con ${blind.length} textos`);
    const outcome = await judge.judge(blind.map((entry) => ({ ...entry.item, id: entry.id })));
    costUsd += outcome.costUsd;
    stoppedByBudget = outcome.stoppedByBudget;
    const byId = new Map(outcome.verdicts.map((verdict) => [verdict.id, verdict]));
    for (const run of batchRuns) {
      const mine = blind.filter((entry) => entry.run === run);
      const verdicts = mine.flatMap((entry) => {
        const verdict = byId.get(entry.id);
        return verdict ? [verdict] : [];
      });
      const key = runKey(run.engine, run.candidate.name);
      summaries.set(key, summarizeVerdicts(run.engine, verdicts, mine.length - verdicts.length));
      for (const entry of mine) {
        details.push({ key, caseIndex: entry.caseIndex, verdict: byId.get(entry.id) ?? null });
      }
    }
    if (!options.all) {
      for (const engine of [...queues.keys()]) {
        const solved = batchRuns.some(
          (run) =>
            run.engine === engine &&
            summaries.get(runKey(run.engine, run.candidate.name))?.passed === true,
        );
        if (solved) queues.delete(engine);
      }
    }
    if (options.all) break;
  }
  return { summaries, details, costUsd: Math.round(costUsd * 1e6) / 1e6, stoppedByBudget };
}
