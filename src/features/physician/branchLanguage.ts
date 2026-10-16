// Sección e idioma de una rama del banco (B13, 1.2 y 1.4 del plan de B13). Inglés médico es la sección
// english y va en inglés. Las demás ramas son clinical y van en español. El editor saca siempre el idioma
// de la pregunta de su rama, así nunca queda language_branch_mismatch (1.6). Funciones puras. No importa la
// taxonomía en JSON a propósito: lo usan editorDraft.ts y reviewTexts.ts, que también cargan las specs de
// Playwright, y ahí un JSON importado a mano no se lee. branchLanguage.test.ts revisa que esta lista sea
// la de las ramas con section english de la taxonomía.
import type { QuestionLanguage } from '@/data/schemas/bank';
import type { TaxonomySection } from '@/data/schemas/content';

/** Las ramas de la sección en inglés, que son las que llevan section english en topic-taxonomy.json */
export const ENGLISH_BRANCH_KEYS: readonly string[] = ['medical_english'];

/** La sección del examen de una rama. Una rama que no se conoce es clinical, como en branchSection */
export function sectionOfBranch(branch: string): TaxonomySection {
  return ENGLISH_BRANCH_KEYS.includes(branch) ? 'english' : 'clinical';
}

/** El idioma que lleva una pregunta de esta rama. Inglés médico en inglés y las demás en español */
export function languageOfBranch(branch: string): QuestionLanguage {
  return sectionOfBranch(branch) === 'english' ? 'en' : 'es';
}
