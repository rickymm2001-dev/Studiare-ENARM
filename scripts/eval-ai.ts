// Evaluaciones de los motores de IA (8.7). npm run eval-ai corre los casos dorados de server/evals.
// Por omisión usa las respuestas fijas, sin clave y sin costo. Con --real usa el modelo con la clave
// de server/.env.local y reporta números reales de costo y latencia.
// Uso: node scripts/eval-ai.ts [--mock | --real] [--engine=forgetting,flashcards] [--limit=3]
//      [--max-cost=1] [--write]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AI_ENGINES, type AiEngine } from '../src/engines/aiContracts.ts';
import { createAiDeps } from '../server/src/ai/index.ts';
import { ENV_FILE } from '../server/src/config.ts';
import { loadAiCredentials } from '../server/src/env.ts';
import { checkTargets, formatReport, runEvaluation, summarize } from '../server/evals/run.ts';

const REPORT_FILE = fileURLToPath(new URL('../docs/eval-ai-report.md', import.meta.url));
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

if (flag('real') && flag('mock')) {
  console.error('Elige --mock o --real, no los dos.');
  process.exit(2);
}

const engineArg = value('engine');
const engines = engineArg
  ? (engineArg.split(',').map((name) => name.trim()) as AiEngine[])
  : undefined;
const unknown = engines?.filter((engine) => !AI_ENGINES.includes(engine));
if (unknown && unknown.length > 0) {
  console.error(
    `Motor desconocido ${unknown.join(', ')}. Los motores son ${AI_ENGINES.join(', ')}.`,
  );
  process.exit(2);
}

const credentials = loadAiCredentials({ envFile: ENV_FILE, forceMock: !flag('real') });
if (flag('real') && credentials.mode !== 'real') {
  console.error(
    'No hay clave en server/.env.local. Corre con --mock o agrega ENARM_ANTHROPIC_KEY ahí.',
  );
  process.exit(2);
}

const maxCost = Number(value('max-cost') ?? (flag('real') ? '1' : 'Infinity'));
const limit = value('limit') === undefined ? undefined : Number(value('limit'));
if (flag('real')) {
  console.log(
    `Modo real. Esto llama al modelo y cuesta dinero. Se detiene al pasar de ${maxCost} dólares.`,
  );
}

// Sin archivos, para que la evaluación no toque la configuración ni el libro del día del proxy
const ai = createAiDeps({ credentials, files: { config: null, ledger: null } });
const { results, stoppedByBudget } = await runEvaluation(
  {
    provider: ai.provider,
    prompts: ai.prompts,
    config: ai.config(),
    sourceKeys: ai.sourceKeys,
  },
  {
    ...(engines ? { engines } : {}),
    ...(limit !== undefined ? { limitPerEngine: limit } : {}),
    maxCostUsd: maxCost,
  },
);

const summary = summarize(results);
const report = formatReport(summary, results, { mode: ai.provider.mode, stoppedByBudget });
console.log(report);

if (flag('write')) {
  writeFileSync(REPORT_FILE, `${report}\n`);
  console.log(`\nReporte guardado en docs/eval-ai-report.md`);
}

// Con las respuestas fijas las metas son obligatorias. Con el modelo real se reportan sin fallar
const total = summary.find((item) => item.engine === 'total');
if (ai.provider.mode === 'mock' && (!total || !checkTargets(total).met)) process.exit(1);
