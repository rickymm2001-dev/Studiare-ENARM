// La aplicación del proxy de IA alojado (D-103, Fase G bloque G1). Usa las mismas rutas de IA que el
// proxy local, pero pide sesión de Supabase en cada llamada, solo deja entrar a los orígenes de la
// app publicada, deja usar la IA solo con un plan de pago (o siendo médico o admin) y solo deja ver
// y cambiar la configuración y el gasto al administrador. El alumno de cada llamada es la cuenta
// verificada y nunca lo que diga el cliente. No hay llave de IA ni de servicio en el navegador.
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { MAX_BODY_BYTES, PROXY_VERSION } from '../config.ts';
import type { AiMode } from '../env.ts';
import { createAiRoutes, type AiRoutesDeps, type AiVariables } from '../ai/route.ts';
import {
  bearerToken,
  canAdminister,
  canUseEngines,
  type AuthFailure,
  type Authenticate,
} from './auth.ts';

export interface HostedOptions {
  ai: AiRoutesDeps;
  mode: AiMode;
  authenticate: Authenticate;
  /** Páginas que pueden llamar al proxy, por ejemplo https://rickymm2001-dev.github.io */
  origins: ReadonlySet<string>;
}

const FAILURES: Record<AuthFailure, { status: 401 | 403 | 503; message: string }> = {
  unauthenticated: {
    status: 401,
    message: 'Tu sesión venció. Entra otra vez con tu correo.',
  },
  other_device: {
    status: 403,
    message: 'Tu cuenta está activa en otro dispositivo. Entra aquí otra vez para tomarla.',
  },
  unavailable: {
    status: 503,
    message: 'No pudimos comprobar tu cuenta ahora. Inténtalo en unos minutos.',
  },
};

export function createHostedApp(options: HostedOptions) {
  const app = new Hono<{ Variables: AiVariables }>();

  app.use(secureHeaders());

  // Solo la app publicada puede llamar desde un navegador. Sin Origin, como una herramienta de
  // línea de comandos, igual hace falta una sesión válida
  app.use(async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined) {
      if (!options.origins.has(origin)) return c.json({ error: 'origin_not_allowed' }, 403);
      c.header('access-control-allow-origin', origin);
      c.header('vary', 'Origin');
      if (c.req.method === 'OPTIONS') {
        c.header('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
        c.header('access-control-allow-headers', 'authorization, content-type');
        c.header('access-control-max-age', '600');
        return c.body(null, 204);
      }
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

  // Pública, para que la app sepa si hay IA y en qué modo antes de pedir sesión
  app.get('/health', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ status: 'ok', mode: options.mode, version: PROXY_VERSION });
  });

  app.use('/ai/*', async (c, next) => {
    const token = bearerToken(c.req.header('authorization'));
    if (!token) {
      return c.json({ error: 'unauthorized', message: FAILURES.unauthenticated.message }, 401);
    }
    const result = await options.authenticate(token);
    if (!result.ok) {
      const failure = FAILURES[result.failure];
      return c.json({ error: 'unauthorized', message: failure.message }, failure.status);
    }
    const { user } = result;
    const path = new URL(c.req.url).pathname;
    const isAdminRoute = /\/ai\/(config|usage)\/?$/.test(path);
    if (isAdminRoute) {
      if (!canAdminister(user)) return c.json({ error: 'forbidden' }, 403);
    } else if (!canUseEngines(user)) {
      return c.json(
        {
          error: 'plan_required',
          message: 'La IA es de los planes de pago. Mira los planes en Suscripción.',
        },
        403,
      );
    }
    c.set('aiUser', { id: user.id });
    return next();
  });

  app.route('/ai', createAiRoutes(options.ai));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((error, c) => {
    // Nunca se devuelve el detalle del error, que podría incluir datos de la petición
    console.error('Error en el proxy de IA alojado', error.name);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
