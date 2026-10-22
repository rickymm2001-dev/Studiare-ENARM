// El aviso de que el alumno pidió ver el recorrido, desde el botón de Configuración (B15, 4.6 del plan de
// B15). El botón vive en una pantalla que se cierra al navegar y el recorrido navega, así que el recorrido
// no puede colgar del botón. El botón deja aquí la petición y TourLauncher, que está en el marco de la app,
// la recoge. Es chico y va en el JavaScript inicial, como TourLauncher.
import { create } from 'zustand';
import type { TourTrigger } from './tourMachine';

interface TourRequestStore {
  /** Cómo se pidió el recorrido, o null si nadie lo ha pedido */
  trigger: TourTrigger | null;
  request: (trigger: TourTrigger) => void;
  clear: () => void;
}

export const useTourRequest = create<TourRequestStore>((set) => ({
  trigger: null,
  request: (trigger) => {
    set({ trigger });
  },
  clear: () => {
    set({ trigger: null });
  },
}));

/** Pide el recorrido desde Configuración. Empieza en el primer paso (4.6) */
export const requestTour = (): void => {
  useTourRequest.getState().request('settings');
};
