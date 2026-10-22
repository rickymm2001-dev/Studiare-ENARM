// Cliente del worker del importador para la interfaz. Crea el worker bajo demanda, así su código y
// el motor de SQLite no entran al JavaScript inicial (14.4). El archivo viaja al worker sin copiarse.
// Un archivo hecho para atorar la lectura no puede dejar la pantalla esperando para siempre. Si la
// lectura pasa del tiempo permitido se termina el worker, que es la única forma de pararlo, y la
// siguiente lectura crea uno nuevo. Un archivo más grande de lo que el importador acepta ni se lee.
import { transfer, wrap } from 'comlink';
import { IMPORT_LIMITS } from '@/data/import/limits';
import type { ImportParseResult, ImportWorkerApi } from './importApi';

/** Cuánto puede tardar la lectura de un archivo antes de cancelarla */
export const IMPORT_TIMEOUT_MS = 90_000;

export interface ImportWorkerHandle {
  remote: { parse: (fileName: string, bytes: Uint8Array) => Promise<ImportParseResult> };
  /** Para el worker de golpe, aunque esté atorado en un ciclo */
  terminate: () => void;
}

interface ClientOptions {
  spawn: () => ImportWorkerHandle;
  timeoutMs?: number;
  /** Tamaño del archivo más grande que se intenta leer */
  maxFileBytes?: number;
}

type ImportFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;

export function createImportClient(options: ClientOptions) {
  const timeoutMs = options.timeoutMs ?? IMPORT_TIMEOUT_MS;
  const maxFileBytes = options.maxFileBytes ?? IMPORT_LIMITS.maxUnpackedBytes;
  let handle: ImportWorkerHandle | null = null;

  const drop = (current: ImportWorkerHandle) => {
    current.terminate();
    if (handle === current) handle = null;
  };

  return {
    async parse(file: ImportFile): Promise<ImportParseResult> {
      // El tamaño se mira antes de leer el archivo a memoria, que es lo que de verdad cuesta
      if (file.size > maxFileBytes) return { ok: false, code: 'too_large' };
      const bytes = new Uint8Array(await file.arrayBuffer());
      handle ??= options.spawn();
      const current = handle;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expired = new Promise<ImportParseResult>((resolve) => {
        timer = setTimeout(() => {
          drop(current);
          resolve({ ok: false, code: 'too_slow' });
        }, timeoutMs);
      });
      try {
        return await Promise.race([
          current.remote.parse(file.name, transfer(bytes, [bytes.buffer])),
          expired,
        ]);
      } catch (error) {
        // Un worker que falló no se reutiliza
        drop(current);
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function spawnWorker(): ImportWorkerHandle {
  const worker = new Worker(new URL('./import.worker.ts', import.meta.url), {
    type: 'module',
    name: 'import',
  });
  return {
    remote: wrap<ImportWorkerApi>(worker),
    terminate: () => {
      worker.terminate();
    },
  };
}

const client = createImportClient({ spawn: spawnWorker });

export const parseFileInWorker = (file: File): Promise<ImportParseResult> => client.parse(file);
