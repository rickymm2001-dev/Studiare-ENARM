// Borrador de los pesos del ENARM de la pantalla 25. Aparte del formulario para poder probarlo sin
// pintar nada.
import { readStoredOverrides } from '@/config/overridesStore';
import { branchSection } from '@/data/schemas/content';
import { factoryWeights, topicTaxonomy } from '@/demo/content';

export interface WeightsDraft {
  branches: Record<string, string>;
  topics: Record<string, string>;
}

export const currentDraft = (): WeightsDraft => ({
  branches: Object.fromEntries(
    topicTaxonomy.branches.map((branch) => [branch.key, String(branch.weight)]),
  ),
  topics: Object.fromEntries(
    topicTaxonomy.branches.flatMap((branch) =>
      branch.topics.map((topic) => [`${branch.key}/${topic.key}`, String(topic.weight)] as const),
    ),
  ),
});

export const factoryDraft = (): WeightsDraft => ({
  branches: Object.fromEntries(
    Object.entries(factoryWeights.branches).map(([key, value]) => [key, String(value)]),
  ),
  topics: Object.fromEntries(
    Object.entries(factoryWeights.topics).map(([key, value]) => [key, String(value)]),
  ),
});

export const positive = (raw: string) => {
  const value = Number(raw);
  return raw.trim() !== '' && Number.isFinite(value) && value > 0 && value <= 100;
};

/** Solo lo que cambió contra los pesos de fábrica */
export function weightsPatch(draft: WeightsDraft): {
  branches: Record<string, number>;
  topics: Record<string, number>;
} {
  const diff = (current: Record<string, string>, factory: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(current)
        .filter(([key, raw]) => positive(raw) && Number(raw) !== factory[key])
        .map(([key, raw]) => [key, Number(raw)]),
    );
  return {
    branches: diff(draft.branches, factoryWeights.branches),
    topics: diff(draft.topics, factoryWeights.topics),
  };
}

/**
 * Si los pesos que valen son provisionales. Lo que guardó el admin manda y, si no dijo nada, vale la
 * marca de la taxonomía (B11, respuesta 61)
 */
export function weightsProvisional(
  stored: { provisional?: boolean | undefined } | undefined = readStoredOverrides()?.weights,
): boolean {
  return stored?.provisional ?? topicTaxonomy.weightsProvisional ?? true;
}

/** Las ramas de los 250 reactivos y aparte las del área de inglés, que no cuentan en ellos */
export function branchesBySection(): {
  clinical: typeof topicTaxonomy.branches;
  english: typeof topicTaxonomy.branches;
} {
  return {
    clinical: topicTaxonomy.branches.filter((branch) => branchSection(branch) === 'clinical'),
    english: topicTaxonomy.branches.filter((branch) => branchSection(branch) === 'english'),
  };
}

/**
 * Lo que se guarda de los pesos. null si todo es de fábrica y siguen provisionales como en la
 * taxonomía, para no guardar nada que no cambió
 */
export function weightsToStore(
  draft: WeightsDraft,
  provisional: boolean,
): {
  branches: Record<string, number>;
  topics: Record<string, number>;
  provisional?: boolean;
} | null {
  const patch = weightsPatch(draft);
  const factoryProvisional = topicTaxonomy.weightsProvisional ?? true;
  const changed = Object.keys(patch.branches).length + Object.keys(patch.topics).length > 0;
  if (!changed && provisional === factoryProvisional) return null;
  return provisional === factoryProvisional ? patch : { ...patch, provisional };
}
