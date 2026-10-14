// Base de mentira para correr bank-sync sin Supabase (B11). La usan las pruebas de la función, la
// prueba de oro y npm run bank:fixture. Guarda lo que la función le manda y responde lo que respondería
// bank_sync_apply en solo reporte, el resultado esperado de cada decisión. No escribe preguntas.
import type { VersionContent } from './generated/contentHash.ts';
import type { SyncApplyResult, SyncRowPayload } from './generated/contracts.ts';
import { expectedOutcome, type KnownQuestion } from './plan.ts';
import type { BankSyncStore, BeginResult, FinishInput, SyncTarget, SyncTrigger } from './sync.ts';

export interface MemoryStore extends BankSyncStore {
  begins: { trigger: SyncTrigger; target: SyncTarget; actorId: string | null }[];
  applied: { runId: string; rows: SyncRowPayload[]; forceDryRun: boolean }[];
  finished: { runId: string; input: FinishInput }[];
  /** Versiones que pidió comparar */
  compared: string[];
}

export interface MemoryStoreOptions {
  /** Lo que respondería bank_sync_begin, salvo la corrida */
  begin?: Partial<BeginResult>;
  known?: KnownQuestion[];
  contents?: ReadonlyMap<string, VersionContent>;
}

export function createMemoryStore(options: MemoryStoreOptions = {}): MemoryStore {
  let runs = 0;
  const store: MemoryStore = {
    begins: [],
    applied: [],
    finished: [],
    compared: [],
    begin(trigger, target, actorId) {
      store.begins.push({ trigger, target, actorId });
      runs += 1;
      return Promise.resolve({
        runId: `00000000-0000-4000-8000-${String(runs).padStart(12, '0')}`,
        status: 'running',
        reason: null,
        mode: target === 'test' ? 'dry_run' : 'apply',
        target,
        settings: { tab: 'Preguntas', maxRows: 5000, idPattern: '^[A-Z]{2,4}-[0-9]{4,5}$' },
        lastSheetHash: null,
        known: options.known ?? [],
        ...options.begin,
      });
    },
    versionsContent(versionIds) {
      store.compared.push(...versionIds);
      const found = new Map<string, VersionContent>();
      for (const id of versionIds) {
        const content = options.contents?.get(id);
        if (content) found.set(id, content);
      }
      return Promise.resolve(found);
    },
    apply(runId, rows, forceDryRun) {
      store.applied.push({ runId, rows: [...rows], forceDryRun });
      return Promise.resolve(
        rows.map((row): SyncApplyResult => ({
          rowNumber: row.rowNumber,
          outcome: expectedOutcome(row.decision),
          questionId: null,
        })),
      );
    },
    finish(runId, input) {
      store.finished.push({ runId, input });
      return Promise.resolve();
    },
  };
  return store;
}
