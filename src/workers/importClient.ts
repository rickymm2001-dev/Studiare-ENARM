// Cliente del worker del importador para la interfaz. Crea el worker bajo demanda, así su código y
// el motor de SQLite no entran al JavaScript inicial (14.4). El archivo viaja al worker sin copiarse.
import { transfer, wrap, type Remote } from 'comlink';
import type { ImportParseResult, ImportWorkerApi } from './importApi';

let remote: Remote<ImportWorkerApi> | null = null;

function importWorker(): Remote<ImportWorkerApi> {
  remote ??= wrap<ImportWorkerApi>(
    new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module', name: 'import' }),
  );
  return remote;
}

export async function parseFileInWorker(file: File): Promise<ImportParseResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return importWorker().parse(file.name, transfer(bytes, [bytes.buffer]));
}
