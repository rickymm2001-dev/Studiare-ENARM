// La compuerta 1 del lado del servidor (B12, 5.5). La bandera ai_gate de platform_settings dice qué
// motores pasaron la auditoría de los dos médicos y con qué modelo y qué prompt. Un motor solo está
// abierto para alumnos si la bandera lo abre y si el modelo, el esfuerzo, el razonamiento y la
// huella del prompt de hoy son los auditados. Cualquier cambio lo cierra hasta una auditoría corta.
// La compuerta no aplica a médicos, admins ni dueño. La pausa frena a todos salvo admin y dueño.
import {
  AI_ENGINES,
  AiGateStateSchema,
  PROMPT_VERSION_PATTERN,
  type AiEngine,
  type AiEngineGate,
  type AiGateState,
} from './engines/aiContracts.ts';
import { serviceHeaders } from '../keys.ts';
import type { AiConfig } from './config.ts';
import type { Clock, GateReader } from './ports.ts';
import { promptHash, type PromptSet, type PromptSets } from './prompts.ts';

/** Sin bandera o sin poder leerla, todo cuenta cerrado para alumnos y sin pausa */
export const CLOSED_GATE: AiGateState = { paused: false, engines: {} };

/** Lo que tiene que coincidir con lo auditado para que un motor siga abierto */
export interface EngineAudit {
  model: string;
  effort: AiConfig['models'][AiEngine]['effort'];
  thinking: AiConfig['models'][AiEngine]['thinking'];
  promptVersion: string;
  promptHash: string;
}

const hashes = new Map<string, Promise<string>>();

/** La huella de un prompt, calculada una sola vez por texto */
export function cachedPromptHash(prompt: PromptSet): Promise<string> {
  let found = hashes.get(prompt.text);
  if (!found) {
    found = promptHash(prompt);
    hashes.set(prompt.text, found);
  }
  return found;
}

/** Cómo está configurado hoy cada motor, para compararlo con lo auditado */
export async function currentAudits(
  config: AiConfig,
  prompts: PromptSets,
): Promise<Record<AiEngine, EngineAudit>> {
  const audits = {} as Record<AiEngine, EngineAudit>;
  for (const engine of AI_ENGINES) {
    const model = config.models[engine];
    audits[engine] = {
      model: model.id,
      effort: model.effort,
      thinking: model.thinking,
      promptVersion: prompts[engine].version,
      promptHash: await cachedPromptHash(prompts[engine]),
    };
  }
  return audits;
}

/** Abierto o cerrado para alumnos */
export function engineGate(
  state: AiGateState,
  engine: AiEngine,
  current: EngineAudit,
): AiEngineGate {
  const audited = state.engines[engine];
  if (!audited?.open) return 'gated';
  const same =
    audited.model === current.model &&
    audited.effort === current.effort &&
    audited.thinking === current.thinking &&
    audited.promptVersion === current.promptVersion &&
    audited.promptHash === current.promptHash;
  return same ? 'open' : 'gated';
}

export function engineGates(
  state: AiGateState,
  audits: Record<AiEngine, EngineAudit>,
): Record<AiEngine, AiEngineGate> {
  const gates = {} as Record<AiEngine, AiEngineGate>;
  for (const engine of AI_ENGINES) gates[engine] = engineGate(state, engine, audits[engine]);
  return gates;
}

/**
 * Todo abierto con lo que hay hoy. Es la compuerta del proxy de desarrollo y de la demo, donde la IA
 * es simulada y lleva su etiqueta (5.5)
 */
export function openGateState(
  audits: Record<AiEngine, EngineAudit>,
  at: string,
  sampleId = 'desarrollo',
): AiGateState {
  const engines: AiGateState['engines'] = {};
  for (const engine of AI_ENGINES) {
    const audit = audits[engine];
    if (!PROMPT_VERSION_PATTERN.test(audit.promptVersion)) continue;
    engines[engine] = { open: true, ...audit, sampleId, at };
  }
  return { paused: false, engines };
}

/** Una compuerta que siempre está abierta con la configuración de ese momento */
export function alwaysOpenGate(
  config: () => AiConfig,
  prompts: PromptSets,
  clock: Clock = () => Date.now(),
): GateReader {
  return {
    async read() {
      return openGateState(await currentAudits(config(), prompts), new Date(clock()).toISOString());
    },
  };
}

/**
 * Recuerda la bandera ttlMs (60 s en producción, 5.6). Una lectura fallida da todo cerrado y no se
 * recuerda, así se vuelve a intentar en la siguiente petición
 */
export function cachedGateReader(reader: GateReader, ttlMs: number, clock: Clock): GateReader {
  let cached: { until: number; state: AiGateState } | null = null;
  return {
    async read() {
      if (cached && cached.until > clock()) return cached.state;
      try {
        const state = await reader.read();
        cached = { until: clock() + ttlMs, state };
        return state;
      } catch {
        cached = null;
        return CLOSED_GATE;
      }
    },
  };
}

/** Lee la clave ai_gate de platform_settings por la API REST, con la llave de servicio */
export function createRestGateReader(options: {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
}): GateReader {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    async read() {
      const response = await fetchImpl(
        `${options.url}/rest/v1/platform_settings?key=eq.ai_gate&select=value`,
        {
          headers: { ...serviceHeaders(options.serviceKey), accept: 'application/json' },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok) throw new Error(`platform_settings contestó ${String(response.status)}`);
      const rows = (await response.json()) as { value?: unknown }[];
      const parsed = AiGateStateSchema.safeParse(rows[0]?.value);
      // Una bandera que no se entiende cierra todo, nunca abre
      return parsed.success ? parsed.data : CLOSED_GATE;
    },
  };
}
