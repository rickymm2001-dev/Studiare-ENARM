// Web Worker del importador (D-093). Carga el motor de SQLite solo cuando llega un paquete de Anki.
import { expose } from 'comlink';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createImportApi } from './importApi';

let engine: ReturnType<typeof initSqlJs> | undefined;

expose(
  createImportApi({
    loadSql: () => {
      engine ??= initSqlJs({ locateFile: () => wasmUrl });
      return engine;
    },
  }),
);
