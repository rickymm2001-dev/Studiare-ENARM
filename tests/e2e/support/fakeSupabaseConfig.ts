// Direcciones y llave del Supabase simulado de las pruebas de nube. Las comparten playwright.config.ts,
// que construye la app apuntando a este proyecto que no existe, y el servidor falso que atiende sus
// peticiones desde Playwright. Nada de aquí es un secreto. La llave tiene la forma de la llave pública
// anterior de Supabase (un JWT con rol anon) porque el cliente y el escáner del build solo aceptan ese rol.
import { loopbackUrl, testPorts } from '../../../server/src/testPorts.ts';

/** Origen del proyecto falso. Cumple la forma que exige readCloudConfig y la CSP del build */
export const FAKE_SUPABASE_URL = 'https://fakeproj.supabase.co';

/** Dónde sirve Playwright el build con la nube configurada. 4174, o corrido con PW_PORT_OFFSET */
export const CLOUD_PREVIEW_PORT = testPorts(process.env).cloudPreview;
export const CLOUD_PREVIEW_URL = loopbackUrl(CLOUD_PREVIEW_PORT);

/**
 * Orígenes de la pasarela y del portal de pagos simulados. La app solo abre direcciones de pago en
 * checkout.stripe.com y del portal en billing.stripe.com (src/data/payments), así que el servidor
 * falso también atiende esos dos orígenes dentro del navegador de la prueba. Ninguna petición sale a
 * Stripe de verdad
 */
export const FAKE_GATEWAY_ORIGIN = 'https://checkout.stripe.com';
export const FAKE_PORTAL_ORIGIN = 'https://billing.stripe.com';

/**
 * Origen de Mercado Pago simulado (B10). La app acepta pagos en mercadopago.com y mercadopago.com.mx
 * (src/data/payments/checkout.ts), así que el servidor falso atiende este dentro del navegador de la
 * prueba. Ninguna petición sale a Mercado Pago de verdad
 */
export const FAKE_MERCADOPAGO_ORIGIN = 'https://www.mercadopago.com.mx';

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * Llave pública falsa con forma de JWT y rol anon. La firma es un texto fijo que no verifica nadie. Se
 * arma por partes para que quede claro que es simulada y para que un escáner no la confunda con una
 * llave real
 */
export const FAKE_SUPABASE_ANON_KEY = [
  base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  base64Url(
    JSON.stringify({
      iss: 'supabase-simulado',
      ref: 'fakeproj',
      role: 'anon',
      iat: 1_700_000_000,
      exp: 4_102_444_800,
    }),
  ),
  base64Url('firma simulada para las pruebas de punta a punta'),
].join('.');

/**
 * Analítica y errores simulados (B15, 5.3 y 6.4 del plan de B15). Solo el build de nube de las pruebas lleva
 * estas variables (playwright.config.ts), así las specs pueden comprobar que sin permiso no sale nada.
 * fakeTelemetry.ts atiende dentro del navegador de la prueba los dos orígenes y guarda lo que llega, así
 * que ninguna petición sale a PostHog ni a Sentry de verdad.
 *
 * Nada de aquí es un secreto ni se parece a uno. La llave de proyecto de PostHog (phc_) y el DSN de Sentry
 * son públicos por diseño, y aun así estos valores no son de ninguna cuenta. La llave dice en su texto que
 * es simulada y rellena con ceros, y la del DSN es la secuencia 0123456789abcdef repetida. Tienen la forma
 * que la app valida (phc_ con 43 caracteres, un DSN https con origen o{número}.ingest.sentry.io) para que
 * el cliente los acepte. El host de PostHog es uno de los dos que acepta la app (src/config/csp.ts), así
 * que la prueba lo intercepta, no lo reemplaza
 */
export const FAKE_POSTHOG_KEY = 'phc_SimuladaPruebasStudiare00000000000000000000';
export const FAKE_POSTHOG_HOST = 'https://us.i.posthog.com';
const FAKE_SENTRY_HOST = 'o4500000000000000.ingest.sentry.io';
export const FAKE_SENTRY_PUBLIC_KEY = '0123456789abcdef0123456789abcdef';
export const FAKE_SENTRY_PROJECT = '4500000000000001';
export const FAKE_SENTRY_ORIGIN = `https://${FAKE_SENTRY_HOST}`;
export const FAKE_SENTRY_DSN = `https://${FAKE_SENTRY_PUBLIC_KEY}@${FAKE_SENTRY_HOST}/${FAKE_SENTRY_PROJECT}`;
