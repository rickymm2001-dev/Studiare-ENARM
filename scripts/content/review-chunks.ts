// Prepara la revisión adversarial de IA de las preguntas demo (docs/contenido-demo.md).
// Uso: node scripts/content/review-chunks.ts [números de lote...]
// Sin argumentos toma todos los lotes. Escribe paquetes de 10 preguntas en .review/ (ignorado por
// git) e imprime el args que recibe el workflow .claude/workflows/enarm-demo-review.js.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';

const root = resolve(import.meta.dirname, '..', '..');
const questionsDir = join(root, 'src/demo/content/questions');
const outDir = join(root, '.review');

const BatchSchema = z.object({
  batch: z.number(),
  cases: z.array(z.object({ key: z.string(), vignette: z.string() })),
  questions: z.array(
    z.looseObject({
      key: z.string(),
      caseKey: z.string().nullable(),
      caseOrder: z.number().nullable(),
    }),
  ),
});

const wanted = new Set(process.argv.slice(2).map(Number));
const files = readdirSync(questionsDir)
  .filter((name) => /^batch-\d+\.json$/.test(name))
  .sort();

const items = files.flatMap((name) => {
  const batch = BatchSchema.parse(JSON.parse(readFileSync(join(questionsDir, name), 'utf8')));
  if (wanted.size > 0 && !wanted.has(batch.batch)) return [];
  const cases = new Map(batch.cases.map((entry) => [entry.key, entry.vignette]));
  return batch.questions.map((question) => ({
    ...question,
    caseVignette: question.caseKey === null ? null : (cases.get(question.caseKey) ?? null),
  }));
});

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const chunks: { file: string; first: string; last: string }[] = [];
for (let start = 0; start < items.length; start += 10) {
  const slice = items.slice(start, start + 10);
  const file = `chunk-${String(chunks.length + 1).padStart(2, '0')}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(slice, null, 1), 'utf8');
  chunks.push({ file, first: slice[0]?.key ?? '', last: slice.at(-1)?.key ?? '' });
}

const args = {
  dir: outDir,
  taxonomy: join(root, 'src/demo/content/bias-taxonomy.json'),
  chunks,
};
console.log(`${items.length} preguntas en ${chunks.length} paquetes dentro de ${outDir}`);
console.log('Args para el workflow enarm-demo-review');
console.log(JSON.stringify(args));
