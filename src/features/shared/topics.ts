// Todas las subespecialidades de la taxonomía, en orden (D-066)
import { branchSection } from '@/data/schemas/content';
import { topicTaxonomy } from '@/demo/content';

export const ALL_TOPICS: readonly string[] = topicTaxonomy.branches.flatMap((branch) =>
  branch.topics.map((topic) => topic.key),
);

/**
 * Las subespecialidades de las ramas clínicas, sin Inglés médico (B13, 2.8 del plan de B13). Son las de la
 * práctica en español, que deja fuera el inglés siempre. Repasar sí usa todas, porque ahí vive el mazo de
 * vocabulario
 */
export const CLINICAL_TOPICS: readonly string[] = topicTaxonomy.branches
  .filter((branch) => branchSection(branch) === 'clinical')
  .flatMap((branch) => branch.topics.map((topic) => topic.key));

/** Nombre de cada subespecialidad por su clave */
export const TOPIC_NAMES: ReadonlyMap<string, string> = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);

/** Las ramas de la sección de inglés, que van aparte de las clínicas en los cortes por rama */
export const ENGLISH_BRANCHES: ReadonlySet<string> = new Set(
  topicTaxonomy.branches
    .filter((branch) => branchSection(branch) === 'english')
    .map((branch) => branch.key),
);
