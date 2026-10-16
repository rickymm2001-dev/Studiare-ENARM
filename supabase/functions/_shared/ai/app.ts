// La aplicación de la Edge Function ai-proxy (B12, 2.1, 2.2 y 2.6). Pone CORS con los orígenes exactos
// de la app, exige JSON en las escrituras, limita el tamaño a 64 KB y monta /health y las rutas de IA
// del núcleo, que piden la sesión de Supabase en cada llamada. Las rutas dentro de una función llevan
// su nombre como prefijo, así que todo vive bajo /ai-proxy. No hay llave de IA ni de servicio en el
// navegador y ninguna respuesta de error trae detalles.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { corsHeadersFor, preflightHeadersFor } from './cors.ts';
import type { Log } from './ports.ts';
import { AI_ENGINES, type AiEngine, type AiEngineGate } from './engines/aiContracts.ts';
import { createAiRoutes, healthOf, type AiRoutesDeps } from './routes.ts';

export const AI_PROXY_BASE_PATH = '/ai-proxy';

/** Todos los motores cerrados para alumnos, que es lo que /health dice si no puede leer la configuración */
const closedEngines = (): Record<AiEngine, AiEngineGate> =>
  Object.fromEntries(AI_ENGINES.map((engine) => [engine, 'gated'])) as Record<
    AiEngine,
    AiEngineGate
  >;
/** Tamaño máximo de una petición (2.2) */
export const MAX_BODY_BYTES = 64 * 1024;

export interface AiProxyAppOptions {
  ai: AiRoutesDeps;
  /** Los orígenes de APP_ORIGINS */
  origins: ReadonlySet<string>;
  basePath?: string;
  log?: Log;
}

export function createAiProxyApp(options: AiProxyAppOptions) {
  const log: Log = options.log ?? (() => undefined);
  const app = new Hono().basePath(options.basePath ?? AI_PROXY_BASE_PATH);

  // La política de recursos de origen cruzado la decide CORS, así que no se manda la de mismo origen
  app.use(secureHeaders({ crossOriginResourcePolicy: false }));

  app.use(async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined) {
      if (!options.origins.has(origin)) return c.json({ error: 'origin_not_allowed' }, 403);
      if (c.req.method === 'OPTIONS') return c.body(null, 204, preflightHeadersFor(origin));
      for (const [name, value] of Object.entries(corsHeadersFor(origin))) c.header(name, value);
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
      if (!contentType.startsWith('application/json')) {
        return c.json({ error: 'unsupported_media_type' }, 415);
      }
    }
    return next();
  });

  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'payload_too_large' }, 413),
    }),
  );

  // Pública, para que la app sepa si hay IA, en qué modo y qué motores ven los alumnos. Lee la
  // configuración guardada antes de contestar, igual que las rutas de IA: en una copia que acaba de
  // arrancar, o que solo atendió /health, la que hay en memoria es la de fábrica, y un motor auditado con
  // otro modelo saldría abierto aquí mientras la llamada del alumno recibe gate_closed (o al revés)
  app.get('/health', async (c) => {
    c.header('Cache-Control', 'no-store');
    let known = true;
    try {
      await options.ai.refreshConfig?.();
    } catch {
      // Sin poder leerla no se sabe qué motores están abiertos. Las rutas de IA contestan not_configured
      // en ese estado, así que ningún alumno puede usarlos
      log('ai.config.unavailable');
      known = false;
    }
    const health = await healthOf(options.ai);
    return c.json(known ? health : { ...health, engines: closedEngines() });
  });

  app.route('/ai', createAiRoutes(options.ai));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((_error, c) => {
    // Nunca se devuelve ni se registra el detalle, que podría traer datos de la petición
    log('ai.proxy.error');
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
