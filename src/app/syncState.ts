// Estado de la sincronización entre dispositivos (D-095). Lo actualiza CloudBridge con el programador
// de sincronización y lo leen las pantallas.
import { create } from 'zustand';
import { INITIAL_SYNC_UI, type SyncUiState } from './syncScheduler';

interface SyncStatusStore {
  state: SyncUiState;
  /** Sincronizar ahora. null mientras no haya sesión en la nube */
  syncNow: (() => Promise<void>) | null;
  set: (state: SyncUiState) => void;
  setSyncNow: (syncNow: (() => Promise<void>) | null) => void;
  reset: () => void;
}

export const useSyncStatus = create<SyncStatusStore>()((set) => ({
  state: INITIAL_SYNC_UI,
  syncNow: null,
  set: (state) => {
    set({ state });
  },
  setSyncNow: (syncNow) => {
    set({ syncNow });
  },
  reset: () => {
    set({ state: INITIAL_SYNC_UI, syncNow: null });
  },
}));
