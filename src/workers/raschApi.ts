// API que expone el Web Worker de Rasch. Vive aparte del worker para poder probarla sin worker.
import {
  estimateRasch,
  type RaschOptions,
  type RaschResponse,
  type RaschResult,
} from '@/engines/rasch';

export interface RaschWorkerApi {
  estimate(responses: RaschResponse[], options?: RaschOptions): RaschResult;
}

export const raschApi: RaschWorkerApi = {
  estimate: (responses, options) => estimateRasch(responses, options),
};
