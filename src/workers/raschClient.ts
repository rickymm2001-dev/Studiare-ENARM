// Cliente del worker de Rasch para la interfaz. Crea el worker bajo demanda, así su código no
// entra al JavaScript inicial (14.4).
import { wrap, type Remote } from 'comlink';
import type { RaschWorkerApi } from './raschApi';

let remote: Remote<RaschWorkerApi> | null = null;

export function raschWorker(): Remote<RaschWorkerApi> {
  remote ??= wrap<RaschWorkerApi>(
    new Worker(new URL('./rasch.worker.ts', import.meta.url), { type: 'module', name: 'rasch' }),
  );
  return remote;
}
