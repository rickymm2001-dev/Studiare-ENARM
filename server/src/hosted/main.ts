// Punto de entrada del proxy de IA alojado (D-103, Fase G bloque G1). Corre en cualquier alojamiento
// que ejecute Node o Docker. Lee su configuración del entorno, verifica la sesión de Supabase de
// cada llamada, cuenta los límites y el gasto en Postgres y nunca imprime una llave.
// Uso: node server/src/hosted/main.ts
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { ACADEMIC_SOURCE_KEYS } from '../../../src/config/academicSources.ts';
import { DEFAULT_CONFIG } from '../ai/config.ts';
import { PgLedger, createRestRpc } from '../ai/pgLedger.ts';
import { loadPrompts } from '../ai/prompts.ts';
import { createAnthropicProvider, createMockProvider, type AiProvider } from '../ai/provider.ts';
import type { AiRoutesDeps } from '../ai/route.ts';
import { KEY_VARIABLE } from '../config.ts';
import { ROOT_PROMPTS_DIR, SERVER_PROMPTS_DIR } from '../ai/index.ts';
import { createHostedApp } from './app.ts';
import { createSupabaseAuthenticator } from './auth.ts';
import { createRestConfigStore } from './configStore.ts';
import { readHostedEnv } from './env.ts';

const parsed = readHostedEnv(process.env);
if (!parsed.ok) {
  console.error('El proxy de IA alojado no puede arrancar. Falta o está mal');
  for (const problem of parsed.problems) console.error(`- ${problem}`);
  process.exit(1);
}
const { env } = parsed;
// La clave no se queda en el entorno, que lo heredan los procesos hijos y salen en volcados
Reflect.deleteProperty(process.env, KEY_VARIABLE);

const store = createRestConfigStore({ url: env.supabaseUrl, serviceKey: env.serviceKey });
let config = DEFAULT_CONFIG;
try {
  config = await store.load();
} catch (error) {
  // Sin poder leer la configuración guardada no se arranca a ciegas con otros límites
  console.error(
    'No se pudo leer la configuración de la IA',
    error instanceof Error ? error.name : '',
  );
  process.exit(1);
}

const getConfig = () => config;
let provider: AiProvider;
if (env.apiKey) {
  // La clave se pasa explícita para que el SDK no busque ninguna otra variable de entorno
  const client = new Anthropic({ apiKey: env.apiKey });
  provider = createAnthropicProvider(
    { create: (params, requestOptions) => client.messages.create(params, requestOptions) },
    () => getConfig().limits,
  );
} else {
  provider = createMockProvider();
}

const ai: AiRoutesDeps = {
  provider,
  prompts: loadPrompts({ serverPromptsDir: SERVER_PROMPTS_DIR, rootPromptsDir: ROOT_PROMPTS_DIR }),
  config: getConfig,
  setConfig: (next) => {
    config = next;
  },
  configFile: null,
  saveConfig: (next) => store.save(next),
  ledger: new PgLedger(createRestRpc({ url: env.supabaseUrl, serviceKey: env.serviceKey })),
  sourceKeys: new Set<string>(ACADEMIC_SOURCE_KEYS),
};

const app = createHostedApp({
  ai,
  mode: provider.mode,
  authenticate: createSupabaseAuthenticator({ url: env.supabaseUrl, anonKey: env.anonKey }),
  origins: env.origins,
});

const server = serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, (info) => {
  console.log(
    `Proxy de IA alojado escuchando en el puerto ${String(info.port)} en modo ${provider.mode === 'real' ? 'real' : 'simulado'}`,
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
