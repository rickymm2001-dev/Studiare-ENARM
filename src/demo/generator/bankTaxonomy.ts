// La simulación solo usa las ramas y temas que ya tienen preguntas en el banco demo. Así agregar
// ramas o temas nuevos a la taxonomía (D-066) no cambia los datos simulados ni su prueba de
// recuperación. Función pura.
import type { TopicTaxonomy } from '@/data/schemas/content';
import type { DemoBank } from '../content/bank';

export function bankTaxonomy(taxonomy: TopicTaxonomy, bank: DemoBank): TopicTaxonomy {
  const topics = new Set(bank.questions.map((entry) => entry.question.topic));
  return {
    ...taxonomy,
    branches: taxonomy.branches
      .map((branch) => ({
        ...branch,
        topics: branch.topics.filter((topic) => topics.has(topic.key)),
      }))
      .filter((branch) => branch.topics.length > 0),
  };
}
