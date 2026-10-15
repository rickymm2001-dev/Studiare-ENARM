// Matriz de modelos de npm run eval-ai --matrix (B12, 4.1 y 4.3 del plan). Por cada motor corre los
// candidatos de su escalera con los mismos casos y las repeticiones pedidas, del más barato al más
// caro según su precio. Opus 5.5 solo corre si ningún otro candidato del motor pasó las compuertas,
// salvo que se pida por nombre. Todo pasa por el mismo tope de costo, así que la corrida se detiene
// limpia antes de pasarse.
import type { AiEngine } from '../../src/engines/aiContracts.ts';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import type { Budget } from './budget.ts';
import { ladderFor, modelChoiceOf, type Candidate, type CandidateName } from './candidates.ts';
import type { GoldenCase } from './cases.ts';
import { gateRun, type CandidateRun } from './choice.ts';
import { runCases, selectCases, type ProviderFor } from './run.ts';

export interface MatrixPlan {
  engines: readonly AiEngine[];
  /** null es la escalera completa de cada motor. Con nombres, solo esos y sin la regla de Opus */
  only: readonly CandidateName[] | null;
  /** Candidatos fuera de la escalera, iguales para todos los motores, como los de OpenAI (4.5) */
  explicit?: readonly Candidate[];
  repeat: number;
  limitPerEngine?: number;
  concurrency?: number;
}

export interface SkippedCandidate {
  engine: AiEngine;
  candidate: Candidate;
  reason: string;
}

export interface MatrixResult {
  runs: CandidateRun[];
  skipped: SkippedCandidate[];
  stoppedByBudget: boolean;
}

export interface MatrixContext {
  /** Prompts, claves de fuentes y la configuración base. El proveedor se usa si no hay providerFor */
  deps: RunDeps;
  cases: readonly GoldenCase[];
  budget: Budget;
  providerFor?: ProviderFor;
  /** Avance en una línea, para corridas largas */
  onProgress?: (line: string) => void;
}

const EFFORT_RANK = { low: 0, medium: 1, high: 2, xhigh: 3, max: 4 } as const;

/** Orden para correr, del más barato al más caro según el precio. El costo medido decide después */
export function byExpectedCost(deps: RunDeps): (a: Candidate, b: Candidate) => number {
  const weight = (candidate: Candidate) => {
    const price = deps.config.prices[candidate.id];
    // Unos 1,500 tokens de entrada y 500 de salida por llamada, para ordenar
    const base = price ? price.input * 1.5 + price.output * 0.5 : Number.POSITIVE_INFINITY;
    const effort = candidate.effort ? EFFORT_RANK[candidate.effort] : 0;
    const thinking = candidate.thinking === 'adaptive' ? 1 : 0;
    return base * (1 + effort * 0.25 + thinking * 0.1);
  };
  return (a, b) => weight(a) - weight(b);
}

async function runCandidate(
  ctx: MatrixContext,
  plan: MatrixPlan,
  engine: AiEngine,
  candidate: Candidate,
): Promise<CandidateRun> {
  const config = {
    ...ctx.deps.config,
    models: { ...ctx.deps.config.models, [engine]: modelChoiceOf(candidate, engine) },
  };
  const deps: RunDeps = { ...ctx.deps, config };
  const cases = selectCases(ctx.cases, [engine], plan.limitPerEngine);
  const repeats: CandidateRun['repeats'] = [];
  let complete = true;
  for (let round = 1; round <= plan.repeat; round += 1) {
    ctx.onProgress?.(`${engine} ${candidate.name}, repetición ${round} de ${plan.repeat}`);
    const { results, stoppedByBudget } = await runCases(deps, cases, {
      budget: ctx.budget,
      ...(ctx.providerFor ? { providerFor: ctx.providerFor } : {}),
      ...(plan.concurrency ? { concurrency: plan.concurrency } : {}),
    });
    repeats.push(results);
    if (stoppedByBudget) {
      complete = false;
      break;
    }
  }
  return { engine, candidate, repeats, complete };
}

export async function runMatrix(ctx: MatrixContext, plan: MatrixPlan): Promise<MatrixResult> {
  const runs: CandidateRun[] = [];
  const skipped: SkippedCandidate[] = [];
  const order = byExpectedCost(ctx.deps);
  for (const engine of plan.engines) {
    const ladder = [...(plan.explicit ?? ladderFor(engine, plan.only))].sort(order);
    const explicit = plan.only !== null || plan.explicit !== undefined;
    const first = ladder.filter((candidate) => explicit || !candidate.onlyIfNonePass);
    const fallback = ladder.filter((candidate) => !explicit && candidate.onlyIfNonePass);
    for (const candidate of first) {
      if (ctx.budget.exhausted) {
        skipped.push({ engine, candidate, reason: 'no corrió porque se llegó al tope de costo' });
        continue;
      }
      runs.push(await runCandidate(ctx, plan, engine, candidate));
    }
    const anyPassed = runs.some((run) => run.engine === engine && gateRun(run).passed);
    for (const candidate of fallback) {
      if (anyPassed) {
        skipped.push({
          engine,
          candidate,
          reason: 'no hizo falta, porque un candidato más barato pasó las compuertas',
        });
      } else if (ctx.budget.exhausted) {
        skipped.push({ engine, candidate, reason: 'no corrió porque se llegó al tope de costo' });
      } else {
        runs.push(await runCandidate(ctx, plan, engine, candidate));
      }
    }
  }
  return { runs, skipped, stoppedByBudget: ctx.budget.exhausted };
}
