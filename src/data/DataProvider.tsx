// Entrega a la interfaz los repositorios de la base activa. Las pantallas nunca ven Dexie.
import { useMemo, type ReactNode } from 'react';
import { DataContext, type DataApi, type DemoAdjustments } from './context';
import { createEnarmDb } from './db/database';
import type { DatabaseKind } from './databases';
import { rebuildDerivedState } from './derive/derivations';
import { createDexieRepositories } from './repos/dexie/createRepositories';
import { studyDayOf } from '@/engines/studyDay';
import { DEFAULT_TIME_ZONE } from './schemas/common';
import { analyticsConsent } from './analytics/catalog';
import type { AppEventBridge } from './analytics/fromAppEvents';
import { recordEvent } from './usecases/recordEvent';
import { clearDemoDatabase, resetDemoDatabase, seedDemoDatabase } from './usecases/seedDemo';
import type { EnarmDb } from './db/database';
import type { AppEvent } from './schemas/events';

/** El generador corre en un worker que se carga bajo demanda (14.4) */
async function buildDemoRecords(adjust: DemoAdjustments = {}) {
  const { simulateWorker } = await import('@/workers/simulateClient');
  const now = new Date();
  // Nada de la bitácora simulada puede quedar en el futuro
  return simulateWorker().buildSeed({
    endDay: studyDayOf(now, DEFAULT_TIME_ZONE),
    notAfter: now.toISOString(),
    ...(adjust.cohortSize !== undefined ? { cohortSize: adjust.cohortSize } : {}),
    ...(adjust.seed !== undefined ? { seed: adjust.seed } : {}),
    ...(adjust.examDate !== undefined ? { examDate: adjust.examDate } : {}),
  });
}

function demoActions(db: EnarmDb): DataApi['demo'] {
  if (db.kind !== 'demo') return null;
  return {
    generate: async (adjust) => seedDemoDatabase(db, await buildDemoRecords(adjust)),
    regenerate: async (adjust) => resetDemoDatabase(db, await buildDemoRecords(adjust)),
    clear: () => clearDemoDatabase(db),
  };
}

/**
 * El puente de la bitácora a la analítica (B15, 1.6). Su código se baja aparte la primera vez que se guarda un
 * evento con el permiso Medición de uso prendido, así quien no lo dio nunca lo descarga y el JavaScript inicial
 * no crece. Los eventos entran en el orden en que llegaron, porque todos esperan al mismo archivo
 */
function lazyBridge(repos: DataApi['repos']): (event: AppEvent) => void {
  let loading: Promise<AppEventBridge | null> | null = null;
  return (event) => {
    // Sin permiso no se baja nada. El puente lo vuelve a revisar al traducir
    if (analyticsConsent() !== true) return;
    loading ??= import('./analytics/fromAppEvents')
      .then((module) =>
        module.createAppEventBridge({
          practiceFeedback: async (userId) =>
            (await repos.users.get(userId))?.settings.practiceFeedback ?? 'end',
        }),
      )
      // Un archivo que no baja, por una red intermitente, solo deja esos eventos sin medir
      .catch(() => {
        loading = null;
        return null;
      });
    void loading.then((bridge) => {
      bridge?.onRecorded(event);
    });
  };
}

// Una instancia por base durante toda la vida de la página. Dexie abre la base al primer uso
const instances = new Map<DatabaseKind, DataApi>();

function instanceFor(kind: DatabaseKind): DataApi {
  let instance = instances.get(kind);
  if (!instance) {
    const db = createEnarmDb(kind);
    const repos = createDexieRepositories(db);
    const recordQuiet: DataApi['recordEvent'] = (event) => recordEvent(db, repos.events, event);
    // Solo Mi cuenta mide. La demostración guarda sin puente, así que nunca llega nada a la analítica (B15, 1.1)
    const bridge = db.kind === 'real' ? lazyBridge(repos) : null;
    instance = {
      repos,
      recordEvent: bridge
        ? async (event) => {
            const stored = await recordQuiet(event);
            // Después de guardar bien, y sin esperar a la analítica
            bridge(stored);
            return stored;
          }
        : recordQuiet,
      recordEventQuiet: recordQuiet,
      rebuildDerivedState: () => rebuildDerivedState(db),
      demo: demoActions(db),
      deleteAllData:
        db.kind === 'real'
          ? async () => {
              db.close();
              await db.delete();
              await db.open();
            }
          : null,
    };
    instances.set(kind, instance);
  }
  return instance;
}

export function DataProvider({ kind, children }: { kind: DatabaseKind; children: ReactNode }) {
  const value = useMemo(() => instanceFor(kind), [kind]);
  return <DataContext value={value}>{children}</DataContext>;
}
