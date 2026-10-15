// Sección e idioma de una rama del banco (B13, 1.2 y 1.4 del plan de B13). Inglés médico es la sección
// english y va en inglés. Las demás ramas son clinical y van en español. El editor saca siempre el idioma
// de la pregunta de su rama, así nunca queda language_branch_mismatch (1.6). Funciones puras, sin React
// ni Dexie, aparte de bankTaxonomy.ts para que editorDraft.ts las use sin un ciclo de importaciones.
import type { QuestionLanguage } from '@/data/schemas/bank';
import { branchSection, type TaxonomySection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';

/** La sección del examen de una rama. Una rama que no se conoce es clinical, como en branchSection */
export function sectionOfBranch(branch: string): TaxonomySection {
  const found = topicTaxonomy.branches.find((item) => item.key === branch);
  return found ? branchSection(found) : 'clinical';
}

/** El idioma que lleva una pregunta de esta rama. Inglés médico en inglés y las demás en español */
export function languageOfBranch(branch: string): QuestionLanguage {
  return sectionOfBranch(branch) === 'english' ? 'en' : 'es';
}
