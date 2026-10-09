// Borrador de los pesos del ENARM de la pantalla 25. Aparte del formulario para poder probarlo sin
// pintar nada.
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
