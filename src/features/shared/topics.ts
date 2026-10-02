// Todas las subespecialidades de la taxonomía, en orden (D-066)
import { topicTaxonomy } from '@/demo/content';

export const ALL_TOPICS: readonly string[] = topicTaxonomy.branches.flatMap((branch) =>
  branch.topics.map((topic) => topic.key),
);
