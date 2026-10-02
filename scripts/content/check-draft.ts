// Revisa un borrador de preguntas demo antes de unirlo a un lote (docs/contenido-demo.md).
// Uso: node scripts/content/check-draft.ts <archivo.json> [<archivo.json> ...]
// Acepta un arreglo de preguntas o un lote con { questions }. Usa el motor real de estructura
// para la polaridad y la tarea, igual que src/demo/content/questions/questions.test.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';

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
const YEAR = /(?<!\d)(19|20)\d{2}(?!\d)/;
const CATALOG_CODE = /[A-Z]{2,}-\d/;
const KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node scripts/content/check-draft.ts <archivo.json> [...]');
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const questions = DraftSchema.parse(readJson(resolve(file)));
  const problems: string[] = [];
  const count = (values: string[]) => {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };
  let detected = 0;
  let agree = 0;

  for (const question of questions) {
    const { key } = question;
    const words = question.explanation.trim().split(/\s+/).length;
    if (words < 80 || words > 150) problems.push(`${key} explicación de ${words} palabras`);
    const topic = topics.get(question.topic);
    if (topic?.branch !== question.branch) problems.push(`${key} rama y tema no coinciden`);
    if (!topic?.subtopics.has(question.subtopic))
      problems.push(`${key} subtema ${question.subtopic}`);
    if (question.options.map((option) => option.key).join('') !== KEYS.join(''))
      problems.push(`${key} las opciones deben ser a-j en orden`);
    const correct = question.options.filter((option) => option.correct);
    if (correct.length !== 1) problems.push(`${key} tiene ${correct.length} opciones correctas`);
    for (const option of question.options) {
      if (option.correct && option.bias) problems.push(`${key}${option.key} correcta con sesgo`);
      if (!option.correct && !taggable.has(option.bias ?? ''))
        problems.push(`${key}${option.key} sesgo no válido ${option.bias ?? '(vacío)'}`);
      for (const secondary of option.secondaryBiases ?? [])
        if (!allBiases.has(secondary))
          problems.push(`${key}${option.key} sesgo secundario ${secondary}`);
    }
    if (new Set(question.options.map((o) => o.text.trim().toLowerCase())).size !== 10)
      problems.push(`${key} opciones repetidas`);
    if (
      new Set(question.canonical).size !== 4 ||
      !question.canonical.includes(correct[0]?.key ?? '')
    )
      problems.push(`${key} el set canónico debe tener 4 claves e incluir la correcta`);
    for (const reference of question.gpcRefs)
      if (YEAR.test(reference) || CATALOG_CODE.test(reference))
        problems.push(`${key} referencia con año o clave de catálogo`);

    const auto = engine.analyzeStructure(
      {
        vignette: question.vignette,
        prompt: question.prompt,
        serialCase: question.caseKey !== null,
      },
      dictionary,
    );
    if (auto.polarity !== question.polarity)
      problems.push(`${key} polaridad ${question.polarity}, el motor dice ${auto.polarity}`);
    if (auto.task !== null) {
      detected += 1;
      if (auto.task === question.task) agree += 1;
      else problems.push(`${key} tarea ${question.task}, el motor dice ${auto.task}`);
    }
  }

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
  if (problems.length > 0) {
    failed = true;
    console.log(`Problemas (${problems.length})`);
    for (const problem of problems) console.log(`- ${problem}`);
  } else {
    console.log('Sin problemas');
  }
}
process.exit(failed ? 1 : 0);
