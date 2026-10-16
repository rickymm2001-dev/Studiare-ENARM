// App de Hono del proxy de IA de desarrollo (8.1 y B12, 1.1). /health dice el modo y qué motores ven
// los alumnos, y /ai atiende los motores y los trabajos por lote con las mismas rutas del núcleo que
// la Edge Function ai-proxy. Aquí solo se agregan las guardas de localhost y de origen de la app.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import type { AiHealth } from '../../supabase/functions/_shared/ai/engines/aiContracts.ts';
import {
  createAiRoutes,
  HEALTH_VERSION,
  type AiRoutesDeps,
} from '../../supabase/functions/_shared/ai/routes.ts';
import { ALLOWED_HOSTNAMES, ALLOWED_ORIGINS, MAX_BODY_BYTES } from './config.ts';
import type { AiMode } from './env.ts';

export type HealthResponse = AiHealth;

function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  // [::1]:8787 o 127.0.0.1:8787 o localhost
  const match = /^(\[[^\]]+\]|[^:]+)(?::\d+)?$/.exec(hostHeader.trim().toLowerCase());
  return match?.[1] ?? null;
}

export function createApp(options: {
  mode: AiMode;
  ai?: AiRoutesDeps;
  /** Por omisión ALLOWED_ORIGINS. El proxy simulado de las pruebas suma su vista previa (testPorts.ts) */
  allowedOrigins?: ReadonlySet<string>;
}) {
  const app = new Hono();
  const allowedOrigins = options.allowedOrigins ?? ALLOWED_ORIGINS;

  app.use(secureHeaders());

  // Solo peticiones dirigidas a localhost. Una página externa que apunte su dominio a
  // 127.0.0.1 (DNS rebinding) manda otro Host y se rechaza
  app.use(async (c, next) => {
    const hostname = hostnameOf(c.req.header('host'));
    if (!hostname || !ALLOWED_HOSTNAMES.has(hostname)) {
      return c.json({ error: 'host_not_allowed' }, 403);
    }
    return next();
  });

  // Otra página abierta en el navegador podría llamar al proxy y gastar presupuesto. Se rechaza
  // todo Origin que no sea la app. Las escrituras además piden JSON, que obliga al navegador a
  // preguntar antes (preflight) y que la app sí manda (5.3, 8.1)
  app.use(async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      return c.json({ error: 'origin_not_allowed' }, 403);
    }
    if (!['GET', 'HEAD'].includes(c.req.method)) {
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

  // Sin engines, que solo manda la Edge Function (contrato C1). En desarrollo todo está abierto
  app.get('/health', (c) => {
    c.header('Cache-Control', 'no-store');
    const body: HealthResponse = {
      status: 'ok',
      mode: options.ai?.provider?.mode ?? options.mode,
      version: HEALTH_VERSION,
    };
    return c.json(body);
  });

  if (options.ai) app.route('/ai', createAiRoutes(options.ai));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((error, c) => {
    // Nunca se devuelve el detalle del error, que podría incluir datos de la petición
    console.error('Error en el proxy de IA', error.name);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
