// Transporte de la corrida real (B14, 3.14 del plan de B14). supabase-js con la llave secreta dedicada
// de la calibración, sin guardar sesión, y .rpc() sobre las funciones calibration_*. La llave va en el
// encabezado apikey, como muestra la guía vigente de Supabase para las llaves secretas. Nunca se imprime.
//
// Por la API, service_role hereda los 8 s de authenticator, y lo más que se puede configurar son 60. Las
// funciones llevan su propio statement_timeout de 50 s y las páginas son de hasta 20,000 filas. Aquí se
// reintenta hasta 3 veces, con espera creciente, lo que falló por un 5xx, por la red o por el SQLSTATE
// 57014 (consulta cancelada por tiempo), solo en las funciones que son seguras de repetir (store.ts).
import { createClient } from '@supabase/supabase-js';
import { createStore, StoreError, type CalibrationStore, type RpcCall } from './store.ts';

export interface RestStoreOptions {
  url: string;
  key: string;
  /** Para las pruebas. Por omisión, el fetch de Node */
  fetch?: typeof fetch;
  /** Para las pruebas. Por omisión, una espera real */
  sleep?: (ms: number) => Promise<void>;
  /** Intentos por llamada. 3 por omisión */
  attempts?: number;
  /** Espera antes del segundo intento, que se triplica en cada uno. 2 s por omisión */
  backoffMs?: number;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** true si el fallo puede ser pasajero. Un 4xx, un 22023 o un 42501 no se repiten */
function isTransient(failure: { code: string | null; status: number }): boolean {
  return failure.status === 0 || failure.status >= 500 || failure.code === '57014';
}

export function createRestStore(options: RestStoreOptions): CalibrationStore {
  const client = createClient(options.url, options.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  });
  const sleep = options.sleep ?? wait;
  const attempts = Math.max(1, options.attempts ?? 3);
  const backoff = options.backoffMs ?? 2000;

  const call: RpcCall = async (spec, params) => {
    const tries = spec.retry ? attempts : 1;
    let last: StoreError | null = null;
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      if (attempt > 1) await sleep(backoff * 3 ** (attempt - 2));
      let reply: Awaited<ReturnType<typeof client.rpc>>;
      try {
        reply = await client.rpc(spec.name, params);
      } catch {
        // La red falló antes de que hubiera respuesta
        last = new StoreError(spec.name, { kind: 'network' });
        continue;
      }
      if (!reply.error) return reply.data as unknown;
      const code = reply.error.code === '' ? null : reply.error.code;
      last = new StoreError(spec.name, {
        code,
        status: reply.status > 0 ? reply.status : null,
        kind: reply.status === 0 ? 'network' : code === '57014' ? 'timeout' : 'store_error',
      });
      if (!isTransient({ code, status: reply.status })) break;
    }
    throw last ?? new StoreError(spec.name, { kind: 'store_error' });
  };
  return createStore(call);
}
