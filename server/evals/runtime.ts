// Piezas de scripts/eval-ai.ts y de scripts/ai/gate-sample.ts que conviene probar sin red (B12, 4.4
// del plan). Lectura de banderas, proveedores por caso con su sonda y la revisión previa de que el
// proveedor del núcleo manda el esfuerzo y el razonamiento de cada candidato, para no gastar en una
// matriz que mediría otra cosa.
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { BiasTipOutputSchema } from '../../src/engines/aiContracts.ts';
import type { AiConfig } from '../../supabase/functions/_shared/ai/config.ts';
import {
  createAnthropicProvider,
  createMockProvider,
  type AiProvider,
  type MessagesApi,
} from '../../supabase/functions/_shared/ai/provider.ts';
import { EVAL_TIMEOUT_MS } from './anthropic.ts';
import { probedMessagesApi } from './budget.ts';
import { modelChoiceOf, type Candidate } from './candidates.ts';
import type { EvalCredentials } from './credentials.ts';
import type { ProviderFor } from './run.ts';

// ---------------------------------------------------------------------------------------------
// Banderas

export interface Cli {
  flag(name: string): boolean;
  value(name: string): string | undefined;
  /** Un número de --name=valor, o el de omisión. Falla si no es un número positivo */
  number(name: string, fallback: number): number;
  /** Las banderas que no están en la lista, para avisar de un error de dedo */
  unknown(known: readonly string[]): string[];
}

export function parseCli(argv: readonly string[]): Cli {
  const nameOf = (arg: string) => arg.replace(/^--/, '').split('=')[0] ?? '';
  return {
    flag: (name) => argv.includes(`--${name}`),
    value: (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3),
    number(name, fallback) {
      const raw = argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
      if (raw === undefined) return fallback;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`--${name} necesita un número mayor que cero.`);
      }
      return parsed;
    },
    unknown: (known) => argv.filter((arg) => !arg.startsWith('--') || !known.includes(nameOf(arg))),
  };
}

// ---------------------------------------------------------------------------------------------
// Proveedores por caso

export function mockProviderFor(): ProviderFor {
  const provider = createMockProvider();
  return () => provider;
}

/** El proveedor real del núcleo con la sonda de cada caso */
export function anthropicProviderFor(api: MessagesApi, config: () => AiConfig): ProviderFor {
  return (probe) =>
    createAnthropicProvider(
      probedMessagesApi(api, probe, (id) => config().prices[id]),
      () => ({ timeoutMs: EVAL_TIMEOUT_MS, maxRetries: 2 }),
    );
}

// ---------------------------------------------------------------------------------------------
// Revisión previa del razonamiento (2.8)

/** Lo que la API espera para apagar el razonamiento en cada modelo (0.5 del plan) */
const THINKING_OFF: Readonly<Record<string, string>> = {
  'claude-haiku-5-5': 'disabled',
  'claude-sonnet-5-5': 'between_tools',
};

export interface ParamsMismatch {
  candidate: string;
  problem: string;
}

/**
 * Arma la petición que mandaría el proveedor para cada candidato, sin red, y revisa que lleve su
 * esfuerzo y su razonamiento. Si el proveedor todavía no los manda, la matriz mediría otro modelo
 */
export async function checkCandidateParams(
  candidates: readonly Candidate[],
  makeProvider: (api: MessagesApi) => AiProvider,
): Promise<ParamsMismatch[]> {
  const mismatches: ParamsMismatch[] = [];
  for (const candidate of candidates) {
    const captured: { params: MessageCreateParamsNonStreaming | null } = { params: null };
    const provider = makeProvider({
      create(params) {
        captured.params = params;
        return Promise.reject(new Error('Solo se captura la petición'));
      },
    });
    await provider
      .call({
        engine: 'bias_tips',
        model: modelChoiceOf(candidate, 'bias_tips'),
        system: 'revisión',
        user: 'revisión',
        input: null,
        schema: BiasTipOutputSchema,
      })
      .catch(() => undefined);
    const params = captured.params;
    if (!params) {
      mismatches.push({ candidate: candidate.name, problem: 'el proveedor no armó la petición' });
      continue;
    }
    const effort = params.output_config?.effort ?? null;
    if (effort !== candidate.effort) {
      mismatches.push({
        candidate: candidate.name,
        problem: `manda esfuerzo ${effort ?? 'ninguno'} y el candidato pide ${candidate.effort ?? 'ninguno'}`,
      });
    }
    const thinking = params.thinking?.type ?? null;
    const expected =
      candidate.thinking === 'off'
        ? (THINKING_OFF[candidate.id] ?? 'imposible')
        : candidate.thinking === 'adaptive'
          ? 'adaptive'
          : null;
    const ok =
      expected === 'adaptive'
        ? thinking === null || thinking === 'adaptive'
        : thinking === expected;
    if (!ok) {
      mismatches.push({
        candidate: candidate.name,
        problem: `manda razonamiento ${thinking ?? 'ninguno'} y el candidato pide ${expected ?? 'ninguno'}`,
      });
    }
  }
  return mismatches;
}

// ---------------------------------------------------------------------------------------------
// Claves que pide cada modo

/**
 * Qué falta para correr con --real, o null si está todo. Se revisa antes de crear cualquier cliente,
 * así una corrida sin clave se detiene limpia y sin llamar a nada. Claude hace falta para los motores
 * y para el juez. OpenAI solo para la comparación
 */
export function credentialProblem(options: {
  provider: 'anthropic' | 'openai';
  judge: boolean;
  credentials: EvalCredentials;
}): string | null {
  const needsAnthropic = options.provider === 'anthropic' || options.judge;
  if (needsAnthropic && !options.credentials.anthropicKey) {
    return 'No hay ENARM_ANTHROPIC_KEY en server/.env.local ni en el entorno. No se llamó a ningún modelo. Corre sin --real o agrega la clave de evaluaciones (9.2).';
  }
  if (options.provider === 'openai' && !options.credentials.openaiKey) {
    return 'No hay ENARM_OPENAI_KEY en server/.env.local ni en el entorno. No se llamó a ningún modelo (9.3).';
  }
  return null;
}
