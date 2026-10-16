// Lo que la demostración enseña de la comparación y de la población. Se llena en el paso 3 de C.
import type { ComparisonSnapshot, PopulationBaselines } from '@/data/model/contracts';

export interface DemoSnapshots {
  comparison: ComparisonSnapshot;
  population: PopulationBaselines;
}

/** undefined mientras se calcula, null si no se pudo */
export function useDemoSnapshots(_enabled: boolean): DemoSnapshots | null | undefined {
  return null;
}
