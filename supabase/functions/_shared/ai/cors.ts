// CORS de la Edge Function de IA (B12, 2.6). Solo los orígenes exactos de la app, que vienen del
// secreto APP_ORIGINS, https, sin comodines ni rutas. Un origen ajeno recibe 403 sin llamar a nada
// más. Sin Origin, como una herramienta de línea de comandos, se atiende igual y siempre con token.
// Los encabezados permitidos son los mismos que en las demás funciones (_shared/http.ts).

export const CORS_ALLOW_HEADERS = 'authorization, content-type, apikey, x-client-info';
export const CORS_ALLOW_METHODS = 'GET, POST, PUT, OPTIONS';
export const CORS_MAX_AGE = '600';

const ORIGIN = /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

export type OriginsResult = { ok: true; origins: string[] } | { ok: false; problem: string };

export function parseOrigins(value: string): OriginsResult {
  const origins = value
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin !== '');
  if (origins.length === 0) {
    return {
      ok: false,
      problem: 'Falta APP_ORIGINS, las direcciones de la app separadas por comas',
    };
  }
  if (origins.some((origin) => !ORIGIN.test(origin) || origin.includes('*'))) {
    return {
      ok: false,
      problem:
        'APP_ORIGINS trae una dirección no válida. Va como https://sitio.com, sin ruta ni comodines',
    };
  }
  return { ok: true, origins };
}

/** Los encabezados de CORS para un origen permitido */
export function corsHeadersFor(origin: string): Record<string, string> {
  return { 'access-control-allow-origin': origin, vary: 'Origin' };
}

/** Los encabezados de la respuesta a un preflight de un origen permitido */
export function preflightHeadersFor(origin: string): Record<string, string> {
  return {
    ...corsHeadersFor(origin),
    'access-control-allow-methods': CORS_ALLOW_METHODS,
    'access-control-allow-headers': CORS_ALLOW_HEADERS,
    'access-control-max-age': CORS_MAX_AGE,
  };
}
