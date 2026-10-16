// Lo que muestra la sección Costo de la IA en la nube de Costos de IA (B12, 2.5). Ordena lo que
// devuelve admin_ai_cost_report y saca la parte de cada motor y de cada modo. Sin React.
import type { CostReport } from '@/data/cloud/aiCosts';

export interface SpentRow {
  key: string;
  calls: number;
  costUsd: number;
  /** De 0 a 1, la parte del gasto total. 0 si todavía no se gastó nada */
  share: number;
}

/** Las filas de un desglose, de lo que más costó a lo que menos, con su parte del gasto total */
export function spentRows(
  record: CostReport['byEngine'],
  totalUsd: number,
  known: readonly string[] = [],
): SpentRow[] {
  const rows = Object.entries(record).map(([key, spent]) => ({
    key,
    calls: spent.calls,
    costUsd: spent.costUsd,
    share: totalUsd > 0 ? spent.costUsd / totalUsd : 0,
  }));
  const order = (key: string) => {
    const index = known.indexOf(key);
    return index === -1 ? known.length : index;
  };
  return rows.sort(
    (a, b) => b.costUsd - a.costUsd || b.calls - a.calls || order(a.key) - order(b.key),
  );
}

/** Los resultados de las llamadas, de los más a los menos frecuentes */
export function outcomeRows(byOutcome: CostReport['byOutcome']): { key: string; calls: number }[] {
  return Object.entries(byOutcome)
    .map(([key, calls]) => ({ key, calls }))
    .sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key));
}

/** Las llamadas que no dieron un texto: negativas, errores del proveedor y topes de gasto */
export function failedCalls(byOutcome: CostReport['byOutcome']): number {
  const failing = ['invalid_output', 'provider_error', 'rate_limited', 'refused', 'org_limit'];
  return failing.reduce((sum, key) => sum + (byOutcome[key] ?? 0), 0);
}

/** El periodo es válido si va de una fecha a otra, de hasta un año, como lo pide la base */
export function validRange(range: { from: string; to: string }): boolean {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(range.from) || !day.test(range.to) || range.to < range.from) return false;
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  return Number.isFinite(days) && days <= 366;
}
