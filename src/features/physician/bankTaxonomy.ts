// La taxonomía del banco como la valida el editor, armada una sola vez para las pantallas del médico. Con
// la sección de cada rama (B13), que el filtro Sección del banco y el idioma del editor usan.
import type { TaxonomySection } from '@/data/schemas/content';
import { TAGGABLE_BIASES } from '@/data/usecases/labeling';
import { topicTaxonomy } from '@/demo/content';
import { sectionOfBranch } from './branchLanguage';
import { taxonomyViewFrom } from './editorDraft';

export { languageOfBranch, sectionOfBranch } from './branchLanguage';

export const bankTaxonomy = taxonomyViewFrom({
  branches: topicTaxonomy.branches,
  taggable: TAGGABLE_BIASES.map((bias) => bias.key),
});

/** Las ramas de una sección, en el orden de la taxonomía. Español son las clínicas e Inglés es Inglés médico */
export function branchesOfSection(
  section: TaxonomySection,
): readonly { key: string; name: string }[] {
  return topicTaxonomy.branches.filter((branch) => sectionOfBranch(branch.key) === section);
}
