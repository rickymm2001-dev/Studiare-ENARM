// Muestra de la compuerta 1 (B12, 5.1 del plan). Arma los 300 textos que auditan los dos médicos y
// los guarda en private/ai-gate/<id>.json con la forma de AiGateSampleFileSchema
// (src/engines/aiContracts.ts), que importa el admin en la pantalla de auditoría. private/ nunca entra
// al repositorio.
//
// Se genera con el modelo, el esfuerzo y el prompt de DEFAULT_CONFIG, así que antes se aplica ahí lo
// que eligió npm run eval-ai (contrato C4). Sin --real usa las respuestas fijas, sin clave ni costo,
// y la muestra queda marcada como simulada en su id y en su modelo. Con --real usa
// ENARM_ANTHROPIC_KEY de server/.env.local o del entorno, se detiene limpio sin ella y nunca la
// imprime.
//
// Uso: npm run ai:gate-sample -- [--real] [--max-cost=1] [--id=b12-2026-10]
//      [--bank-file=private/banco.json] [--team-file=private/textos-equipo.json] [--concurrency=4]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createAiDeps } from '../../server/src/ai/index.ts';
import { ENV_FILE } from '../../server/src/config.ts';
import {
  checkModels,
  createEvalClient,
  messagesApiOf,
  modelsApiOf,
} from '../../server/evals/anthropic.ts';
import { loadDemoBank, type BankSource } from '../../server/evals/bankCases.ts';
import { loadBankFile, privatePath } from '../../server/evals/bankFile.ts';
import { Budget } from '../../server/evals/budget.ts';
import type { Candidate } from '../../server/evals/candidates.ts';
import { describeCredentials, loadEvalCredentials } from '../../server/evals/credentials.ts';
import {
  buildGateSample,
  GATE_COUNTS,
  loadTeamFile,
  planGateInputs,
  REAL_BANK_MIN,
  type TeamText,
} from '../../server/evals/gateSample.ts';
import {
  anthropicProviderFor,
  checkCandidateParams,
  credentialProblem,
  mockProviderFor,
  parseCli,
} from '../../server/evals/runtime.ts';
import { AI_ENGINES, GateSampleIdSchema } from '../../src/engines/aiContracts.ts';

const KNOWN = ['real', 'max-cost', 'id', 'bank-file', 'team-file', 'concurrency'] as const;
const stop = (message: string, code = 2): never => {
  console.error(message);
  process.exit(code);
};

const cli = parseCli(process.argv.slice(2));
const unknown = cli.unknown(KNOWN);
if (unknown.length > 0) stop(`Bandera desconocida ${unknown.join(', ')}.`);
const real = cli.flag('real');
const now = new Date();
const month = now.toISOString().slice(0, 7);

let maxCost = 1;
let concurrency = real ? 4 : 1;
let source: BankSource = loadDemoBank();
let team: TeamText[] = [];
let file = '';
let id = '';
try {
  maxCost = cli.number('max-cost', real ? 1 : Number.POSITIVE_INFINITY);
  concurrency = cli.number('concurrency', concurrency);
  id = cli.value('id') ?? (real ? `b12-${month}` : `sim-b12-${now.toISOString().slice(0, 10)}`);
  if (!GateSampleIdSchema.safeParse(id).success) {
    stop('--id va en minúsculas con números, guion o guion bajo, de 4 a 64 caracteres.');
  }
  file = privatePath(`private/ai-gate/${id}.json`);
  const bankFile = cli.value('bank-file');
  const bank = bankFile === undefined ? null : loadBankFile(bankFile);
  // Con el banco real solo si ya hay 100 preguntas aprobadas o más (10.9)
  if (bank && bank.questions.length >= REAL_BANK_MIN) {
    source = bank;
  } else if (bank) {
    console.log(
      `El banco real tiene ${bank.questions.length} preguntas aprobadas y hacen falta ${REAL_BANK_MIN}. La muestra sale del banco de demostración, marcada así, y antes del lanzamiento se repite una auditoría corta con el real (10.9).`,
    );
  }
  const teamFile = cli.value('team-file');
  team = teamFile === undefined ? [] : loadTeamFile(teamFile);
} catch (error) {
  stop((error as Error).message);
}
if (team.length === 0) {
  console.log(
    'Sin --team-file. Las tarjetas desde texto del alumno usan solo explicaciones del banco. Faltan los 10 textos que escribe el equipo (5.1).',
  );
}

// Credenciales, solo con --real. Sin clave se detiene antes de crear cualquier cliente
const credentials = real ? loadEvalCredentials({ envFile: ENV_FILE, env: process.env }) : null;
if (credentials) {
  console.log(describeCredentials(credentials));
  const problem = credentialProblem({ provider: 'anthropic', judge: false, credentials });
  if (problem) stop(problem);
}
const client = credentials?.anthropicKey ? createEvalClient(credentials.anthropicKey) : null;

const ai = createAiDeps({
  credentials: { mode: 'mock', apiKey: null },
  files: { config: null, ledger: null },
});
const config = ai.config();
const providerFor = client
  ? anthropicProviderFor(messagesApiOf(client), () => config)
  : mockProviderFor();

try {
  if (client) {
    const configured: Candidate[] = AI_ENGINES.map((engine) => ({
      name: engine,
      id: config.models[engine].id,
      effort: config.models[engine].effort,
      thinking: config.models[engine].thinking,
      onlyIfNonePass: false,
      note: '',
    }));
    const mismatches = await checkCandidateParams(configured, (api) =>
      anthropicProviderFor(api, () => config)({ calls: [], budgetStopped: false }),
    );
    if (mismatches.length > 0) {
      stop(
        [
          'El proveedor del núcleo no manda lo que pide la configuración. Une el paquete A de B12 antes de generar la muestra.',
          ...mismatches.map((mismatch) => `- ${mismatch.candidate}, ${mismatch.problem}`),
        ].join('\n'),
      );
    }
    const checks = await checkModels(modelsApiOf(client), [
      ...new Set(configured.map((candidate) => candidate.id)),
    ]);
    const missing = checks.filter((check) => !check.available).map((check) => check.id);
    if (missing.length > 0) stop(`La cuenta no tiene ${missing.join(', ')}. No se gastó nada.`);
    console.log(`Modo real. Se detiene antes de pasar de ${maxCost} dólares.`);
  }

  const budget = new Budget(maxCost);
  const result = await buildGateSample({
    deps: { provider: ai.provider, prompts: ai.prompts, config, sourceKeys: ai.sourceKeys },
    providerFor,
    budget,
    mode: real ? 'real' : 'mock',
    inputs: planGateInputs(source, team),
    id,
    createdAt: now.toISOString(),
    concurrency,
    onProgress: (line) => {
      console.log(line);
    },
  });
  if (!result.file) {
    const missing = Object.entries(result.shortfall)
      .map(([engine, count]) => `${engine} ${count}`)
      .join(', ');
    stop(
      `No se juntaron los ${Object.values(GATE_COUNTS).reduce((sum, count) => sum + count, 0)} textos${result.stoppedByBudget ? ' porque se llegó al tope de costo' : ''}. Faltan ${missing}. No se guardó ninguna muestra.`,
      1,
    );
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(result.file, null, 2)}\n`);
  const counts = AI_ENGINES.map(
    (engine) =>
      `${engine} ${result.file?.items.filter((item) => item.engine === engine).length ?? 0}`,
  ).join(', ');
  console.log(
    `Muestra ${id} ${real ? '' : 'SIMULADA, con respuestas fijas, '}guardada en ${file}. ${counts}. Fuente ${source.set === 'bank' ? 'banco real aprobado' : 'banco de demostración'}. ${real ? `Gasto ${budget.spentUsd} dólares.` : 'Sin gasto real.'}`,
  );
} catch (error) {
  stop(error instanceof Error ? error.message : 'La muestra falló.', 1);
}
