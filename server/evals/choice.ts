// Compuertas automáticas y regla de elección de modelo (B12, 4.3 del plan). Un candidato pasa las
// compuertas si en cada una de sus repeticiones cumple el esquema, el anclaje, los rechazos, los
// adversarios, cero negativas, cero cortes y la latencia de su motor. El juez solo califica a los que
// pasaron. Por motor se elige el más barato que pase todo, con la latencia p95 para desempatar. El
// juez es un filtro previo y la palabra final es de los dos médicos en la compuerta 1.
import type { AiEngine } from '../../src/engines/aiContracts.ts';
import type { Candidate } from './candidates.ts';
import { summarizeGroup, type CaseResult, type EngineSummary } from './run.ts';

/** Esquema válido al primer intento en 98% o más de cada repetición */
export const SCHEMA_FIRST_MIN = 0.98;

/**
 * Latencia p95 por caso, con su reintento. Lo que va por lote no la tiene, como las hipótesis, y las
 * reestructuradas tampoco porque son del médico y quedan listas para el lote de B14
 */
export const LATENCY_P95_LIMIT_MS: Readonly<Record<AiEngine, number | null>> = {
  forgetting: null,
  weekly_report: 20_000,
  flashcards: 30_000,
  bias_tips: 20_000,
  restructure: null,
};

/** Media del juez para pasar, sin ninguna marca crítica */
export const JUDGE_MIN_MEAN = 3.3;

/** Dos costos por llamada a menos de 5% uno del otro cuentan como empate y decide la latencia */
export const COST_TIE_RATIO = 0.05;

/** Lo que corrió un candidato en un motor */
export interface CandidateRun {
  engine: AiEngine;
  candidate: Candidate;
  /** Los resultados de cada repetición */
  repeats: CaseResult[][];
  /** Corrió todas sus repeticiones con todos sus casos */
  complete: boolean;
}

export interface GateReport {
  passed: boolean;
  /** Qué no cumplió, en una línea cada cosa */
  failures: string[];
}

export const runKey = (engine: AiEngine, candidate: string) => `${engine}:${candidate}`;

/** Las compuertas automáticas de un candidato en un motor, revisadas en cada repetición */
export function gateRun(run: CandidateRun): GateReport {
  const failures = new Set<string>();
  if (!run.complete) failures.add('no terminó sus repeticiones por el tope de costo');
  const limit = LATENCY_P95_LIMIT_MS[run.engine];
  for (const results of run.repeats) {
    const summary = summarizeGroup(run.engine, results);
    if (summary.cases === 0) continue;
    if (summary.schemaValid / summary.cases < SCHEMA_FIRST_MIN) {
      failures.add('esquema al primer intento bajo 98%');
    }
    if (summary.schemaValidFinal < summary.cases)
      failures.add('esquema después del reintento bajo 100%');
    if (summary.grounded < summary.answerCases) failures.add('anclaje bajo 100%');
    if (summary.rejectedRight < summary.rejectionCases) failures.add('rechazos bajo 100%');
    if (summary.adversarialRight < summary.adversarialCases) failures.add('adversarios bajo 100%');
    if (summary.refusals > 0) failures.add('el modelo se negó en algún caso');
    // Una falla de red o un 429 no dice nada de la calidad, pero tampoco deja elegir al candidato
    if (
      results.some(
        (result) =>
          !result.refused && (result.error === 'provider_error' || result.error === 'rate_limited'),
      )
    ) {
      failures.add(
        'errores del proveedor o del límite de la API, conviene repetir con menos --concurrency',
      );
    }
    if (summary.cutoffs > 0) failures.add('alguna respuesta se cortó por max_tokens');
    if (limit !== null && summary.p95LatencyMs > limit) {
      failures.add(`latencia p95 arriba de ${limit / 1000} s`);
    }
  }
  return { passed: failures.size === 0, failures: [...failures] };
}

/** Todas las repeticiones juntas, para el costo medido por llamada y la latencia */
export function overallSummary(run: CandidateRun): EngineSummary {
  return summarizeGroup(run.engine, run.repeats.flat());
}

/** La calificación del juez de un candidato en un motor */
export interface JudgeSummary {
  /** Textos calificados */
  judged: number;
  /** Textos que el juez no pudo calificar, por una negativa, un error o el tope de costo */
  unjudged: number;
  /** Media de todos los criterios de todos los textos */
  mean: number;
  /** Media de cada criterio */
  criteria: Record<string, number>;
  /** Textos con algo médicamente falso o peligroso */
  critical: number;
  passed: boolean;
}

export interface RankedCandidate {
  candidate: Candidate;
  gate: GateReport;
  judge: JudgeSummary | null;
  costPerCallUsd: number;
  p95LatencyMs: number;
  /** Pasó todo lo que se le revisó, incluido el juez si se pidió */
  eligible: boolean;
}

export interface EngineChoice {
  engine: AiEngine;
  chosen: Candidate | null;
  /** Se eligió sin juez, solo con las compuertas automáticas */
  withoutJudge: boolean;
  /** Ordenados del más barato al más caro por costo medido */
  ranked: RankedCandidate[];
  reason: string;
}

/**
 * Elige el candidato de un motor (4.3). Con juez, solo cuenta quien pasó las compuertas y el juez.
 * Sin juez, quien pasó las compuertas, y la elección queda como provisional. Si nadie pasa, el motor
 * se queda con su plantilla y se le pregunta a Ricardo (10.23)
 */
export function chooseForEngine(
  engine: AiEngine,
  runs: readonly CandidateRun[],
  judges: ReadonlyMap<string, JudgeSummary>,
  options: { judged: boolean },
): EngineChoice {
  const ranked = runs
    .filter((run) => run.engine === engine)
    .map((run): RankedCandidate => {
      const gate = gateRun(run);
      const summary = overallSummary(run);
      const judge = judges.get(runKey(engine, run.candidate.name)) ?? null;
      return {
        candidate: run.candidate,
        gate,
        judge,
        costPerCallUsd: summary.costPerCallUsd,
        p95LatencyMs: summary.p95LatencyMs,
        eligible: gate.passed && (options.judged ? judge?.passed === true : true),
      };
    })
    .sort((a, b) => a.costPerCallUsd - b.costPerCallUsd);
  const eligible = ranked.filter((item) => item.eligible);
  const cheapest = eligible[0];
  if (!cheapest) {
    return {
      engine,
      chosen: null,
      withoutJudge: !options.judged,
      ranked,
      reason:
        'Ningún candidato pasó. El motor se queda con su plantilla y se le pregunta a Ricardo (10.23).',
    };
  }
  // Empate de costo dentro de 5%. Gana la menor latencia p95
  const tied = eligible.filter(
    (item) => item.costPerCallUsd <= cheapest.costPerCallUsd * (1 + COST_TIE_RATIO),
  );
  const winner = [...tied].sort((a, b) => a.p95LatencyMs - b.p95LatencyMs)[0] ?? cheapest;
  const fasterThanRest = tied.every(
    (item) => item === winner || item.p95LatencyMs > winner.p95LatencyMs,
  );
  const tieNote =
    tied.length > 1
      ? ` Empató en costo con ${tied.length - 1} más y ${
          fasterThanRest ? 'ganó por latencia p95' : 'quedó primero en la escalera'
        }.`
      : '';
  return {
    engine,
    chosen: winner.candidate,
    withoutJudge: !options.judged,
    ranked,
    reason: `${winner.candidate.name} es el más barato que pasa ${
      options.judged ? 'las compuertas y el juez' : 'las compuertas, sin juez todavía'
    }.${tieNote}`,
  };
}
