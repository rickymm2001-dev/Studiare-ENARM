// Google de mentira para las pruebas de bank-sync (B11, 3.11 del plan de B11). Es un fetch que atiende
// el token de OAuth y las tres lecturas de la API de Google Sheets v4 con los archivos de prueba de
// tests/fixtures/bank-sheet, que tienen la forma exacta de sus respuestas. Firma y verifica el JWT con
// un par de llaves que se genera en cada prueba con crypto.subtle.generateKey, así ninguna llave vive en
// el repo. Nunca llama a Google.
import { SHEETS_API, SHEETS_SCOPE, TOKEN_URL, type ServiceAccountKey } from './google.ts';

/** Un Sheet de prueba con las tres respuestas de la API */
export interface FakeSheetFixture {
  spreadsheet: { spreadsheetId: string; sheets: unknown[] };
  values: { spreadsheetId: string; valueRanges: unknown[] };
  formulas: { range: string; majorDimension: string; values: unknown[][] };
}

export interface FakeGoogleOptions {
  /** Hora de la prueba en milisegundos, para revisar iat y exp */
  now?: () => number;
  /** La primera lectura de la hoja responde 429 */
  rateLimitOnce?: boolean;
  /** Toda lectura de la hoja responde este código */
  failWith?: number;
}

export interface FakeGoogle {
  fetch: typeof fetch;
  /** La llave JSON de una cuenta de servicio de prueba, recién generada */
  key: ServiceAccountKey;
  /** Las direcciones que se pidieron, sin el token */
  requests: string[];
  /** Cuántos tokens se entregaron */
  tokens: number;
  /** Los claims del último JWT que se verificó */
  lastClaims: Record<string, unknown> | null;
}

const FAKE_EMAIL = 'banco-prueba@studiare-prueba.iam.gserviceaccount.com';

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function toPem(der: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(der)) binary += String.fromCharCode(byte);
  const body = btoa(binary).replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Crea el Google de mentira con uno o varios Sheets de prueba */
export async function createFakeGoogle(
  fixtures: readonly FakeSheetFixture[],
  options: FakeGoogleOptions = {},
): Promise<FakeGoogle> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const now = options.now ?? (() => Date.now());
  const issued = new Set<string>();
  let rateLimited = false;

  const fake: FakeGoogle = {
    key: { client_email: FAKE_EMAIL, private_key: toPem(pkcs8) },
    requests: [],
    tokens: 0,
    lastClaims: null,
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      fake.requests.push(url);
      if (url === TOKEN_URL) {
        const body = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
        if (body.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
          return json({ error: 'unsupported_grant_type' }, 400);
        }
        const [header = '', claims = '', signature = ''] = (body.get('assertion') ?? '').split('.');
        const valid = await crypto.subtle.verify(
          'RSASSA-PKCS1-v1_5',
          pair.publicKey,
          fromBase64Url(signature),
          new TextEncoder().encode(`${header}.${claims}`),
        );
        const head = JSON.parse(new TextDecoder().decode(fromBase64Url(header))) as Record<
          string,
          unknown
        >;
        const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(claims))) as Record<
          string,
          unknown
        >;
        const seconds = Math.floor(now() / 1000);
        const iat = typeof parsed.iat === 'number' ? parsed.iat : 0;
        const exp = typeof parsed.exp === 'number' ? parsed.exp : 0;
        if (
          !valid ||
          head.alg !== 'RS256' ||
          parsed.iss !== FAKE_EMAIL ||
          parsed.scope !== SHEETS_SCOPE ||
          parsed.aud !== TOKEN_URL ||
          exp - iat > 3600 ||
          exp <= seconds ||
          Math.abs(iat - seconds) > 300
        ) {
          return json({ error: 'invalid_grant' }, 400);
        }
        fake.lastClaims = parsed;
        fake.tokens += 1;
        const token = `fake-token-${fake.tokens}`;
        issued.add(token);
        return json({ access_token: token, expires_in: 3600, token_type: 'Bearer' });
      }
      if (!url.startsWith(`${SHEETS_API}/`)) return json({ error: 'not_found' }, 404);
      const authorization = new Headers(init?.headers).get('authorization') ?? '';
      if (!issued.has(authorization.replace(/^Bearer /, '')))
        return json({ error: 'unauthenticated' }, 401);
      if (options.failWith) return json({ error: 'fail' }, options.failWith);
      if (options.rateLimitOnce && !rateLimited) {
        rateLimited = true;
        return json({ error: 'rate_limit' }, 429);
      }
      const parsedUrl = new URL(url);
      const [id = '', action = ''] = decodeURIComponent(
        parsedUrl.pathname.slice(new URL(SHEETS_API).pathname.length + 1),
      ).split(/\/values[:/]?/);
      const fixture = fixtures.find((item) => item.spreadsheet.spreadsheetId === id);
      if (!fixture) return json({ error: 'not_found' }, 404);
      if (parsedUrl.pathname.endsWith('/values:batchGet')) {
        return parsedUrl.searchParams.get('valueRenderOption') === 'FORMATTED_VALUE'
          ? json(fixture.values)
          : json({ error: 'bad_render' }, 400);
      }
      if (parsedUrl.pathname.includes('/values/')) {
        return parsedUrl.searchParams.get('valueRenderOption') === 'FORMULA' && action !== ''
          ? json(fixture.formulas)
          : json({ error: 'bad_render' }, 400);
      }
      return parsedUrl.searchParams.get('fields') === 'sheets.properties(title,gridProperties)'
        ? json({ sheets: fixture.spreadsheet.sheets })
        : json({ error: 'bad_fields' }, 400);
    },
  };
  return fake;
}
