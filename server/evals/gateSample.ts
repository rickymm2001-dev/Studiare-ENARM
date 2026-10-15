// Muestra de la compuerta 1 (B12, 5.1 del plan). Arma los 300 textos que auditan los dos médicos con
// el modelo, el esfuerzo y la versión de prompt de la configuración que se va a auditar, y los deja en
// la forma de AiGateSampleFileSchema. Tarjetas 120, hipótesis 70, consejos 50, informes 30 y
// reestructuradas 30. Un texto es lo que vería el alumno o el médico, y en tarjetas es una sola
// tarjeta. Sale del banco real aprobado si ya hay 100 preguntas o más, y si no del de demostración,
// marcado así en cada texto. Las tarjetas desde texto del alumno usan textos del equipo, nunca de
// alumnos reales.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  AiGateSampleFileSchema,
  type AiEngine,
  type AiGateItem,
  type AiGateSampleFile,
  type FlashcardsOutput,
  type GateSourceKind,
} from '../../src/engines/aiContracts.ts';
import { MOCK_MODEL } from '../../src/engines/aiMock.ts';
import { promptHash } from '../../supabase/functions/_shared/ai/prompts.ts';
import type { RunDeps } from '../../supabase/functions/_shared/ai/run.ts';
import { bankCases, seededRandom, shuffled, type BankSource } from './bankCases.ts';
import { privatePath } from './bankFile.ts';
import type { Budget } from './budget.ts';
import type { GoldenCase } from './cases.ts';
import { runCases, type CaseResult, type ProviderFor } from './run.ts';

/** Textos por motor. Pesa más lo que crea material de estudio (5.1) */
export const GATE_COUNTS: Readonly<Record<AiEngine, number>> = {
  flashcards: 120,
  forgetting: 70,
  bias_tips: 50,
  weekly_report: 30,
  restructure: 30,
};

/** Preguntas aprobadas del banco real desde las que la muestra sale del banco real (10.9) */
export const REAL_BANK_MIN = 100;

/** Tarjetas que se toman de una misma sección, para que la muestra cubra más textos */
const CARDS_PER_SECTION = 3;
/** Entradas planeadas de más por motor, porque algunas salen vacías o con pocas tarjetas */
const EXTRA = 2;
/** Entradas que se mandan a la vez. Se para en cuanto el motor llega a su cuenta */
const CHUNK = 10;

// ---------------------------------------------------------------------------------------------
// Textos del equipo

export const TeamFileSchema = z.strictObject({
  version: z.literal(1),
  texts: z
    .array(
      z.strictObject({
        title: z.string().trim().max(200).nullable(),
        text: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(20),
});
export type TeamText = z.infer<typeof TeamFileSchema>['texts'][number];

/** Los textos que escribe el equipo para las tarjetas desde texto del alumno, desde private/ */
export function loadTeamFile(path: string): TeamText[] {
  const absolute = privatePath(path);
  if (!existsSync(absolute)) throw new Error(`No existe ${path}.`);
  const parsed = TeamFileSchema.safeParse(JSON.parse(readFileSync(absolute, 'utf8')));
  if (!parsed.success) throw new Error(`${path} no tiene la forma de los textos del equipo.`);
  return parsed.data.texts;
}

// ---------------------------------------------------------------------------------------------
// Entradas

export interface GateInput {
  golden: GoldenCase;
  sourceKind: GateSourceKind;
}

/** Las entradas de cada motor, con unas de más, y de dónde sale la fuente de cada una */
export function planGateInputs(
  source: BankSource,
  team: readonly TeamText[],
  seed = 20261015,
): Record<AiEngine, GateInput[]> {
  const want = (engine: AiEngine) =>
    Math.ceil(
      (engine === 'flashcards' ? GATE_COUNTS.flashcards / CARDS_PER_SECTION : GATE_COUNTS[engine]) *
        EXTRA,
    );
  const perEngine = Math.max(...Object.keys(GATE_COUNTS).map((engine) => want(engine as AiEngine)));
  const cases = bankCases(source, { seed, perEngine, preferTopics: [] });
  const sourceKind = source.set;
  const of = (engine: AiEngine) =>
    cases
      .filter((golden) => golden.engine === engine && golden.expect === 'answer')
      .slice(0, want(engine));
  const teamCases = team.map((text, index): GateInput => ({
    golden: {
      id: `team-flashcards-${index + 1}`,
      engine: 'flashcards',
      description: 'Texto del equipo',
      input: { title: text.title, text: text.text },
      expect: 'answer',
      set: 'synthetic',
    },
    sourceKind: 'team',
  }));
  return {
    // Los textos del equipo van primero para que entren completos
    flashcards: [...teamCases, ...of('flashcards').map((golden) => ({ golden, sourceKind }))],
    forgetting: of('forgetting').map((golden) => ({ golden, sourceKind })),
    bias_tips: of('bias_tips').map((golden) => ({ golden, sourceKind })),
    // El informe sale de datos ya calculados de alumnos simulados, no de texto del banco
    weekly_report: of('weekly_report').map((golden) => ({
      golden,
      sourceKind: 'synthetic' as const,
    })),
    restructure: of('restructure').map((golden) => ({ golden, sourceKind })),
  };
}

// ---------------------------------------------------------------------------------------------
// Generación

/** Un UUID con forma de versión 4 que sale siempre igual de la misma semilla */
export function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface GateSampleOptions {
  deps: RunDeps;
  providerFor: ProviderFor;
  budget: Budget;
  /** real con la clave de evaluaciones, mock con las respuestas fijas */
  mode: 'real' | 'mock';
  inputs: Record<AiEngine, GateInput[]>;
  id: string;
  createdAt: string;
  concurrency?: number;
  onProgress?: (line: string) => void;
}

export interface GateSampleResult {
  file: AiGateSampleFile | null;
  /** Textos que faltaron por motor para llegar a GATE_COUNTS */
  shortfall: Partial<Record<AiEngine, number>>;
  costUsd: number;
  stoppedByBudget: boolean;
}

type ItemCommon = Pick<
  AiGateItem,
  'model' | 'effort' | 'thinking' | 'promptVersion' | 'promptHash'
>;

/** Suma a la muestra los textos aceptados de un grupo de resultados. Devuelve cuántos lleva el motor */
function collect(
  engine: AiEngine,
  results: readonly CaseResult[],
  planned: readonly GateInput[],
  taken: number,
  items: AiGateItem[],
  common: ItemCommon,
  sampleId: string,
): number {
  let count = taken;
  // Nada repetido. Una tarjeta igual a otra o una entrada igual a otra le quita tiempo al médico
  const seen = new Set(
    items
      .filter((item) => item.engine === engine)
      .map((item) => JSON.stringify(engine === 'flashcards' ? item.output : item.input)),
  );
  for (const result of results) {
    if (count >= GATE_COUNTS[engine]) break;
    if (!result.accepted || result.empty || result.output === null) continue;
    const input = planned.find((entry) => entry.golden.id === result.id);
    if (!input) continue;
    const outputs =
      engine === 'flashcards'
        ? (result.output as FlashcardsOutput).cards
            .slice(0, CARDS_PER_SECTION)
            .map((card) => ({ cards: [card] }))
        : [result.output];
    for (const output of outputs) {
      if (count >= GATE_COUNTS[engine]) break;
      const key = JSON.stringify(engine === 'flashcards' ? output : input.golden.input);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: stableUuid(`${sampleId}:${engine}:${count}`),
        engine,
        ...common,
        sourceKind: input.sourceKind,
        input: input.golden.input,
        output,
      } as AiGateItem);
      count += 1;
    }
  }
  return count;
}

export async function buildGateSample(options: GateSampleOptions): Promise<GateSampleResult> {
  const items: AiGateItem[] = [];
  const shortfall: Partial<Record<AiEngine, number>> = {};
  let costUsd = 0;
  let stoppedByBudget = false;
  for (const engine of Object.keys(GATE_COUNTS) as AiEngine[]) {
    const planned = options.inputs[engine];
    options.onProgress?.(
      `${engine}, hasta ${planned.length} entradas para ${GATE_COUNTS[engine]} textos`,
    );
    const choice = options.deps.config.models[engine];
    const prompt = options.deps.prompts[engine];
    const hash = await promptHash(prompt);
    const common: ItemCommon = {
      model: options.mode === 'mock' ? MOCK_MODEL : choice.id,
      effort: options.mode === 'mock' ? null : choice.effort,
      thinking: options.mode === 'mock' ? null : choice.thinking,
      promptVersion: prompt.version,
      promptHash: hash,
    };
    let taken = 0;
    for (let start = 0; start < planned.length && taken < GATE_COUNTS[engine]; start += CHUNK) {
      const chunk = planned.slice(start, start + CHUNK);
      const { results, stoppedByBudget: stopped } = await runCases(
        options.deps,
        chunk.map((input) => input.golden),
        {
          budget: options.budget,
          providerFor: options.providerFor,
          ...(options.concurrency ? { concurrency: options.concurrency } : {}),
        },
      );
      stoppedByBudget ||= stopped;
      costUsd += results.reduce((sum, result) => sum + result.costUsd, 0);
      taken = collect(engine, results, chunk, taken, items, common, options.id);
      if (stopped) break;
    }
    if (taken < GATE_COUNTS[engine]) shortfall[engine] = GATE_COUNTS[engine] - taken;
  }
  if (Object.keys(shortfall).length > 0 || items.length === 0) {
    return { file: null, shortfall, costUsd, stoppedByBudget };
  }
  // Revueltos con semilla, para que la posición no agrupe por motor
  const ordered = shuffled(
    items,
    seededRandom(Number.parseInt(stableUuid(options.id).slice(0, 8), 16)),
  );
  const file = AiGateSampleFileSchema.parse({
    version: 1,
    id: options.id,
    createdAt: options.createdAt,
    items: ordered,
  });
  return { file, shortfall, costUsd: Math.round(costUsd * 1e6) / 1e6, stoppedByBudget };
}
