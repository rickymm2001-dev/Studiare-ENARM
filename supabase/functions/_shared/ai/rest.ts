// Llamadas a la API REST de Supabase (PostgREST) del núcleo de IA (B12). Las funciones de la base
// se llaman con la llave de servicio, salvo ai_whoami, que va con el token del alumno. Nunca se
// vuelca el cuerpo de una respuesta con error, que podría traer datos de la petición. Solo se lee
// su código de Postgres, como 42501 para el dispositivo que ya no es el activo.

/** Llama a una función de Postgres y devuelve su resultado. Falla con RestError si contesta con error */
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export class RestError extends Error {
  readonly status: number;
  /** El código de Postgres o de PostgREST, como 42501 o PGRST301. null si no vino */
  readonly code: string | null;

  constructor(name: string, status: number, code: string | null) {
    super(`La función ${name} contestó ${String(status)}`);
    this.name = 'RestError';
    this.status = status;
    this.code = code;
  }
}

export interface RestTarget {
  /** Dirección del proyecto, como https://abc.supabase.co */
  url: string;
  /** La llave que va en apikey. La de servicio, salvo para ai_whoami */
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function codeOf(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === 'string' ? body.code : null;
  } catch {
    return null;
  }
}

/** Llama a una función con la llave dada y, si no se dice otra cosa, ella misma como token */
export async function callRpc(
  target: RestTarget,
  name: string,
  args: Record<string, unknown>,
  bearer: string = target.apiKey,
): Promise<unknown> {
  const fetchImpl = target.fetchImpl ?? fetch;
  const response = await fetchImpl(`${target.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: target.apiKey,
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(target.timeoutMs ?? 10_000),
  });
  if (!response.ok) throw new RestError(name, response.status, await codeOf(response));
  // Una función que no devuelve nada contesta con el cuerpo vacío
  const text = await response.text();
  return text === '' ? null : (JSON.parse(text) as unknown);
}

/** Las funciones de la base con la llave de servicio */
export function createRestRpc(options: {
  url: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
}): Rpc {
  const target: RestTarget = {
    url: options.url,
    apiKey: options.serviceKey,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  };
  return (name, args) => callRpc(target, name, args);
}
