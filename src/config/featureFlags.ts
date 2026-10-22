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
  // Prueba gratis de 7 días con tarjeta (respuestas 18 y 20, B10). El servidor la hace cumplir con
  // la misma clave de feature_flags, porque trial_available da false para todos si está apagada, y
  // entonces create-checkout no abre ninguna prueba. En la app prende el texto Prueba 7 días gratis
  // en la portada y en los candados de Gratis, estos solo para quien todavía puede tenerla según
  // trialAvailable de my_plan. En producción se prende desde el servidor después de la corrida real
  // en modo prueba
  freeTrial: {
    description: 'Prueba gratis de 7 días con tarjeta (respuestas 18 y 20, B10)',
    defaults: { development: true, demo: false, production: false },
  },
  // Pases de 1 mes o 1 año con OXXO y SPEI en la forma de pago (B10, 4.4). El servidor también la
  // hace cumplir y create-checkout responde not_configured si está apagada. Se prende cuando Stripe
  // tenga los dos métodos activados y pasen la corrida real
  cashPasses: {
    description: 'Pases de 1 mes o 1 año con OXXO y SPEI en la forma de pago (B10, 4.4)',
    defaults: { development: true, demo: false, production: false },
  },
  // Suscripción y pago único con Mercado Pago en la forma de pago (respuesta 8, B10). El servidor
  // también la hace cumplir y create-checkout responde not_configured si está apagada. Se prende
  // con la cuenta de Mercado Pago y su función de avisos desplegada
  mercadoPago: {
    description: 'Suscripción y pago único con Mercado Pago en la forma de pago (respuesta 8, B10)',
    defaults: { development: false, demo: false, production: false },
  },
  paymentsTestMode: {
    description:
      'Aviso de modo prueba en la forma de pago, para usar una tarjeta de prueba de la pasarela (B10). Se apaga al pasar los pagos a modo real',
    defaults: { development: true, demo: true, production: true },
  },
  // Botón Continuar con Google en la bienvenida (B9, respuesta 26). Apagado en todos lados hasta
  // que el proveedor de Google esté configurado en Supabase, porque sin él el botón lleva a una
  // página de error
  googleSignIn: {
    description: 'Botón Continuar con Google en la bienvenida (B9, respuesta 26)',
    defaults: { development: false, demo: false, production: false },
  },
  // Segundo factor obligatorio para médicos, admins y dueño (B9, respuesta 30). El servidor lee la
  // misma bandera en feature_flags.requireMfa y sin sesión aal2 no les da su rol en los permisos
  // por fila. Apagada en todos lados, igual que en el servidor sin la clave
  requireMfa: {
    description: 'Segundo factor obligatorio para médicos, admins y dueño (B9, respuesta 30)',
    defaults: { development: false, demo: false, production: false },
  },
  // Los alumnos estudian con el banco de la nube (B11, respuestas 56 y 68). La prende Ricardo en el
  // servidor cuando haya 300 preguntas aprobadas. La base la lee también con
  // bank_open_for_students, así una copia manipulada no abre el banco antes
  cloudBank: {
    description: 'Los alumnos estudian con el banco de la nube (B11, respuestas 56 y 68)',
    defaults: { development: false, demo: false, production: false },
  },
  // Tarjeta de Inglés médico en Simular, la parte en inglés del examen completo y la tarjeta de
  // Inglés médico en Progreso (B13, respuesta 61). Prendida en desarrollo y en la demo, para verla
  // con los casos de prueba. Apagada en producción, porque sin casos publicados ni el mazo de
  // vocabulario solo diría Sin textos. Ricardo la prende desde platform_settings, clave
  // feature_flags, cuando haya casos y mazo. Apagada, el examen completo es solo en español
  medicalEnglish: {
    description:
      'Inglés médico en Simular y en Progreso, y la parte en inglés del examen completo (B13)',
    defaults: { development: true, demo: true, production: false },
  },
  // El catálogo de mazos precargados sale de Supabase Storage, por submazo y para los planes de
  // pago (B11, 4.21 y 4.25 del plan del cambio). En la demo y en desarrollo siguen los mazos
  // empacados
  deckCatalogCloud: {
    description:
      'El catálogo de mazos precargados sale de Supabase Storage, para los planes de pago (B11)',
    defaults: { development: false, demo: false, production: true },
  },
  // Medición de uso con PostHog (B15, respuesta 78). Prendida en producción, pero sin la llave
  // VITE_POSTHOG_KEY y sin el permiso Medición de uso del alumno no sale ni un evento. Apagada en
  // desarrollo y en la demo, que nunca miden
  productAnalytics: {
    description:
      'Medición de uso con PostHog (B15). Sin llave y sin permiso del alumno no sale ni un evento',
    defaults: { development: false, demo: false, production: true },
  },
  // Destino Sentry del reporte de errores del navegador (B15, respuesta 79). Prendida en
  // producción, pero sin VITE_SENTRY_DSN y sin el permiso de mejora con tus datos sin nombre no
  // sale ni un reporte. El destino Supabase de siempre no depende de esta bandera
  errorMonitoring: {
    description:
      'Destino Sentry del reporte de errores del navegador (B15). Sin DSN y sin permiso no sale nada',
    defaults: { development: false, demo: false, production: true },
  },
  // Recorrido guiado de ocho pasos al entrar por primera vez y el botón Ver el recorrido en
  // Configuración (B15, respuesta 80). No usa ningún servicio de fuera
  guidedTour: {
    description:
      'Recorrido guiado de ocho pasos y el botón Ver el recorrido en Configuración (B15)',
    defaults: { development: true, demo: true, production: true },
  },
  // Sección Recordatorios por correo en Ajustes del repaso (B15, respuesta 81). Prendida en
  // desarrollo para verla. En producción la prende el servidor cuando Resend y el dominio funcionen
  // y email_delivery esté prendido
  emailReminders: {
    description:
      'Sección Recordatorios por correo en Ajustes del repaso (B15). La prende el servidor',
    defaults: { development: true, demo: false, production: false },
  },
  // Botones de un toque de Apple Pay y Google Pay dentro de Suscripción, con Stripe.js cargado solo ahí
  // (B17, 6.6, comentario 19 y 4.29 del plan del cambio). Apagada en los tres entornos. Se prende en modo
  // prueba escribiendo platform_settings, clave feature_flags, con el SQL de docs/STRIPE.md (ninguna pantalla del
  // admin cambia banderas, el módulo del Banco solo cambia cloudBank), después de las pruebas en teléfonos reales
  // (W1 a W8). Es solo de cliente: create-checkout acepta ui wallet sin consultarla, porque solo cambia el modo de
  // la pantalla de pago y no concede nada nuevo (misma suscripción, mismo precio, misma prueba y mismo aviso de
  // Stripe). Por eso "apagada" no es una orden del servidor: quien prenda la copia de banderas de su propio
  // navegador puede cargar Stripe.js y abrir sesiones de ese modo. Sin la llave VITE_STRIPE_PUBLISHABLE_KEY la
  // sección no aparece aunque la bandera esté prendida, y la política de seguridad no abre Stripe. Apagada no se
  // pierde nada: el Checkout hospedado de Stripe sigue mostrando Apple Pay y Google Pay solo en los aparatos que
  // los tienen
  expressWallets: {
    description:
      'Botones de un toque de Apple Pay y Google Pay en Suscripción, con Stripe.js (B17). Se prende con el SQL de docs/STRIPE.md y el servidor no la consulta',
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
