// Ayudas de HTTP que comparten las funciones de pago (B10 del plan del cambio). Respuestas, CORS,
// direcciones de regreso a la app, lectura tolerante de JSON y la firma HMAC de los avisos. Viven
// aparte para que payments.ts (Stripe) y mercadopago.ts (Mercado Pago) no se importen entre sí. No
// depende de Deno, así se prueba con Vitest (D-096).
import type { FunctionEnv } from './billingTypes.ts';
import { parseOriginList } from './origins.ts';

export type Json = Record<string, unknown>;

export const asRecord = (value: unknown): Json =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
export const asString = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
export const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// ---------------------------------------------------------------------------------------------
// Firmas

const encoder = new TextEncoder();

/** HMAC SHA-256 en hexadecimal, como firman Stripe y Mercado Pago sus avisos */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compara sin que el tiempo delate dónde difieren */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  let diff = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------------------------
// Respuestas

export const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8' },
  });
}

/** El cuerpo como objeto, o uno vacío si no llegó o no es JSON */
export async function readJsonRecord(request: Request): Promise<Json> {
  try {
    return asRecord(JSON.parse(await request.text()));
  } catch {
    return {};
  }
}

export function originOf(value: string | undefined): string {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------------------------
// Orígenes que pueden llamar desde el navegador (B17, 4.1)

/** El origen de APP_URL y los de APP_ORIGINS. Lo único que puede llamar a las funciones desde un navegador */
export function allowedOrigins(env: Pick<FunctionEnv, 'APP_URL' | 'APP_ORIGINS'>): string[] {
  const main = originOf(env.APP_URL);
  const extra = parseOriginList(env.APP_ORIGINS).origins;
  return [...(main === '' ? [] : [main]), ...extra.filter((origin) => origin !== main)];
}

/**
 * Solo la página de la app puede llamar a la función desde el navegador. La app es el origen de APP_URL y,
 * mientras dure una mudanza de dominio, los de APP_ORIGINS. Un origen que no está en la lista no recibe
 * access-control-allow-origin y el navegador bloquea la respuesta
 */
export function corsHeaders(
  env: Pick<FunctionEnv, 'APP_URL' | 'APP_ORIGINS'>,
  origin: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'origin',
  };
  if (origin !== null && allowedOrigins(env).includes(origin)) {
    headers['access-control-allow-origin'] = origin;
  }
  return headers;
}

/** La pantalla Suscripción de la app, con los datos del regreso si los hay, por ejemplo pago=ok */
export function subscriptionUrl(appUrl: string, params: Record<string, string> = {}): string {
  const target = new URL(appUrl);
  target.pathname = `${target.pathname.replace(/\/+$/, '')}/suscripcion`;
  for (const [name, value] of Object.entries(params)) target.searchParams.set(name, value);
  return target.toString();
}
