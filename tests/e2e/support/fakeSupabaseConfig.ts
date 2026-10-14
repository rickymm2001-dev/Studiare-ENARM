// Direcciones y llave del Supabase simulado de las pruebas de nube. Las comparten playwright.config.ts,
// que construye la app apuntando a este proyecto que no existe, y el servidor falso que atiende sus
// peticiones desde Playwright. Nada de aquí es un secreto. La llave tiene la forma de la llave pública
// anterior de Supabase (un JWT con rol anon) porque el cliente y el escáner del build solo aceptan ese rol.

/** Origen del proyecto falso. Cumple la forma que exige readCloudConfig y la CSP del build */
export const FAKE_SUPABASE_URL = 'https://fakeproj.supabase.co';

/** Dónde sirve Playwright el build con la nube configurada */
export const CLOUD_PREVIEW_PORT = 4174;
export const CLOUD_PREVIEW_URL = `http://127.0.0.1:${CLOUD_PREVIEW_PORT}`;

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
