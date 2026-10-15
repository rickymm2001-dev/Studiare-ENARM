// Evaluaciones de los motores de IA (8.7 y B12, sección 4 del plan). npm run eval-ai corre los casos
// de server/evals. Por omisión usa las respuestas fijas, sin clave y sin costo, y falla si no cumple
// las metas de 8.7 al 100%. Con --real llama al modelo con ENARM_ANTHROPIC_KEY de server/.env.local o
// del entorno, y se detiene limpio si no está. Nunca imprime una clave, solo si está y de dónde salió.
//
// Uso: node scripts/eval-ai.ts [--mock | --real] [--engine=forgetting,flashcards] [--limit=3]
//      [--max-cost=1] [--write] [--json=private/eval-ai/detalle.json] [--bank-file=private/banco.json]
//      [--concurrency=4]
//   --matrix [--candidates=haiku55-low,sonnet55-low] [--repeat=3] [--judge] [--judge-all]
//   --batch --engine=forgetting [--candidates=haiku55-low]
//   --provider=openai --models=<id>,<id> [--judge]
//   --list-models
// En una sesión en la nube, api.openai.com pasa por el proxy del entorno, así que la comparación se
// corre con NODE_USE_ENV_PROXY=1 y api.openai.com en Allowed domains (4.4).
import { APIError } from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AI_ENGINES, BATCH_ENGINES, type AiEngine } from '../src/engines/aiContracts.ts';
import { DEFAULT_CONFIG, type AiConfig } from '../supabase/functions/_shared/ai/config.ts';
import type { RunDeps } from '../supabase/functions/_shared/ai/run.ts';
import { createAiDeps } from '../server/src/ai/index.ts';
import { ENV_FILE } from '../server/src/config.ts';
import {
  batchApiOf,
  checkModels,
  createEvalClient,
  messagesApiOf,
  modelsApiOf,
} from '../server/evals/anthropic.ts';
import { runBatchEvaluation, simulatedReply } from '../server/evals/batch.ts';
import { loadBankFile, privatePath } from '../server/evals/bankFile.ts';
import { Budget } from '../server/evals/budget.ts';
import {
  ALL_LADDER_CANDIDATES,
  CANDIDATES,
  ENGINE_LADDERS,
  ladderFor,
  modelChoiceOf,
  modelIdsOf,
  parseCandidateNames,
  type Candidate,
  type CandidateName,
} from '../server/evals/candidates.ts';
import { chooseForEngine, overallSummary, type JudgeSummary } from '../server/evals/choice.ts';
import { describeCredentials, loadEvalCredentials } from '../server/evals/credentials.ts';
import { createFakeBatchApi } from '../server/evals/fakeBatch.ts';
import {
  createBatchJudge,
  createSimulatedJudge,
  judgeMatrix,
  type Judge,
  type JudgeMatrixResult,
} from '../server/evals/judge.ts';
import { runMatrix, type MatrixResult } from '../server/evals/matrix.ts';
import { priceOf, resolveOpenAiModels } from '../server/evals/openaiModels.ts';
import { projectCosts } from '../server/evals/projection.ts';
import { createOpenAiProvider } from '../server/evals/providers/openai.ts';
import {
  BATCH_SECTION,
  CURRENT_SECTION,
  formatBatchSection,
  formatMatrixReport,
  formatOpenAiSection,
  OPENAI_SECTION,
  writeMatrixReport,
  writeReportSection,
} from '../server/evals/report.ts';
import { JUDGE_MODEL } from '../server/evals/rubrics.ts';
import {
  checkTargets,
  formatReport,
  runEvaluation,
  summarize,
  type CaseResult,
} from '../server/evals/run.ts';
import {
  anthropicProviderFor,
  checkCandidateParams,
  credentialProblem,
  mockProviderFor,
  parseCli,
} from '../server/evals/runtime.ts';
import { buildSuite, countBySet } from '../server/evals/suite.ts';

const REPORT_FILE = fileURLToPath(new URL('../docs/eval-ai-report.md', import.meta.url));
const KNOWN_FLAGS = [
  'mock',
  'real',
  'engine',
  'limit',
  'max-cost',
  'write',
  'json',
  'bank-file',
  'concurrency',
  'matrix',
  'candidates',
  'repeat',
  'judge',
  'judge-all',
  'batch',
  'provider',
  'models',
  'list-models',
] as const;

const stop = (message: string, code = 2): never => {
  console.error(message);
  process.exit(code);
};

const cli = parseCli(process.argv.slice(2));
const today = new Date().toISOString().slice(0, 10);

const unknownFlags = cli.unknown(KNOWN_FLAGS);
if (unknownFlags.length > 0) stop(`Bandera desconocida ${unknownFlags.join(', ')}.`);
if (cli.flag('real') && cli.flag('mock')) stop('Elige --mock o --real, no los dos.');
const real = cli.flag('real');
const modes = ['matrix', 'batch', 'list-models'].filter((mode) => cli.flag(mode));
if (cli.value('provider') !== undefined) modes.push('provider');
if (modes.length > 1) stop(`Elige un solo modo. Pediste ${modes.join(', ')}.`);
const provider = cli.value('provider');
if (provider !== undefined && provider !== 'openai') stop('El único otro proveedor es openai.');

const engineArg = cli.value('engine');
const engines = engineArg
  ? (engineArg.split(',').map((name) => name.trim()) as AiEngine[])
  : [...AI_ENGINES];
const unknownEngines = engines.filter((engine) => !AI_ENGINES.includes(engine));
if (unknownEngines.length > 0) {
  stop(`Motor desconocido ${unknownEngines.join(', ')}. Los motores son ${AI_ENGINES.join(', ')}.`);
}

const numberOr = (name: string, fallback: number) => {
  try {
    return cli.number(name, fallback);
  } catch (error) {
    return stop((error as Error).message);
  }
};
const maxCost = numberOr('max-cost', real ? 1 : Number.POSITIVE_INFINITY);
const limitValue = cli.value('limit');
const limit = limitValue === undefined ? undefined : numberOr('limit', 1);
const repeat = numberOr('repeat', 1);
const concurrency = numberOr('concurrency', real ? 4 : 1);
let only: CandidateName[] | null = null;
try {
  only =
    cli.value('candidates') === undefined ? null : parseCandidateNames(cli.value('candidates'));
} catch (error) {
  stop((error as Error).message);
}

// El banco real y el detalle viven solo en private/, que nunca entra al repositorio (10.27)
let jsonFile: string | null = null;
let bank = null;
try {
  jsonFile = cli.value('json') === undefined ? null : privatePath(cli.value('json') ?? '');
  const bankFile = cli.value('bank-file');
  bank = bankFile === undefined ? null : loadBankFile(bankFile);
} catch (error) {
  stop((error as Error).message);
}
const cases = buildSuite({ bank });

// ---------------------------------------------------------------------------------------------
// Credenciales, solo con --real. Sin clave se detiene antes de crear cualquier cliente

const credentials = real ? loadEvalCredentials({ envFile: ENV_FILE, env: process.env }) : null;
if (credentials) console.log(describeCredentials(credentials));
if (credentials) {
  const problem = credentialProblem({
    provider: provider === 'openai' ? 'openai' : 'anthropic',
    judge: cli.flag('judge'),
    credentials,
  });
  if (problem) stop(problem);
}
if (provider === 'openai' && !real) stop('La comparación con OpenAI necesita --real.');
const client = credentials?.anthropicKey ? createEvalClient(credentials.anthropicKey) : null;
if (real) {
  console.log(
    `Modo real. Esto llama al modelo y cuesta dinero. Se detiene antes de pasar de ${maxCost} dólares.`,
  );
}

// Sin archivos, para que la evaluación no toque la configuración ni el libro del día del proxy
const ai = createAiDeps({
  credentials: { mode: 'mock', apiKey: null },
  files: { config: null, ledger: null },
});
const baseDeps = (config: AiConfig = ai.config()): RunDeps => ({
  provider: ai.provider,
  prompts: ai.prompts,
  config,
  sourceKeys: ai.sourceKeys,
});
const budget = new Budget(maxCost);
const progress = (line: string) => {
  if (real) console.log(line);
};
const providerFor = client
  ? anthropicProviderFor(messagesApiOf(client), () => ai.config())
  : mockProviderFor();

function writeJson(content: unknown) {
  if (!jsonFile) return;
  mkdirSync(dirname(jsonFile), { recursive: true });
  writeFileSync(jsonFile, `${JSON.stringify(content, null, 2)}\n`);
  console.log(`Detalle guardado en ${jsonFile}, dentro de private/.`);
}

const detailOf = (results: readonly CaseResult[]) =>
  results.map((result) => ({
    id: result.id,
    passed: result.passed,
    error: result.error,
    issues: result.issues,
    output: result.output,
  }));

async function requireModels(candidates: readonly Candidate[], extra: readonly string[] = []) {
  if (!client) return;
  const checks = await checkModels(modelsApiOf(client), [...modelIdsOf(candidates), ...extra]);
  const missing = checks.filter((check) => !check.available).map((check) => check.id);
  if (missing.length > 0) {
    stop(`La cuenta no tiene ${missing.join(', ')}. No se gastó nada en la evaluación.`);
  }
}

async function requireParams(candidates: readonly Candidate[]) {
  if (!client) return;
  const mismatches = await checkCandidateParams(candidates, (api) =>
    anthropicProviderFor(api, () => ai.config())({ calls: [], budgetStopped: false }),
  );
  if (mismatches.length > 0) {
    stop(
      [
        'El proveedor del núcleo no manda lo que piden estos candidatos, así que la matriz mediría otra cosa. Une el paquete A de B12 antes de correrla.',
        ...mismatches.map((mismatch) => `- ${mismatch.candidate}, ${mismatch.problem}`),
      ].join('\n'),
    );
  }
}

function makeJudge(): Judge {
  if (!client) return createSimulatedJudge();
  const price = DEFAULT_CONFIG.prices[JUDGE_MODEL];
  if (!price) return stop(`Falta el precio de ${JUDGE_MODEL} en DEFAULT_CONFIG.`);
  return createBatchJudge({
    api: batchApiOf(client),
    budget,
    price,
    onProgress: progress,
  });
}

const inputsById = new Map(cases.map((golden) => [golden.id, golden.input as unknown]));

// ---------------------------------------------------------------------------------------------
// --list-models

async function listModels() {
  const candidates = ALL_LADDER_CANDIDATES;
  if (!client) {
    console.log('Candidatos (4.1). Con --real se revisa cada modelo en la Models API.');
    for (const candidate of candidates) console.log(`- ${candidate.name}, ${candidate.note}`);
    for (const engine of AI_ENGINES) console.log(`${engine}: ${ENGINE_LADDERS[engine].join(', ')}`);
    return;
  }
  const checks = await checkModels(modelsApiOf(client), [...modelIdsOf(candidates), JUDGE_MODEL]);
  for (const check of checks) {
    console.log(
      `- ${check.id} ${check.available ? `disponible (${check.displayName ?? ''})` : 'NO disponible'}`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// --matrix

async function matrix() {
  const ladder = engines.flatMap((engine) => ladderFor(engine, only));
  const distinct = [...new Map(ladder.map((candidate) => [candidate.name, candidate])).values()];
  await requireParams(distinct);
  await requireModels(distinct, cli.flag('judge') ? [JUDGE_MODEL] : []);
  const result = await runMatrix(
    { deps: baseDeps(), cases, budget, providerFor, onProgress: progress },
    {
      engines,
      only,
      repeat,
      concurrency,
      ...(limit !== undefined ? { limitPerEngine: limit } : {}),
    },
  );
  let judged: JudgeMatrixResult | null = null;
  if (cli.flag('judge')) {
    judged = await judgeMatrix(result.runs, makeJudge(), {
      inputs: inputsById,
      all: cli.flag('judge-all'),
      onProgress: progress,
    });
  }
  const judges = judged?.summaries ?? new Map<string, JudgeSummary>();
  const choices = engines.map((engine) =>
    chooseForEngine(engine, result.runs, judges, { judged: judged !== null }),
  );
  const costPerCall: Partial<Record<AiEngine, number>> = {};
  for (const choice of choices) {
    const chosen = choice.ranked.find((item) => item.candidate.name === choice.chosen?.name);
    if (chosen) costPerCall[choice.engine] = chosen.costPerCallUsd;
  }
  const report = formatMatrixReport({
    mode: real ? 'real' : 'mock',
    date: today,
    repeat,
    matrix: result,
    choices,
    judge: judged
      ? { kind: client ? 'real' : 'simulated', model: client ? JUDGE_MODEL : 'juez-simulado' }
      : null,
    projection: projectCosts(costPerCall, DEFAULT_CONFIG.limits),
    spentUsd: budget.spentUsd,
    maxCostUsd: maxCost,
    caseCounts: countBySet(cases.filter((golden) => engines.includes(golden.engine))),
  });
  console.log(report);
  if (cli.flag('write')) {
    writeMatrixReport(REPORT_FILE, report);
    console.log('\nReporte guardado en docs/eval-ai-report.md');
  }
  writeJson({
    date: today,
    mode: real ? 'real' : 'mock',
    runs: result.runs.map((run) => ({
      engine: run.engine,
      candidate: run.candidate.name,
      repeats: run.repeats.map(detailOf),
    })),
    judge: judged?.details ?? null,
  });
}

// ---------------------------------------------------------------------------------------------
// --batch

async function batch() {
  const engine = engines.length === 1 ? engines[0] : undefined;
  if (!engine || !(BATCH_ENGINES as readonly string[]).includes(engine)) {
    stop(`--batch va con un solo motor de lote, ${BATCH_ENGINES.join(' o ')}, con --engine.`);
    return;
  }
  const picked = only?.[0];
  const candidate = picked ? CANDIDATES[picked] : null;
  const config: AiConfig = candidate
    ? {
        ...ai.config(),
        models: { ...ai.config().models, [engine]: modelChoiceOf(candidate, engine) },
      }
    : ai.config();
  if (candidate) {
    await requireParams([candidate]);
    await requireModels([candidate]);
  }
  const api = client
    ? batchApiOf(client)
    : createFakeBatchApi({ respond: simulatedReply(engine), pollsUntilEnded: 2 });
  const selected = cases.filter((golden) => golden.engine === engine).slice(0, limit ?? 10);
  const result = await runBatchEvaluation({
    deps: baseDeps(config),
    cases: selected,
    api,
    budget,
    onProgress: (line) => {
      console.log(line);
    },
    ...(client ? {} : { sleep: () => Promise.resolve() }),
  });
  const section = formatBatchSection({
    date: today,
    mode: real ? 'real' : 'mock',
    engine,
    model: config.models[engine].id,
    result,
  });
  console.log(section);
  if (cli.flag('write')) {
    writeReportSection(REPORT_FILE, BATCH_SECTION, section);
    console.log('\nSección guardada en docs/eval-ai-report.md');
  }
  writeJson({
    date: today,
    mode: real ? 'real' : 'mock',
    engine,
    results: detailOf(result.results),
  });
}

// ---------------------------------------------------------------------------------------------
// --provider=openai

async function openai() {
  const ids = (cli.value('models') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  let models;
  try {
    models = resolveOpenAiModels(ids);
  } catch (error) {
    return stop((error as Error).message);
  }
  if (cli.flag('judge')) await requireModels([], [JUDGE_MODEL]);
  const apiKey = credentials?.openaiKey ?? stop('Falta ENARM_OPENAI_KEY.');
  const config: AiConfig = {
    ...ai.config(),
    prices: {
      ...ai.config().prices,
      ...Object.fromEntries(models.map((model) => [model.id, priceOf(model)])),
    },
  };
  const explicit: Candidate[] = models.map((model) => ({
    name: `openai:${model.id}`,
    id: model.id,
    effort: null,
    thinking: null,
    onlyIfNonePass: false,
    note: `OpenAI ${model.tier === 'cheap' ? 'barato' : 'de gama media'}`,
  }));
  const result: MatrixResult = await runMatrix(
    {
      deps: baseDeps(config),
      cases,
      budget,
      providerFor: (probe) => createOpenAiProvider({ apiKey, models, timeoutMs: 120_000, probe }),
      onProgress: progress,
    },
    {
      engines,
      only: null,
      explicit,
      repeat,
      concurrency,
      ...(limit !== undefined ? { limitPerEngine: limit } : {}),
    },
  );
  const judged = cli.flag('judge')
    ? await judgeMatrix(result.runs, makeJudge(), {
        inputs: inputsById,
        all: true,
        onProgress: progress,
      })
    : null;
  const section = formatOpenAiSection({
    date: today,
    matrix: result,
    judges: judged?.summaries ?? new Map(),
    judged: judged !== null,
    models,
    spentUsd: budget.spentUsd,
    maxCostUsd: maxCost,
  });
  console.log(section);
  if (cli.flag('write')) {
    writeReportSection(REPORT_FILE, OPENAI_SECTION, section);
    console.log('\nSección guardada en docs/eval-ai-report.md');
  }
  writeJson({
    date: today,
    runs: result.runs.map((run) => ({
      engine: run.engine,
      model: run.candidate.id,
      repeats: run.repeats.map(detailOf),
    })),
    judge: judged?.details ?? null,
    costs: result.runs.map((run) => ({
      engine: run.engine,
      model: run.candidate.id,
      costPerCall: overallSummary(run).costPerCallUsd,
    })),
  });
}

// ---------------------------------------------------------------------------------------------
// Sin modo, los casos con la configuración actual

async function current() {
  const { results, stoppedByBudget } = await runEvaluation(baseDeps(), {
    cases,
    engines,
    budget,
    providerFor,
    concurrency,
    ...(limit !== undefined ? { limitPerEngine: limit } : {}),
  });
  const summary = summarize(results);
  const report = formatReport(summary, results, { mode: real ? 'real' : 'mock', stoppedByBudget });
  console.log(report);
  if (cli.flag('write')) {
    writeReportSection(REPORT_FILE, CURRENT_SECTION, `Corrida del ${today}.\n\n${report}`);
    console.log('\nSección guardada en docs/eval-ai-report.md');
  }
  writeJson({ date: today, mode: real ? 'real' : 'mock', results: detailOf(results) });
  // Con las respuestas fijas las metas son obligatorias. Con el modelo real se reportan sin fallar
  const total = summary.find((item) => item.engine === 'total');
  if (!real && (!total || !checkTargets(total).met)) process.exit(1);
}

try {
  if (cli.flag('list-models')) await listModels();
  else if (cli.flag('matrix')) await matrix();
  else if (cli.flag('batch')) await batch();
  else if (provider === 'openai') await openai();
  else await current();
} catch (error) {
  // Mensajes propios, nunca el cuerpo de una respuesta de la API ni una clave
  stop(
    error instanceof APIError
      ? `La API de Anthropic respondió ${String(error.status)}. No se muestra su texto.`
      : error instanceof Error
        ? error.message
        : 'La evaluación falló.',
    1,
  );
}
if (real) console.log(`Gasto total ${budget.spentUsd} dólares.`);
