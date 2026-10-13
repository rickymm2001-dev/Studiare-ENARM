// Preferencias de este dispositivo. Viven en localStorage y no en IndexedDB porque hacen falta
// antes de abrir la base y no son datos del alumno (D-036). Se validan con zod al leer.
// El rol es el selector sin login de la pantalla 26. En producción lo dará la cuenta real.
// Sin la bandera demoTools, como en producción, la base es siempre Mi cuenta y el rol no se elige en
// el dispositivo (pregunta 73, 5.4 del plan del cambio, B7).
import { z } from 'zod';
import { create } from 'zustand';
import { isFeatureEnabled } from '@/config/featureFlags';
import { signOutCloud } from '@/data/cloud/account';
import { cloudConfigured, forgetStoredCloudSession, loadCloud } from '@/data/cloud/client';
import { RoleSchema } from '@/data/schemas/common';
import { AppearanceSchema, DEFAULT_APPEARANCE } from '@/ui/appearance';
import { THEME_PREFERENCES } from '@/ui/theme';

export const DevicePreferencesSchema = z.object({
  theme: z.enum(THEME_PREFERENCES).catch('system'),
  role: RoleSchema.catch('student'),
  /** Base activa. real es Mi cuenta (enarm_real) y demo es Demostración (enarm_demo), D-024 */
  database: z.enum(['real', 'demo']).catch('real'),
  /**
   * Perfil con sesión abierta en Mi cuenta. Inicio de sesión simulado y local, sin contraseña
   * (3.2). En producción lo dará la cuenta real. En la demo siempre es el alumno de demostración
   */
  sessionUserId: z.string().max(40).nullable().catch(null),
  /** Fuente, tamaño, fondo y movimiento que elige el alumno (D-061) */
  appearance: AppearanceSchema.catch(DEFAULT_APPEARANCE),
  /** Riel lateral oculto en computadora con el botón de menú (D-117). Es comodidad de esta pantalla */
  navCollapsed: z.boolean().catch(false),
});
export type DevicePreferences = z.infer<typeof DevicePreferencesSchema>;

export const PREFERENCES_STORAGE_KEY = 'enarm.preferences.v1';

export const DEFAULT_PREFERENCES: DevicePreferences = DevicePreferencesSchema.parse({});

/** Lo que decide qué preferencias valen en este entorno. Las pruebas lo pasan a mano */
export interface PreferenceGuards {
  /** La bandera demoTools. Apagada en producción, donde no se llega a la base de demostración */
  demoTools: boolean;
  /** Con la nube el rol lo da el servidor (D-075, D-108) */
  cloud: boolean;
}

const currentGuards = (): PreferenceGuards => ({
  demoTools: isFeatureEnabled('demoTools'),
  cloud: cloudConfigured(),
});

/**
 * La base que vale en este entorno (pregunta 73, 5.4). Sin la bandera demoTools es siempre Mi cuenta,
 * aunque el navegador guarde Demostración o alguien la pida
 */
export function allowedDatabase(
  database: DevicePreferences['database'],
  guards: PreferenceGuards = currentGuards(),
): DevicePreferences['database'] {
  return guards.demoTools ? database : 'real';
}

/**
 * El rol que vale en este entorno. Sin la bandera demoTools ni la nube es alumno, porque con el
 * selector cerrado nadie pudo elegir otro. Con la nube el rol guardado es el último que dio el servidor
 * y se queda mientras vuelve a verificarse (D-108)
 */
export function allowedRole(
  role: DevicePreferences['role'],
  guards: PreferenceGuards = currentGuards(),
): DevicePreferences['role'] {
  return guards.demoTools || guards.cloud ? role : 'student';
}

/** Las preferencias con lo que no puede valer en este entorno ya corregido */
export function guardPreferences(
  prefs: DevicePreferences,
  guards: PreferenceGuards = currentGuards(),
): DevicePreferences {
  return {
    ...prefs,
    database: allowedDatabase(prefs.database, guards),
    role: allowedRole(prefs.role, guards),
  };
}

export function readStoredPreferences(
  storage: Pick<Storage, 'getItem'> | undefined,
  guards: PreferenceGuards = currentGuards(),
): DevicePreferences {
  try {
    const raw = storage?.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = DevicePreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? guardPreferences(parsed.data, guards) : DEFAULT_PREFERENCES;
  } catch {
    // Almacenamiento bloqueado o JSON corrupto. La app sigue con los valores por defecto
    return DEFAULT_PREFERENCES;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function writeStoredPreferences(prefs: DevicePreferences): void {
  try {
    safeLocalStorage()?.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ventana privada o almacenamiento lleno. La preferencia dura solo esta sesión
  }
}

interface PreferencesState extends DevicePreferences {
  setTheme: (theme: DevicePreferences['theme']) => void;
  setRole: (role: DevicePreferences['role']) => void;
  setDatabase: (database: DevicePreferences['database']) => void;
  setAppearance: (patch: Partial<DevicePreferences['appearance']>) => void;
  setNavCollapsed: (navCollapsed: boolean) => void;
  signIn: (userId: string) => void;
  signOut: () => void;
}

export const usePreferences = create<PreferencesState>()((set, get) => {
  const update = (patch: Partial<DevicePreferences>) => {
    set(patch);
    const { theme, role, database, sessionUserId, appearance, navCollapsed } = get();
    writeStoredPreferences({ theme, role, database, sessionUserId, appearance, navCollapsed });
  };
  return {
    ...readStoredPreferences(safeLocalStorage()),
    setTheme: (theme) => {
      update({ theme });
    },
    setRole: (role) => {
      update({ role: allowedRole(role) });
    },
    setDatabase: (database) => {
      // Sin la bandera demoTools ningún botón ni enlace lleva a la base de demostración (5.4)
      update({ database: allowedDatabase(database) });
    },
    setAppearance: (patch) => {
      update({ appearance: { ...get().appearance, ...patch } });
    },
    setNavCollapsed: (navCollapsed) => {
      update({ navCollapsed });
    },
    signIn: (userId) => {
      update({ sessionUserId: userId });
    },
    signOut: () => {
      // Con cuenta en la nube el rol lo da el servidor, así que al salir vuelve a alumno (D-075)
      update(
        cloudConfigured() ? { sessionUserId: null, role: 'student' } : { sessionUserId: null },
      );
      // Si el SDK aún no se bajaba, se espera, para que la sesión de la nube sí se cierre. Si no
      // se pudo bajar, se quita la sesión guardada para que no vuelva a abrirse sola
      void loadCloud().then(async (cloud) => {
        if (cloud) {
          await signOutCloud(cloud);
          return;
        }
        const storage = safeLocalStorage();
        if (cloudConfigured() && storage) forgetStoredCloudSession(storage);
      });
    },
  };
});
