// Cliente de Supabase falso para las pruebas del dispositivo único y de CloudBridge. Imita solo lo
// que usa la app. claim_device guarda el dispositivo como lo haría el servidor, con el session_id
// del token, y device_sessions devuelve esa fila. Puede rechazar el reclamo por el límite de cambios
// con el mismo error que lanza la base. También imita Storage para la foto de perfil (B2), con los
// objetos en memoria, la fila de private_accounts y Party en la nube (B7), con las funciones party_* a
// nombre de la sesión abierta. Solo lo usan las pruebas.
import type { AuthChangeEvent, SupabaseClient } from '@supabase/supabase-js';
import { createFakePartyServer, type FakePartyServer } from './fakePartyServer';

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
  /** Rol que tiene la cuenta en user_roles */
  role: 'student' | 'physician' | 'admin' | 'owner';
  /** Cómo falla la lectura del rol. error responde con error de red y throw lanza la excepción */
  failRole: FakeFailure;
  /** Con true, leer la sesión falla por falta de red, como con el token vencido y sin conexión */
  failSession: boolean;
  /** Valor de la clave admin_overrides en platform_settings. null si el admin no ha cambiado nada */
  overrides: unknown;
  /** Valor de la clave feature_flags en platform_settings. null si el servidor no fija banderas */
  flags: unknown;
  /** Versiones del aviso de privacidad que la app registró como aceptadas, en orden */
  acceptances: string[];
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
  /**
   * Con true, signOut no termina solo. La prueba decide cuándo, con releaseSignOut, y así no
   * depende de que un temporizador gane una carrera cuando la máquina está cargada
   */
  holdSignOut: boolean;
  /** Termina los signOut detenidos por holdSignOut, quita la sesión y avisa SIGNED_OUT */
  releaseSignOut: () => void;
  /** Correos que se pidieron con signInWithOtp, en orden */
  otpRequests: { email: string }[];
  /** Código que acepta verifyOtp. Al aceptarlo abre la sesión de codeSession y avisa SIGNED_IN */
  validCode: string;
  codeSession: FakeSession;
  /** Fila de private_accounts que devuelve el servidor al leer la cuenta. null si no hay */
  remoteAccount: Record<string, unknown> | null;
  /** Filas que la app mandó a private_accounts con update, en orden */
  accountUpdates: Record<string, unknown>[];
  /** Objetos de Storage por bucket/ruta, como avatars/<authId>/avatar.jpg */
  objects: Map<string, Blob>;
  /** Cómo falla Storage. error responde con error y throw lanza la excepción */
  failStorage: FakeFailure;
  /** Llamadas a Storage en orden, como upload:avatars/ruta, download:avatars/ruta o remove:avatars/ruta */
  storageCalls: string[];
  /** Dispara un evento de Supabase Auth como si hubiera pasado en el navegador */
  emit: (event: AuthChangeEvent) => void;
  /**
   * Party en la nube (B7). Las funciones party_* van a nombre de session.id, así una prueba cambia de
   * alumno cambiando la sesión
   */
  party: FakePartyServer;
  /** Alias de cada cuenta en profiles. Sin entrada, la cuenta se llama Rick, como el perfil de la sesión */
  aliases: Map<string, string>;
  /** Cómo fallan las funciones de Party. error responde con error de red y throw lanza la excepción */
  failParty: FakeFailure;
}

const NETWORK_ERROR = { message: 'Failed to fetch', status: 0 };

export function makeFakeCloud(options: FakeCloudOptions = {}): FakeCloud {
  const listeners = new Set<(event: AuthChangeEvent) => void>();
  // Cierres de sesión detenidos por holdSignOut, en orden
  const heldSignOuts: (() => void)[] = [];
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
    role: 'student',
    failRole: 'none',
    failSession: false,
    overrides: null,
    flags: null,
    acceptances: [],
    claims: [],
    rejections: [],
    checks: 0,
    filters: [],
    signOuts: [],
    rpcCalls: [],
    sync: 'off',
    signOutDelay: 0,
    holdSignOut: false,
    releaseSignOut: () => {
      for (const finish of heldSignOuts.splice(0)) finish();
    },
    otpRequests: [],
    validCode: '123456',
    codeSession: { id: '6f1c0f1e-6b4a-4d2a-9d55-6f2f3f6a1b10', email: 'rick@example.com' },
    remoteAccount: null,
    accountUpdates: [],
    objects: new Map(),
    failStorage: 'none',
    storageCalls: [],
    emit: (event) => {
      listeners.forEach((listener) => {
        listener(event);
      });
    },
    party: createFakePartyServer({ aliasOf: (userId) => fake.aliases.get(userId) ?? 'Rick' }),
    aliases: new Map(),
    failParty: 'none',
  };

  const outcome = <T>(failure: FakeFailure, ok: () => T): T | { data: null; error: unknown } => {
    if (failure === 'throw') throw new Error('Failed to fetch');
    if (failure === 'error') return { data: null, error: NETWORK_ERROR };
    return ok();
  };

  const table = (name: string) => {
    // La clave que pidió la consulta a platform_settings, para servir la fila que toca
    let settingKey: unknown = null;
    const single = (): unknown => {
      if (name === 'device_sessions') {
        fake.checks += 1;
        return outcome(fake.failCheck, () => ({ data: fake.row, error: null }));
      }
      if (name === 'user_roles') {
        return outcome(fake.failRole, () => ({ data: { role: fake.role }, error: null }));
      }
      if (name === 'profiles') return { data: { alias: 'Rick' }, error: null };
      if (name === 'private_accounts') return { data: fake.remoteAccount, error: null };
      if (name === 'platform_settings') {
        const value = settingKey === 'feature_flags' ? fake.flags : fake.overrides;
        return { data: value === null ? null : { value }, error: null };
      }
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        if (name === 'device_sessions') fake.filters.push([column, value]);
        if (name === 'platform_settings' && column === 'key') settingKey = value;
        return chain;
      },
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      update: (row: Record<string, unknown>) => {
        if (name === 'private_accounts') fake.accountUpdates.push(row);
        return chain;
      },
      insert: (row: { notice_version?: unknown }) => {
        if (name === 'privacy_acceptances' && typeof row.notice_version === 'string') {
          fake.acceptances.push(row.notice_version);
        }
        return chain;
      },
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
          error: fake.failSession
            ? { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }
            : null,
          data: {
            session:
              fake.session && !fake.failSession
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
      signInWithOtp: (params: { email: string }) => {
        fake.otpRequests.push({ email: params.email });
        return Promise.resolve({ data: {}, error: null });
      },
      // Como Supabase, un código correcto deja la sesión guardada y avisa SIGNED_IN
      verifyOtp: (params: { email: string; token: string }) => {
        if (params.token !== fake.validCode || params.email !== fake.codeSession.email) {
          return Promise.resolve({
            data: { session: null, user: null },
            error: { status: 403, code: 'otp_expired', message: 'Token has expired or is invalid' },
          });
        }
        fake.session = fake.codeSession;
        setTimeout(() => {
          fake.emit('SIGNED_IN');
        }, 0);
        return Promise.resolve({
          data: {
            session: { access_token: fakeAccessToken(fake.codeSession.sessionId) },
            user: { id: fake.codeSession.id, email: fake.codeSession.email },
          },
          error: null,
        });
      },
      signOut: (signOutOptions?: unknown) => {
        fake.signOuts.push(signOutOptions);
        // Supabase quita la sesión local y avisa SIGNED_OUT cuando termina de cerrarla
        const finish = () => {
          fake.session = null;
          fake.emit('SIGNED_OUT');
        };
        if (fake.holdSignOut) heldSignOuts.push(finish);
        else setTimeout(finish, fake.signOutDelay);
        return Promise.resolve({ error: null });
      },
    },
    from: table,
    // Storage guarda los objetos en memoria. Como el real, upload con upsert reemplaza, download
    // responde con error si el objeto no existe y remove quita lo que haya
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, body: Blob) => {
          fake.storageCalls.push(`upload:${bucket}/${path}`);
          return Promise.resolve(
            outcome(fake.failStorage, () => {
              fake.objects.set(`${bucket}/${path}`, body);
              return { data: { id: path, path, fullPath: `${bucket}/${path}` }, error: null };
            }),
          );
        },
        download: (path: string) => {
          fake.storageCalls.push(`download:${bucket}/${path}`);
          return Promise.resolve(
            outcome(fake.failStorage, () => {
              const blob = fake.objects.get(`${bucket}/${path}`);
              return blob
                ? { data: blob, error: null }
                : { data: null, error: { message: 'Object not found', status: 404 } };
            }),
          );
        },
        remove: (paths: string[]) => {
          for (const path of paths) fake.storageCalls.push(`remove:${bucket}/${path}`);
          return Promise.resolve(
            outcome(fake.failStorage, () => {
              for (const path of paths) fake.objects.delete(`${bucket}/${path}`);
              return { data: [], error: null };
            }),
          );
        },
      }),
    },
    rpc: (name: string, rawArgs?: Record<string, unknown>) => {
      fake.rpcCalls.push(name);
      const args = (rawArgs ?? {}) as { p_device_id: string; p_label: string };
      if (name.startsWith('party_')) {
        return Promise.resolve(
          outcome(fake.failParty, () => {
            if (!fake.session) {
              return { data: null, error: { code: '28000', message: 'Hace falta iniciar sesión' } };
            }
            const reply = fake.party.call(name, fake.session.id, rawArgs ?? {});
            if (reply === null) {
              return {
                data: null,
                error: { code: 'PGRST202', message: `Función ${name} no existe` },
              };
            }
            return 'error' in reply
              ? { data: null, error: reply.error }
              : { data: reply.data, error: null };
          }),
        );
      }
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
