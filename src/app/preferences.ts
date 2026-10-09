// Preferencias de este dispositivo. Viven en localStorage y no en IndexedDB porque hacen falta
// antes de abrir la base y no son datos del alumno (D-036). Se validan con zod al leer.
// El rol es el selector sin login de la pantalla 26. En producción lo dará la cuenta real.
import { z } from 'zod';
import { create } from 'zustand';
import { signOutCloud } from '@/data/cloud/account';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
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
});
export type DevicePreferences = z.infer<typeof DevicePreferencesSchema>;

export const PREFERENCES_STORAGE_KEY = 'enarm.preferences.v1';

export const DEFAULT_PREFERENCES: DevicePreferences = DevicePreferencesSchema.parse({});

export function readStoredPreferences(
  storage: Pick<Storage, 'getItem'> | undefined,
): DevicePreferences {
  try {
    const raw = storage?.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = DevicePreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PREFERENCES;
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
  signIn: (userId: string) => void;
  signOut: () => void;
}

export const usePreferences = create<PreferencesState>()((set, get) => {
  const update = (patch: Partial<DevicePreferences>) => {
    set(patch);
    const { theme, role, database, sessionUserId, appearance } = get();
    writeStoredPreferences({ theme, role, database, sessionUserId, appearance });
  };
  return {
    ...readStoredPreferences(safeLocalStorage()),
    setTheme: (theme) => {
      update({ theme });
    },
    setRole: (role) => {
      update({ role });
    },
    setDatabase: (database) => {
      update({ database });
    },
    setAppearance: (patch) => {
      update({ appearance: { ...get().appearance, ...patch } });
    },
    signIn: (userId) => {
      update({ sessionUserId: userId });
    },
    signOut: () => {
      // Con cuenta en la nube el rol lo da el servidor, así que al salir vuelve a alumno (D-075)
      update(
        cloudConfigured() ? { sessionUserId: null, role: 'student' } : { sessionUserId: null },
      );
      // Si el SDK aún no se bajaba, se espera, para que la sesión de la nube sí se cierre
      void loadCloud().then(signOutCloud);
    },
  };
});
