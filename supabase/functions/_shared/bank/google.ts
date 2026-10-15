// Lectura del Google Sheet del banco con la API de Google Sheets v4 y una cuenta de servicio (B11, 3.2
// del plan de B11). Sin dependencias, con fetch y Web Crypto, así se prueba con Vitest en Node con un
// Google de mentira (fakeGoogle.ts) y corre igual en Deno.
//
// Documentación vigente que se siguió (docs-digest, sección 10, y el documento de descubrimiento de la
// API, revisión 20261007)
//   - JWT RS256 con iss igual a client_email, scope spreadsheets.readonly, aud del token y exp de una
//     hora. Se cambia en POST https://oauth2.googleapis.com/token con grant_type jwt-bearer
//   - GET spreadsheets/{id}?fields=sheets.properties(title,gridProperties)
//   - GET spreadsheets/{id}/values:batchGet con ranges repetido y valueRenderOption
//   - GET spreadsheets/{id}/values/{range} con valueRenderOption FORMULA
//   - Cuota de 300 lecturas por minuto por proyecto. Un 429 se reintenta una vez a los 2 segundos
// La llave nunca se registra ni sale de aquí. Los errores llevan solo el paso y el código HTTP.

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Lo que se usa de la llave JSON de la cuenta de servicio (GOOGLE_SA_KEY) */
export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

/** La llave de la cuenta de servicio, o null si falta o no se entiende. Nunca dice por qué, sin su texto */
export function parseServiceAccount(raw: string | undefined): ServiceAccountKey | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const { client_email: email, private_key: key } = parsed as Record<string, unknown>;
    if (typeof email !== 'string' || typeof key !== 'string') return null;
    if (!email.includes('@') || !key.includes('PRIVATE KEY')) return null;
    return { client_email: email, private_key: key };
  } catch {
    return null;
  }
}

/** Un error de Google con el paso y el código HTTP, sin el cuerpo de la respuesta */
export class GoogleError extends Error {
  readonly status: number;
  readonly step: string;
  constructor(step: string, status: number) {
    super(`Google respondió ${status} en ${step}`);
    this.name = 'GoogleError';
    this.step = step;
    this.status = status;
  }
}

export interface GoogleDeps {
  fetch: typeof fetch;
  /** Milisegundos desde 1970 */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const encoder = new TextEncoder();

export function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
}

/** El JWT firmado que se cambia por un token de acceso (RS256, PKCS#8 de la cuenta de servicio) */
export async function signServiceJwt(key: ServiceAccountKey, nowMs: number): Promise<string> {
  const iat = Math.floor(nowMs / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64Url(
    encoder.encode(
      JSON.stringify({
        iss: key.client_email,
        scope: SHEETS_SCOPE,
        aud: TOKEN_URL,
        iat,
        exp: iat + 3600,
      }),
    ),
  );
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(unsigned)),
  );
  return `${unsigned}.${base64Url(signature)}`;
}

/** Un rango A1 con la pestaña entre comillas, como pide la API (3.2) */
export function sheetRange(tab: string, a1: string): string {
  return `'${tab.replace(/'/g, "''")}'!${a1}`;
}

/** La letra de una columna, 1 es A y 27 es AA */
export function columnLetter(column: number): string {
  let letters = '';
  let rest = column;
  while (rest > 0) {
    const index = (rest - 1) % 26;
    letters = String.fromCharCode(65 + index) + letters;
    rest = Math.floor((rest - 1) / 26);
  }
  return letters;
}

export interface SheetProperties {
  title: string;
  rowCount: number;
  columnCount: number;
}

export type RenderOption = 'FORMATTED_VALUE' | 'FORMULA';

export interface GoogleClient {
  accessToken(): Promise<string>;
  sheets(spreadsheetId: string): Promise<SheetProperties[]>;
  batchGet(
    spreadsheetId: string,
    ranges: readonly string[],
    render: RenderOption,
  ): Promise<unknown[][][]>;
  values(spreadsheetId: string, range: string, render: RenderOption): Promise<unknown[][]>;
}

const asRows = (value: unknown): unknown[][] =>
  Array.isArray(value) ? value.map((row) => (Array.isArray(row) ? (row as unknown[]) : [])) : [];

/** Un cliente de solo lectura. Guarda el token en memoria hasta un minuto antes de que venza */
export function createGoogleClient(key: ServiceAccountKey, deps: GoogleDeps): GoogleClient {
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > deps.now()) return cached.token;
    const assertion = await signServiceJwt(key, deps.now());
    const reply = await deps.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    if (!reply.ok) throw new GoogleError('token', reply.status);
    const body = (await reply.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof body.access_token !== 'string') throw new GoogleError('token', 502);
    const seconds = typeof body.expires_in === 'number' ? body.expires_in : 3600;
    cached = { token: body.access_token, expiresAt: deps.now() + Math.max(seconds - 60, 0) * 1000 };
    return cached.token;
  }

  async function get(step: string, url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const reply = await deps.fetch(url, {
        headers: { authorization: `Bearer ${await accessToken()}` },
      });
      if (reply.status === 429 && attempt === 0) {
        await deps.sleep(2000);
        continue;
      }
      if (!reply.ok) throw new GoogleError(step, reply.status);
      return reply.json();
    }
  }

  return {
    accessToken,
    async sheets(spreadsheetId) {
      const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent(
        'sheets.properties(title,gridProperties)',
      )}`;
      const body = (await get('metadata', url)) as { sheets?: unknown };
      const sheets = Array.isArray(body.sheets) ? body.sheets : [];
      return sheets.map((sheet) => {
        const properties = (sheet as { properties?: Record<string, unknown> }).properties ?? {};
        const grid = (properties.gridProperties ?? {}) as Record<string, unknown>;
        return {
          title: typeof properties.title === 'string' ? properties.title : '',
          rowCount: typeof grid.rowCount === 'number' ? grid.rowCount : 0,
          columnCount: typeof grid.columnCount === 'number' ? grid.columnCount : 0,
        };
      });
    },
    async batchGet(spreadsheetId, ranges, render) {
      const params = new URLSearchParams();
      for (const range of ranges) params.append('ranges', range);
      params.set('valueRenderOption', render);
      params.set('majorDimension', 'ROWS');
      const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`;
      const body = (await get('batchGet', url)) as { valueRanges?: unknown };
      const ranges_ = Array.isArray(body.valueRanges) ? body.valueRanges : [];
      return ranges_.map((range) => asRows((range as { values?: unknown }).values));
    },
    async values(spreadsheetId, range, render) {
      const params = new URLSearchParams({ valueRenderOption: render, majorDimension: 'ROWS' });
      const url = `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(
        range,
      )}?${params.toString()}`;
      const body = (await get('values', url)) as { values?: unknown };
      return asRows(body.values);
    },
  };
}
