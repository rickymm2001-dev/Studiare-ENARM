// Revisa un borrador de preguntas demo antes de unirlo a un lote (docs/contenido-demo.md).
// Uso: node scripts/content/check-draft.ts <archivo.json> [<archivo.json> ...]
// Acepta un arreglo de preguntas o un lote con { questions }. Usa el motor real de estructura
// para la polaridad y la tarea, igual que src/demo/content/questions/questions.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { checkQuestions } from './draftRules.ts';

const root = resolve(import.meta.dirname, '..', '..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const OptionSchema = z.object({
  key: z.string(),
  text: z.string(),
  correct: z.boolean(),
  bias: z.string().optional(),
  secondaryBiases: z.array(z.string()).optional(),
  rationale: z.string(),
});
const QuestionSchema = z.object({
  key: z.string(),
  caseKey: z.string().nullable(),
  caseOrder: z.number().nullable(),
  branch: z.string(),
  topic: z.string(),
  subtopic: z.string(),
  vignette: z.string(),
  prompt: z.string(),
  polarity: z.enum(['affirmative', 'negative']),
  task: z.string(),
  difficulty: z.number().int().min(1).max(5),
  options: z.array(OptionSchema),
  canonical: z.array(z.string()),
  explanation: z.string(),
  gpcRefs: z.array(z.string()),
  /** Tipos de reactivo raros, opcionales. Con alguno las reglas de forma se relajan (D-080) */
  kinds: z.array(z.string()).optional(),
});
const DraftSchema = z.union([
  z.array(QuestionSchema),
  z.object({ questions: z.array(QuestionSchema) }).transform((batch) => batch.questions),
]);
const BiasTaxonomySchema = z.object({
  biases: z.array(z.object({ key: z.string(), taggable: z.boolean() })),
});
const TopicTaxonomySchema = z.object({
  branches: z.array(
    z.object({
      key: z.string(),
      topics: z.array(
        z.object({ key: z.string(), subtopics: z.array(z.object({ key: z.string() })) }),
      ),
    }),
  ),
});

interface StructureEngine {
  analyzeStructure: (
    question: { vignette: string; prompt: string; serialCase: boolean },
    dictionary: unknown,
  ) => { polarity: string; task: string | null };
}

// Importación dinámica para no meter el motor de la app en el proyecto de TypeScript de Node
const engine = (await import(
  pathToFileURL(resolve(root, 'src/engines/structure.ts')).href
)) as StructureEngine;
const dictionary = readJson(resolve(root, 'src/demo/content/structure-dict.json'));
const biasTaxonomy = BiasTaxonomySchema.parse(
  readJson(resolve(root, 'src/demo/content/bias-taxonomy.json')),
);
const topicTaxonomy = TopicTaxonomySchema.parse(
  readJson(resolve(root, 'src/demo/content/topic-taxonomy.json')),
);

const taggable = new Set(biasTaxonomy.biases.filter((bias) => bias.taggable).map((b) => b.key));
const allBiases = new Set(biasTaxonomy.biases.map((bias) => bias.key));
const topics = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map(
      (topic) =>
        [
          topic.key,
          { branch: branch.key, subtopics: new Set(topic.subtopics.map((s) => s.key)) },
        ] as const,
    ),
  ),
);

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node scripts/content/check-draft.ts <archivo.json> [...]');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const questions = DraftSchema.parse(readJson(resolve(file)));
  const count = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };
  const report = checkQuestions(questions, {
    taggable,
    allBiases,
    topics,
    analyze: (question) => engine.analyzeStructure(question, dictionary),
  });
  const { problems, notes, detected, agree } = report;

  const negatives = questions.filter((question) => question.polarity === 'negative').length;
  console.log(`\n${file}`);
  console.log(`${questions.length} preguntas, ${negatives} negativas`);
  console.log('Ramas', Object.fromEntries(count(questions.map((q) => q.branch))));
  console.log('Dificultad', Object.fromEntries(count(questions.map((q) => String(q.difficulty)))));
  console.log(`Tareas que detecta el motor ${detected}, coinciden ${agree}`);
  console.log(
    'Sesgos',
    count(questions.flatMap((q) => q.options.filter((o) => !o.correct).map((o) => o.bias ?? '')))
      .map(([bias, n]) => `${bias} ${n}`)
      .join(', '),
  );
  if (notes.length > 0) {
    console.log(`Avisos de reactivos raros, no fallan (${notes.length})`);
    for (const note of notes) console.log(`- ${note}`);
  }
  if (problems.length > 0) {
    failed = true;
    console.log(`Problemas (${problems.length})`);
    for (const problem of problems) console.log(`- ${problem}`);
  } else {
    console.log('Sin problemas');
  }
}
process.exit(failed ? 1 : 0);
