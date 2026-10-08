// Rutas de IA del proxy (8.1). POST /ai/:engine atiende un motor. GET /ai/config y /ai/usage
// alimentan la pantalla de admin y PUT /ai/config cambia modelos, precios y límites sin reiniciar.
// Una petición pasa por el esquema, el tamaño, el filtro de datos personales y los límites antes
// de llegar al proveedor, y su salida pasa por el esquema y las guardas antes de salir de aquí.
import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import {
  AI_INPUT_LIMITS,
  AiEngineSchema,
  AiRequestSchema,
  ENGINE_CONTRACTS,
  inputChars,
  type AiEngine,
  type AiErrorCode,
} from '../../../src/engines/aiContracts.ts';
import { AiConfigPatchSchema, mergeConfig, saveAiConfig, type AiConfig } from './config.ts';
import type { Ledger } from './ledger.ts';
import { findPersonalData, hasPersonalData } from './pii.ts';
import type { PromptSets } from './prompts.ts';
import type { AiProvider } from './provider.ts';
import { runEngine } from './run.ts';

export interface AiRoutesDeps {
  provider: AiProvider;
  prompts: PromptSets;
  config: () => AiConfig;
  setConfig: (next: AiConfig) => void;
  /** Archivo donde se guardan los cambios de configuración. null no guarda */
  configFile: string | null;
  ledger: Ledger;
  sourceKeys: ReadonlySet<string>;
  clock?: () => number;
}

const STATUS: Record<AiErrorCode, ContentfulStatusCode> = {
  invalid_request: 400,
  pii_blocked: 422,
  input_too_large: 413,
  student_limit: 429,
  budget_exceeded: 429,
  rate_limited: 429,
  invalid_output: 502,
  provider_error: 502,
};

const MESSAGES: Record<
  'invalid_request' | 'pii_blocked' | 'input_too_large' | 'student_limit' | 'budget_exceeded',
  string
> = {
  invalid_request: 'La petición no tiene el formato esperado.',
  pii_blocked:
    'El texto trae datos personales, como un correo, un teléfono o un nombre. Quítalos e intenta de nuevo.',
  input_too_large: 'El texto es demasiado largo para este motor. Envía una parte más corta.',
  student_limit: 'Llegaste al límite de usos de IA de hoy. Vuelve mañana.',
  budget_exceeded: 'La IA está en pausa por hoy. Vuelve mañana.',
};

export function createAiRoutes(deps: AiRoutesDeps): Hono {
  const routes = new Hono();

  routes.use(async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  const fail = (
    c: { json: (body: unknown, status: ContentfulStatusCode) => Response },
    error: keyof typeof MESSAGES,
  ) => c.json({ error, message: MESSAGES[error] }, STATUS[error]);

  routes.get('/config', (c) =>
    c.json({
      mode: deps.provider.mode,
      config: deps.config(),
      prompts: Object.fromEntries(
        Object.entries(deps.prompts).map(([engine, prompt]) => [engine, prompt.version]),
      ),
    }),
  );

  routes.get('/usage', (c) =>
    c.json({
      mode: deps.provider.mode,
      limits: deps.config().limits,
      usage: deps.ledger.summary(),
    }),
  );

  routes.put('/config', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 'invalid_request');
    }
    const patch = AiConfigPatchSchema.safeParse(body);
    if (!patch.success) return fail(c, 'invalid_request');
    try {
      const next = mergeConfig(deps.config(), patch.data);
      if (deps.configFile) saveAiConfig(deps.configFile, next);
      deps.setConfig(next);
      return c.json({ mode: deps.provider.mode, config: next });
    } catch {
      // Por ejemplo un modelo sin precio. El motivo se dice sin volcar la petición
      return fail(c, 'invalid_request');
    }
  });

  routes.post('/:engine', async (c) => {
    const engineParsed = AiEngineSchema.safeParse(c.req.param('engine'));
    if (!engineParsed.success) return c.json({ error: 'not_found' }, 404);
    const engine: AiEngine = engineParsed.data;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return fail(c, 'invalid_request');
    }
    const request = AiRequestSchema.safeParse(body);
    if (!request.success) return fail(c, 'invalid_request');
    const input = ENGINE_CONTRACTS[engine].input.safeParse(request.data.input);
    if (!input.success) return fail(c, 'invalid_request');

    if (inputChars(input.data) > AI_INPUT_LIMITS[engine]) return fail(c, 'input_too_large');
    if (hasPersonalData(findPersonalData(input.data, request.data.blockedNames ?? []))) {
      return fail(c, 'pii_blocked');
    }

    const { limits } = deps.config();
    const studentRef = request.data.studentRef;
    const admission = deps.ledger.admit({
      studentRef,
      engine,
      perStudentPerDay: limits.perStudentPerDay[engine],
      dailyBudgetUsd: limits.dailyBudgetUsd,
    });
    if (!admission.ok) return fail(c, admission.reason);

    let result;
    try {
      result = await runEngine(
        {
          provider: deps.provider,
          prompts: deps.prompts,
          config: deps.config(),
          sourceKeys: deps.sourceKeys,
          ...(deps.clock ? { clock: deps.clock } : {}),
        },
        engine,
        input.data,
      );
    } catch (error) {
      // Un error nuestro, no del modelo. Se devuelve el cupo y lo maneja onError
      deps.ledger.release({ studentRef, engine });
      throw error;
    }

    const real = deps.provider.mode === 'real';
    if (result.ok) {
      deps.ledger.settle({ engine, costUsd: result.meta.estimatedCostUsd, real });
      return c.json({ output: result.output, meta: result.meta });
    }
    deps.ledger.settle({ engine, costUsd: result.cost.estimatedCostUsd, real });
    return c.json(
      { error: result.error, message: result.message, cost: result.cost },
      STATUS[result.error],
    );
  });

  return routes;
}
