// Ramas del plan del Calendario y su orden (V4-B10, fase 2). Funciones puras. El plan reparte una rama
// por semana en el orden de settings.branches, así que elegir ramas y moverlas es editar esa lista.

/** Las ramas que hay y se pueden elegir. El esquema de los ajustes acepta hasta 10 */
export const MAX_PLAN_BRANCHES = 10;

export interface BranchChoice {
  key: string;
  included: boolean;
}

/**
 * Las ramas elegidas, en su orden, y después las demás en el orden de la taxonomía. Una clave de los
 * ajustes que ya no existe en la taxonomía se deja fuera, porque nadie podría quitarla
 */
export function branchChoices(selected: readonly string[], all: readonly string[]): BranchChoice[] {
  const known = new Set(all);
  const chosen = unique(selected).filter((key) => known.has(key));
  const rest = all.filter((key) => !chosen.includes(key));
  return [
    ...chosen.map((key) => ({ key, included: true })),
    ...rest.map((key) => ({ key, included: false })),
  ];
}

/** Las ramas elegidas, ya limpias, en su orden */
export function chosenBranches(selected: readonly string[], all: readonly string[]): string[] {
  return branchChoices(selected, all)
    .filter((choice) => choice.included)
    .map((choice) => choice.key);
}

/**
 * Incluye o quita una rama. Una rama nueva entra al final. Nunca se queda sin ramas, porque un plan sin
 * ramas no tiene qué repartir, y nunca pasa del máximo que acepta el ajuste
 */
export function toggleBranch(
  selected: readonly string[],
  key: string,
  all: readonly string[],
): string[] {
  const chosen = chosenBranches(selected, all);
  if (chosen.includes(key)) {
    return chosen.length <= 1 ? chosen : chosen.filter((item) => item !== key);
  }
  if (!all.includes(key) || chosen.length >= MAX_PLAN_BRANCHES) return chosen;
  return [...chosen, key];
}

/** Sube o baja una rama elegida un lugar. En los extremos no hace nada */
export function moveBranch(
  selected: readonly string[],
  key: string,
  delta: -1 | 1,
  all: readonly string[],
): string[] {
  const chosen = chosenBranches(selected, all);
  const from = chosen.indexOf(key);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= chosen.length) return chosen;
  const next = [...chosen];
  const moved = next[from];
  const other = next[to];
  if (moved === undefined || other === undefined) return chosen;
  next[from] = other;
  next[to] = moved;
  return next;
}

const unique = (values: readonly string[]): string[] => [...new Set(values)];
