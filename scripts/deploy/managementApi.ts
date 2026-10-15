// Cliente mínimo de la API de administración de Supabase (Management API) para desplegar desde el repo
// (docs/DESPLIEGUE.md). Cada ruta, método y cuerpo se revisó contra la especificación OpenAPI oficial
// (https://api.supabase.com/api/v1-json) y contra cómo la llaman el CLI y el servidor MCP de Supabase.
// Las fuentes y la fecha están en docs/DESPLIEGUE.md.
//
// Nunca imprime ni devuelve el token. Un error dice el método, la ruta y el mensaje de Supabase, sin
// encabezados ni cuerpo de la petición, así que tampoco lleva valores de secretos.

export const MANAGEMENT_API_URL = 'https://api.supabase.com';

/** Una fila de la historia de migraciones del proyecto (supabase_migrations.schema_migrations) */
export interface MigrationRecord {
  version: string;
  name: string;
}

/** Lo que devuelve la API de una Edge Function, sin su código */
export interface FunctionInfo {
  id: string;
  slug: string;
  name: string;
  status: string;
  version: number;
  verifyJwt: boolean | null;
  entrypointPath: string | null;
  updatedAt: number | null;
}

/** Un archivo de la función, con su ruta desde la raíz del repo, como lo sube el CLI */
export interface DeployFile {
  path: string;
  content: string;
}

export interface DeployFunctionInput {
  slug: string;
  /** Ruta desde la raíz del repo, por ejemplo supabase/functions/create-checkout/index.ts */
  entrypointPath: string;
  verifyJwt: boolean;
  files: readonly DeployFile[];
}

export interface SecretInput {
  name: string;
  value: string;
}

export type Row = Record<string, unknown>;

export class ManagementApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ManagementApiError';
    this.status = status;
  }
}

export interface ManagementClient {
  readonly ref: string;
  /** Corre SQL con permiso de escritura. Devuelve las filas del resultado */
  runQuery(query: string): Promise<Row[]>;
  /** Corre una consulta de solo lectura. Nunca escribe */
  readQuery(query: string): Promise<Row[]>;
  listMigrations(): Promise<MigrationRecord[]>;
  /** Aplica la migración y la registra en la historia con ese nombre, como el conector */
  applyMigration(input: { name: string; query: string }): Promise<void>;
  listFunctions(): Promise<FunctionInfo[]>;
  /** null si la función no existe */
  getFunction(slug: string): Promise<FunctionInfo | null>;
  deployFunction(input: DeployFunctionInput): Promise<FunctionInfo>;
  /** Crea o reemplaza secretos de las Edge Functions en una sola llamada */
  setSecrets(secrets: readonly SecretInput[]): Promise<void>;
  /** Solo los nombres. Los valores que devuelve la API se descartan aquí mismo */
  listSecretNames(): Promise<string[]>;
}

export interface ManagementClientOptions {
  ref: string;
  /** null cuando el proxy del entorno pone el token, como en la sesión en la nube */
  token: string | null;
  fetch: typeof fetch;
  baseUrl?: string;
}

const asRecord = (value: unknown): Row =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {};
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

function toFunctionInfo(value: unknown): FunctionInfo {
  const row = asRecord(value);
  const slug = asString(row.slug);
  if (slug === null || typeof row.version !== 'number') {
    throw new ManagementApiError(0, 'La API devolvió una función sin slug o sin versión');
  }
  return {
    id: asString(row.id) ?? '',
    slug,
    name: asString(row.name) ?? slug,
    status: asString(row.status) ?? '',
    version: row.version,
    verifyJwt: typeof row.verify_jwt === 'boolean' ? row.verify_jwt : null,
    entrypointPath: asString(row.entrypoint_path),
    updatedAt: typeof row.updated_at === 'number' ? row.updated_at : null,
  };
}

function toRows(value: unknown, what: string): Row[] {
  if (!Array.isArray(value)) {
    throw new ManagementApiError(0, `La API no devolvió una lista en ${what}`);
  }
  return value.map(asRecord);
}

const REF_SHAPE = /^[a-z]{20}$/;

/** El código de una falla de red, como ENOTFOUND, o solo el tipo de error. Nunca su mensaje */
function networkCause(error: unknown): string {
  const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)) return code;
  return error instanceof Error ? error.name : 'Error desconocido';
}

export function createManagementClient(options: ManagementClientOptions): ManagementClient {
  if (!REF_SHAPE.test(options.ref)) {
    throw new ManagementApiError(0, 'La referencia del proyecto debe tener 20 letras minúsculas');
  }
  const base = `${options.baseUrl ?? MANAGEMENT_API_URL}/v1/projects/${options.ref}`;
  const token = options.token;
  /** Por si Supabase repitiera el token en un mensaje */
  const hideToken = (text: string) =>
    token !== null && token.length >= 8 ? text.split(token).join('[oculto]') : text;

  /** Una llamada. Lanza con el estado y el mensaje de Supabase si no sale bien */
  async function call(
    method: 'GET' | 'POST',
    path: string,
    body?: { json: unknown } | { form: FormData },
    accept404 = false,
  ): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.token !== null) headers.authorization = `Bearer ${options.token}`;
    let payload: string | FormData | undefined;
    if (body && 'json' in body) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body.json);
    } else if (body) {
      // fetch pone el content-type de multipart con su frontera
      payload = body.form;
    }
    const route = `${method} ${path.split('?')[0] ?? path}`;
    let reply: Response;
    let text: string;
    try {
      reply = await options.fetch(`${base}${path}`, {
        method,
        headers,
        ...(payload === undefined ? {} : { body: payload }),
      });
      text = await reply.text();
    } catch (error) {
      // El mensaje de fetch puede traer el encabezado con el token, por ejemplo si trae un salto de
      // línea. Solo se dice el código de red, como ENOTFOUND, o el tipo de error
      throw new ManagementApiError(
        0,
        `No hubo respuesta de Supabase en ${route}. ${networkCause(error)}`,
      );
    }
    let data: unknown;
    try {
      data = text === '' ? null : JSON.parse(text);
    } catch {
      data = null;
    }
    if (reply.status === 404 && accept404) return { status: 404, data: null };
    if (!reply.ok) {
      const record = asRecord(data);
      const detail = asString(record.message) ?? asString(record.error) ?? '';
      const proxy = reply.headers.get('x-proxy-error');
      const extra = [detail, proxy ? `proxy ${proxy}` : ''].filter((part) => part !== '');
      throw new ManagementApiError(
        reply.status,
        hideToken(
          `Supabase respondió ${reply.status} en ${route}. ${extra.join('. ').slice(0, 400)}`.trim(),
        ),
      );
    }
    return { status: reply.status, data };
  }

  const client: ManagementClient = {
    ref: options.ref,
    async runQuery(query) {
      const { data } = await call('POST', '/database/query', { json: { query } });
      return toRows(data, 'database/query');
    },
    async readQuery(query) {
      try {
        const { data } = await call('POST', '/database/query/read-only', { json: { query } });
        return toRows(data, 'database/query/read-only');
      } catch (error) {
        // El endpoint de solo lectura está en beta. Si falla por algo que no es el token, se repite en
        // el general con read_only, que es como lo llama el servidor MCP de Supabase
        if (!(error instanceof ManagementApiError) || [401, 429].includes(error.status)) {
          throw error;
        }
        const { data } = await call('POST', '/database/query', {
          json: { query, read_only: true },
        });
        return toRows(data, 'database/query');
      }
    },
    async listMigrations() {
      const { data } = await call('GET', '/database/migrations');
      return toRows(data, 'database/migrations').map((row) => ({
        version: asString(row.version) ?? '',
        name: asString(row.name) ?? '',
      }));
    },
    async applyMigration(input) {
      await call('POST', '/database/migrations', {
        json: { query: input.query, name: input.name },
      });
    },
    async listFunctions() {
      const { data } = await call('GET', '/functions');
      if (!Array.isArray(data)) throw new ManagementApiError(0, 'La API no devolvió una lista');
      return data.map(toFunctionInfo);
    },
    async getFunction(slug) {
      const { status, data } = await call(
        'GET',
        `/functions/${encodeURIComponent(slug)}`,
        undefined,
        true,
      );
      return status === 404 ? null : toFunctionInfo(data);
    },
    async deployFunction(input) {
      // Igual que supabase functions deploy con la API. metadata como campo y cada archivo como
      // parte file con su ruta desde la raíz del repo, así ../_shared/x.ts se resuelve
      const form = new FormData();
      form.append(
        'metadata',
        JSON.stringify({
          name: input.slug,
          entrypoint_path: input.entrypointPath,
          verify_jwt: input.verifyJwt,
        }),
      );
      for (const file of input.files) {
        form.append(
          'file',
          new Blob([file.content], { type: 'application/typescript' }),
          file.path,
        );
      }
      const { data } = await call(
        'POST',
        `/functions/deploy?slug=${encodeURIComponent(input.slug)}`,
        { form },
      );
      return toFunctionInfo(data);
    },
    async setSecrets(secrets) {
      await call('POST', '/secrets', {
        json: secrets.map((secret) => ({ name: secret.name, value: secret.value })),
      });
    },
    async listSecretNames() {
      const { data } = await call('GET', '/secrets');
      return toRows(data, 'secrets')
        .map((row) => asString(row.name))
        .filter((name): name is string => name !== null);
    },
  };
  return client;
}
