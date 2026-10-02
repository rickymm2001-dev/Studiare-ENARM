// API que expone el Web Worker de simulación (11.2, 11.3). Genera la cohorte y el alumno de la demo
// fuera del hilo de la interfaz. Vive aparte del worker para poder probarla sin worker.
import { buildDemoBank } from '@/demo/content/bank';
import { topicTaxonomy } from '@/demo/content';
import {
  buildDemoSeed,
  DEFAULT_DEMO_SEED,
  provisionalExamDate,
  toSeedRecords,
  type DemoSeedOptions,
  type DemoSeedRecords,
} from '@/demo/generator/seed';

export interface SimulateWorkerApi {
  /** Registros listos para sembrar. endDay es el día de estudio de hoy */
  buildSeed(input: { endDay: string } & Partial<DemoSeedOptions>): DemoSeedRecords;
}

export const simulateApi: SimulateWorkerApi = {
  buildSeed(input) {
    const options: DemoSeedOptions = {
      ...DEFAULT_DEMO_SEED,
      examDate: provisionalExamDate(input.endDay),
      ...input,
    };
    return toSeedRecords(buildDemoSeed(buildDemoBank(), topicTaxonomy, options));
  },
};
