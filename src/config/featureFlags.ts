// Banderas de lanzamiento (plan del cambio V3, bloque B0, D-119). Sirven para esconder en producción
// lo que todavía es de la demostración y para prender por partes lo nuevo, sin borrar código. Cada
// bandera trae un valor por entorno (desarrollo, demo publicada y producción). El servidor puede
// cambiarlo en platform_settings, clave feature_flags, que el admin escribe y todos leen. Cada
// navegador guarda una copia en localStorage que se aplica al abrir la app, igual que los umbrales
// del admin (D-105). Sin dependencias de otros archivos de configuración para que cualquiera la lea.
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

interface FlagDef {
  /** Para qué sirve, en una línea */
  description: string;
  defaults: Record<AppEnv, boolean>;
}

/** Las banderas que existen. Agregar una es agregar una entrada aquí y consultarla donde haga falta */
export const FEATURE_FLAGS = {
  demoTools: {
    description:
      'Pantalla Datos de demostración, su panel y el selector de base de demostración (5.4 del plan del cambio). En producción se esconden',
    defaults: { development: true, demo: true, production: false },
  },
  demoBank: {
    description:
      'Aviso global Versión de demostración mientras la app usa el banco de demostración (4.1 del plan del cambio). Se apaga cuando llega el banco real (B11)',
    defaults: { development: true, demo: true, production: true },
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
 * Si la bandera está prendida. Lo que dice el servidor (la copia guardada) manda. Sin eso, el valor
 * del entorno. Las pruebas pasan el entorno y la copia a mano
 */
export function isFeatureEnabled(
  name: FeatureFlag,
  options: { appEnv?: AppEnv; stored?: StoredFlags | null } = {},
): boolean {
  const stored = options.stored === undefined ? readStoredFlags() : options.stored;
  const fromServer = stored?.[name];
  if (typeof fromServer === 'boolean') return fromServer;
  return FEATURE_FLAGS[name].defaults[options.appEnv ?? readAppEnv()];
}
