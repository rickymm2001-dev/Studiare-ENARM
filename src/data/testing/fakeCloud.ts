// Cliente de Supabase falso para las pruebas del dispositivo único y de CloudBridge. Imita solo lo
// que usa la app. claim_device guarda el dispositivo como lo haría el servidor, con el session_id
// del token, y device_sessions devuelve esa fila. Puede rechazar el reclamo por el límite de cambios
// con el mismo error que lanza la base. Solo lo usan las pruebas.
import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';

export interface FakeCloudOptions {
  /** Fila inicial de device_sessions. null si nadie ha reclamado la cuenta */
  row?: FakeDeviceRow | null;
  /** Sesión de Supabase. null para simular que no hay sesión. sessionId va en el token de acceso */
  session?: FakeSession | null;
}

export interface FakeDeviceRow {
  device_id: string;
  label?: string;
  /** Sesión del token con la que se reclamó. Falta si el token no la traía */
  session_id?: string;
}

export interface FakeSession {
  id: string;
  email: string;
  /** session_id del token de acceso. Sin él el token no trae el claim */
  sessionId?: string;
}

export type FakeFailure = 'none' | 'error' | 'throw';
/** limit rechaza el reclamo con el error de límite de cambios. hang deja la llamada sin responder */
export type FakeClaimFailure = FakeFailure | 'limit';
export type FakeReportFailure = FakeFailure | 'hang';

/** Token de acceso con la forma de Supabase. La firma no importa porque el cliente no la verifica */
export function fakeAccessToken(sessionId?: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({
      sub: 'usuario',
      role: 'authenticated',
      ...(sessionId ? { session_id: sessionId } : {}),
    }),
    'firma-de-prueba',
  ].join('.');
}

export interface FakeCloud {
  cloud: SupabaseClient;
  /** Fila que tendría el servidor en device_sessions */
  row: FakeDeviceRow | null;
  session: FakeSession | null;
  /** Cómo falla cada llamada. error responde con error de red y throw lanza la excepción */
  failClaim: FakeClaimFailure;
  failCheck: FakeFailure;
  /** Cómo responde log_rejected_claim, la llamada que deja asentado un reclamo rechazado */
  failReport: FakeReportFailure;
  /** Hora de reintento que manda el error de límite en su detalle. null si el servidor no la manda */
  limitRetryAt: string | null;
  claims: { p_device_id: string; p_label: string }[];
  /** Reclamos rechazados que el cliente reportó con log_rejected_claim */
  rejections: { p_device_id: string; p_label: string }[];
  /** Cuántas veces se leyó device_sessions y con qué filtros */
  checks: number;
  filters: [column: string, value: unknown][];
  signOuts: unknown[];
  /** Nombre de cada función de la base que se llamó con rpc, en orden */
  rpcCalls: string[];
  /** ok responde a las funciones de sincronización como el servidor. off las trata como inexistentes */
  sync: 'off' | 'ok';
  /** Cuánto tarda signOut en quitar la sesión y avisar SIGNED_OUT, como la red de verdad */
  signOutDelay: number;
  /** Dispara un evento de Supabase Auth como si hubiera pasado en el navegador */
  emit: (event: AuthChangeEvent) => void;
}

const NETWORK_ERROR = { message: 'Failed to fetch', status: 0 };

export function makeFakeCloud(options: FakeCloudOptions = {}): FakeCloud {
  const listeners = new Set<(event: AuthChangeEvent) => void>();
  const fake: FakeCloud = {
    cloud: undefined as unknown as SupabaseClient,
    row: options.row ?? null,
    session:
      options.session === undefined
        ? { id: '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10', email: 'rick@example.com' }
        : options.session,
    failClaim: 'none',
    failCheck: 'none',
    failReport: 'none',
    limitRetryAt: '2030-01-02T09:30:00Z',
    claims: [],
    rejections: [],
    checks: 0,
    filters: [],
    signOuts: [],
    rpcCalls: [],
    sync: 'off',
    signOutDelay: 0,
    emit: (event) => {
      listeners.forEach((listener) => {
        listener(event);
      });
    },
  };

  const outcome = <T>(failure: FakeFailure, ok: () => T): T | { data: null; error: unknown } => {
    if (failure === 'throw') throw new Error('Failed to fetch');
    if (failure === 'error') return { data: null, error: NETWORK_ERROR };
    return ok();
  };

  const table = (name: string) => {
    const single = (): unknown => {
      if (name === 'device_sessions') {
        fake.checks += 1;
        return outcome(fake.failCheck, () => ({ data: fake.row, error: null }));
      }
      if (name === 'user_roles') return { data: { role: 'student' }, error: null };
      if (name === 'profiles') return { data: { alias: 'Rick' }, error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (name === 'device_sessions') fake.filters.push([column, value]);
        return chain;
      },
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      update: () => chain,
      insert: () => chain,
      maybeSingle: () => Promise.resolve(single()),
      // Esperar la cadena sin maybeSingle devuelve una lista vacía, como una consulta sin filas
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve),
    };
    return chain;
  };

  const client = {
    auth: {
      getSession: () =>
        Promise.resolve({
          data: {
            session: fake.session
              ? {
                  access_token: fakeAccessToken(fake.session.sessionId),
                  user: { id: fake.session.id, email: fake.session.email },
                }
              : null,
          },
        }),
      onAuthStateChange: (listener: (event: AuthChangeEvent) => void) => {
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(listener);
              },
            },
          },
        };
      },
      signOut: (signOutOptions?: unknown) => {
        fake.signOuts.push(signOutOptions);
        // Supabase quita la sesión local y avisa SIGNED_OUT cuando termina de cerrarla
        setTimeout(() => {
          fake.session = null;
          fake.emit('SIGNED_OUT');
        }, fake.signOutDelay);
        return Promise.resolve({ error: null });
      },
    },
    from: table,
    rpc: (name: string, args: { p_device_id: string; p_label: string }) => {
      fake.rpcCalls.push(name);
      if (name.startsWith('sync_') && fake.sync === 'ok') {
        return Promise.resolve({
          data: name === 'sync_clock' ? new Date().toISOString() : 0,
          error: null,
        });
      }
      if (name === 'log_rejected_claim') {
        if (fake.failReport === 'hang') return new Promise(() => undefined);
        return Promise.resolve(
          outcome(fake.failReport, () => {
            fake.rejections.push(args);
            return { data: true, error: null };
          }),
        );
      }
      if (name !== 'claim_device') {
        return Promise.resolve({ data: null, error: { message: `Función ${name} no existe` } });
      }
      if (fake.failClaim === 'limit') {
        return Promise.resolve({
          data: null,
          error: {
            code: 'DV001',
            message: 'Cambiaste de dispositivo demasiadas veces en poco tiempo',
            details: fake.limitRetryAt,
            hint: 'Vuelve a intentarlo a la hora indicada',
          },
        });
      }
      return Promise.resolve(
        outcome(fake.failClaim, () => {
          fake.claims.push(args);
          fake.row = {
            device_id: args.p_device_id,
            label: args.p_label,
            ...(fake.session?.sessionId ? { session_id: fake.session.sessionId } : {}),
          };
          return { data: null, error: null };
        }),
      );
    },
  };
  fake.cloud = client as unknown as SupabaseClient;
  return fake;
}
