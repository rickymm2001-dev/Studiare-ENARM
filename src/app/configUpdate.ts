// Aviso de que el servidor trae una configuración nueva (Fase G, G3). Los motores leen sus umbrales
// al abrir la app, así que la configuración nueva se aplica al recargar. CloudBridge enciende el
// aviso cuando el servidor y este navegador no coinciden, y el marco lo muestra.
import { create } from 'zustand';

export const useConfigUpdate = create<{ pending: boolean; set: (pending: boolean) => void }>()(
  (set) => ({
    pending: false,
    set: (pending) => {
      set({ pending });
    },
  }),
);
