// API del Web Worker del importador (D-093). Leer un paquete de Anki, una hoja o un documento puede
// tardar y usar mucha memoria, así que ocurre aquí y no en el hilo de la interfaz. Un error se
// devuelve como resultado y no como excepción, porque una excepción cruzaría el worker sin su código.
import { parseImportFile, type ParseDeps } from '@/data/import/parseFile';
import { ImportError, type ImportErrorCode, type ParsedImport } from '@/data/import/types';

export type ImportParseResult =
  { ok: true; parsed: ParsedImport } | { ok: false; code: ImportErrorCode };

export function createImportApi(deps: ParseDeps) {
  return {
    async parse(fileName: string, bytes: Uint8Array): Promise<ImportParseResult> {
      try {
        return { ok: true, parsed: await parseImportFile(fileName, bytes, deps) };
      } catch (error) {
        return { ok: false, code: error instanceof ImportError ? error.code : 'corrupt' };
      }
    },
  };
}

export type ImportWorkerApi = ReturnType<typeof createImportApi>;
