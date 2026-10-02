// Cliente del worker de simulación. Se crea bajo demanda, así el generador y el banco demo no
// entran al JavaScript inicial (14.4).
import { wrap, type Remote } from 'comlink';
import type { SimulateWorkerApi } from './simulateApi';

let remote: Remote<SimulateWorkerApi> | null = null;

export function simulateWorker(): Remote<SimulateWorkerApi> {
  remote ??= wrap<SimulateWorkerApi>(
    new Worker(new URL('./simulate.worker.ts', import.meta.url), {
      type: 'module',
      name: 'simulate',
    }),
  );
  return remote;
}
