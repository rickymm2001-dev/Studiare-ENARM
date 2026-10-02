// Preferencias de este dispositivo. Viven en localStorage y no en IndexedDB porque hacen falta
// antes de abrir la base y no son datos del alumno (D-036). Se validan con zod al leer.
import { z } from 'zod';
import { create } from 'zustand';
import { THEME_PREFERENCES } from '@/ui/theme';

export const ThemePreferenceSchema = z.enum(THEME_PREFERENCES);

export const DevicePreferencesSchema = z.object({
  theme: ThemePreferenceSchema.catch('system'),
});
export type DevicePreferences = z.infer<typeof DevicePreferencesSchema>;

export const PREFERENCES_STORAGE_KEY = 'enarm.preferences.v1';

const DEFAULT_PREFERENCES: DevicePreferences = DevicePreferencesSchema.parse({});

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

function writeStoredPreferences(prefs: DevicePreferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ventana privada o almacenamiento lleno. La preferencia dura solo esta sesión
  }
}

interface PreferencesState extends DevicePreferences {
  setTheme: (theme: DevicePreferences['theme']) => void;
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export const usePreferences = create<PreferencesState>()((set, get) => ({
  ...readStoredPreferences(safeLocalStorage()),
  setTheme: (theme) => {
    set({ theme });
    writeStoredPreferences({ theme: get().theme });
  },
}));
