// Estado de la sincronización entre dispositivos (D-095). Lo actualiza CloudBridge con el programador
// de sincronización y lo leen las pantallas.
import { create } from 'zustand';
import { INITIAL_SYNC_UI, type SyncUiState } from './syncScheduler';

interface SyncStatusStore {
  state: SyncUiState;
  /** Sincronizar ahora. null mientras no haya sesión en la nube */
  syncNow: (() => Promise<void>) | null;
  /** Mientras es true no arranca ninguna sincronización. Borrar los datos de la nube lo enciende */
  paused: boolean;
  set: (state: SyncUiState) => void;
  setSyncNow: (syncNow: (() => Promise<void>) | null) => void;
  reset: () => void;
}

/**
 * Frena la sincronización y espera a que termine la que esté corriendo, hasta timeoutMs. Se usa
 * antes de borrar la copia en la nube, para que una subida a medias no la vuelva a llenar
 */
export async function pauseSync(timeoutMs = 10_000): Promise<void> {
  useSyncStatus.setState({ paused: true });
  const start = Date.now();
  while (useSyncStatus.getState().state.running && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Deja seguir a la sincronización, por ejemplo si el borrado falló, y arranca una enseguida */
export function resumeSync(): void {
  useSyncStatus.setState({ paused: false });
  void useSyncStatus.getState().syncNow?.();
}

export const useSyncStatus = create<SyncStatusStore>()((set) => ({
  state: INITIAL_SYNC_UI,
  syncNow: null,
  paused: false,
  set: (state) => {
    set({ state });
  },
  setSyncNow: (syncNow) => {
    set({ syncNow });
  },
  reset: () => {
    set({ state: INITIAL_SYNC_UI, syncNow: null, paused: false });
  },
}));
