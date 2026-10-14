// Banderas de lanzamiento (plan del cambio V3, bloque B0, D-119). Sirven para esconder en producción
// lo que todavía es de la demostración y para prender por partes lo nuevo, sin borrar código. Cada
// bandera trae un valor por entorno (desarrollo, demo publicada y producción). El servidor puede
// cambiarlo en platform_settings, clave feature_flags, que el admin escribe y todos leen. Cada
// navegador guarda una copia en localStorage que se aplica al abrir la app, igual que los umbrales
// del admin (D-105). Esa copia la puede escribir cualquiera desde su navegador, así que una bandera
// con remoteEnable en false, como demoTools, en producción solo se puede apagar desde la copia, nunca
// prender. Sin dependencias de otros archivos de configuración para que cualquiera la lea.
import { z } from 'zod';

export const APP_ENVS = ['development', 'demo', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * En qué entorno corre la app. Se fija al construir con VITE_APP_ENV. Sin la variable, un build de
 * producción es la demo publicada (hoy GitHub Pages) y lo demás es desarrollo. Producción se declara
 * a propósito al publicar, para que ningún despliegue esconda la demo por accidente
 */
export function readAppEnv(env: Record<string, unknown> = import.meta.env): AppEnv {
  const raw = typeof env.VITE_APP_ENV === 'string' ? env.VITE_APP_ENV.trim() : '';
  if ((APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
  return env.PROD === true ? 'demo' : 'development';
}

export interface FlagDef {
  /** Para qué sirve, en una línea */
  description: string;
  defaults: Record<AppEnv, boolean>;
  /**
   * false si en producción el servidor o la copia del navegador solo pueden apagarla. Es para lo que
   * abre la demostración, que nadie debe prender escribiendo en localStorage. Sin el campo, la copia
   * manda en los dos sentidos, como en las banderas que se prenden desde platform_settings
   */
  remoteEnable?: boolean;
}

/** Las banderas que existen. Agregar una es agregar una entrada aquí y consultarla donde haga falta */
export const FEATURE_FLAGS = {
  demoTools: {
    description:
      'Pantalla Datos de demostración, su panel y el selector de base de demostración (5.4 del plan del cambio). En producción se esconden',
    defaults: { development: true, demo: true, production: false },
    // En producción no hay forma de llegar a los datos de demostración (B7). La copia solo la apaga
    remoteEnable: false,
  },
  demoBank: {
    description:
      'Aviso global Versión de demostración mientras la app usa el banco de demostración (4.1 del plan del cambio). Se apaga cuando llega el banco real (B11)',
    defaults: { development: true, demo: true, production: true },
  },
  freeTrial: {
    description:
      'Prueba gratis de 7 días en el botón de los candados de Gratis, como Apuntes, Party e Importar mazos (respuesta 20). Apagada hasta que B10 crea la prueba en Suscripción y la prende',
    defaults: { development: false, demo: false, production: false },
  },
  googleSignIn: {
    description:
      'Botón Continuar con Google en la bienvenida (B9, respuesta 26). Apagado en todos lados hasta que el proveedor de Google esté configurado en Supabase, porque sin él el botón lleva a una página de error',
    defaults: { development: false, demo: false, production: false },
  },
  requireMfa: {
    description:
      'Segundo factor obligatorio para médicos, admins y dueño (B9, respuesta 30). El servidor lee la misma bandera en feature_flags.requireMfa y sin sesión aal2 no les da su rol en los permisos por fila. Apagada en todos lados, igual que en el servidor sin la clave',
    defaults: { development: false, demo: false, production: false },
  },
} as const satisfies Record<string, FlagDef>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;
export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlag[];

export const FLAGS_KEY = 'enarm.feature-flags.v1';

/**
 * Lo que se guarda en el servidor y en el navegador. Cada bandera conocida, true o false. Una bandera
 * que este build no conoce se ignora, así un servidor más nuevo no rompe una app vieja. Un valor que
 * no es booleano invalida todo el objeto
 */
export const StoredFlagsSchema = z.object(
  Object.fromEntries(FEATURE_FLAG_NAMES.map((name) => [name, z.boolean().optional()])) as Record<
    FeatureFlag,
    z.ZodOptional<z.ZodBoolean>
  >,
);
export type StoredFlags = z.infer<typeof StoredFlagsSchema>;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // El navegador puede negar el acceso, por ejemplo en una ventana privada
    return null;
  }
}

/** Las banderas copiadas del servidor a este navegador. null si no hay copia o no se puede leer */
export function readStoredFlags(): StoredFlags | null {
  try {
    const raw = storage()?.getItem(FLAGS_KEY);
    if (!raw) return null;
    const parsed = StoredFlagsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Guarda la copia. null la borra y deja los valores del entorno. Devuelve si pudo guardar */
export function writeStoredFlags(value: StoredFlags | null): boolean {
  try {
    const target = storage();
    if (!target) return false;
    if (value === null) target.removeItem(FLAGS_KEY);
    else target.setItem(FLAGS_KEY, JSON.stringify(StoredFlagsSchema.parse(value)));
    return true;
  } catch {
    return false;
  }
}

/**
 * El valor de una bandera. Lo que dice el servidor (la copia guardada) manda sobre el del entorno,
 * salvo en producción con remoteEnable en false, donde la copia solo puede apagarla
 */
export function resolveFlag(flag: FlagDef, appEnv: AppEnv, stored: boolean | undefined): boolean {
  const fallback = flag.defaults[appEnv];
  if (typeof stored !== 'boolean') return fallback;
  if (appEnv === 'production' && flag.remoteEnable === false) return fallback && stored;
  return stored;
}

/**
 * Si la bandera está prendida. Lo que dice el servidor (la copia guardada) manda. Sin eso, el valor
 * del entorno. Las pruebas pasan el entorno y la copia a mano
 */
export function isFeatureEnabled(
  name: FeatureFlag,
  options: { appEnv?: AppEnv; stored?: StoredFlags | null } = {},
): boolean {
  const stored = options.stored === undefined ? readStoredFlags() : options.stored;
  return resolveFlag(FEATURE_FLAGS[name], options.appEnv ?? readAppEnv(), stored?.[name]);
}
