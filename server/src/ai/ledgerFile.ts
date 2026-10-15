// El libro del día del proxy de desarrollo en un archivo local (8.1, B12 1.2 del plan). Así el
// presupuesto y los límites sobreviven a reiniciar el proxy. Vive en server/.ai-ledger.json, fuera
// de git. El libro y sus reglas viven en el núcleo (DayLedger, las mismas que ai_admit_v2).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  DayLedger,
  type DayLedgerOptions,
  type DayLedgerState,
  type PendingJobsInfo,
} from '../../../supabase/functions/_shared/ai/ledger.ts';

/** Guarda el libro en un archivo sin dejarlo a medias. Un archivo que no existe es un día nuevo */
export function fileLedgerPersistence(file: string): NonNullable<DayLedgerOptions['persistence']> {
  return {
    load: () => (existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown) : null),
    save: (state: DayLedgerState) => {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      writeFileSync(temp, JSON.stringify(state));
      renameSync(temp, file);
    },
  };
}

/** El libro del día, en un archivo o solo en memoria si file es null */
export function createLedger(
  options: { file?: string | null; now?: () => Date; pendingJobs?: PendingJobsInfo } = {},
): DayLedger {
  return new DayLedger({
    persistence: options.file ? fileLedgerPersistence(options.file) : null,
    ...(options.now ? { now: options.now } : {}),
    ...(options.pendingJobs ? { pendingJobs: options.pendingJobs } : {}),
  });
}
