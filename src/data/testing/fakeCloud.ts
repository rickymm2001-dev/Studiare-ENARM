// Cliente de Supabase falso para las pruebas del dispositivo único y de CloudBridge. Imita solo lo
// que usa la app. claim_device guarda el dispositivo como lo haría el servidor y device_sessions
// devuelve esa fila. Solo lo usan las pruebas.
import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';

export interface FakeCloudOptions {
  /** Fila inicial de device_sessions. null si nadie ha reclamado la cuenta */
  row?: { device_id: string; label?: string } | null;
  /** Sesión de Supabase. null para simular que no hay sesión */
  session?: { id: string; email: string } | null;
}

export type FakeFailure = 'none' | 'error' | 'throw';

export interface FakeCloud {
  cloud: SupabaseClient;
  /** Fila que tendría el servidor en device_sessions */
  row: { device_id: string; label?: string } | null;
  session: { id: string; email: string } | null;
  /** Cómo falla cada llamada. error responde con error de red y throw lanza la excepción */
  failClaim: FakeFailure;
  failCheck: FakeFailure;
  claims: { p_device_id: string; p_label: string }[];
  /** Cuántas veces se leyó device_sessions y con qué filtros */
  checks: number;
  filters: [column: string, value: unknown][];
  signOuts: unknown[];
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
    claims: [],
    checks: 0,
    filters: [],
    signOuts: [],
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
              ? { user: { id: fake.session.id, email: fake.session.email } }
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
      if (name !== 'claim_device') {
        return Promise.resolve({ data: null, error: { message: `Función ${name} no existe` } });
      }
      return Promise.resolve(
        outcome(fake.failClaim, () => {
          fake.claims.push(args);
          fake.row = { device_id: args.p_device_id, label: args.p_label };
          return { data: null, error: null };
        }),
      );
    },
  };
  fake.cloud = client as unknown as SupabaseClient;
  return fake;
}
