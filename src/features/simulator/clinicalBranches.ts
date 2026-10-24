// Las ramas clínicas de la taxonomía, las de la práctica en español (B13, 2.8), y cuántas van marcadas.
// Sin React, para que los chips y la pantalla lo compartan.
import { branchSection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';

export const CLINICAL_BRANCHES = topicTaxonomy.branches.filter(
  (branch) => branchSection(branch) === 'clinical',
);

/** Cuántas ramas tienen al menos una subespecialidad marcada */
export function selectedBranchCount(selected: ReadonlySet<string>): number {
  return CLINICAL_BRANCHES.filter((branch) =>
    branch.topics.some((topic) => selected.has(topic.key)),
  ).length;
}
