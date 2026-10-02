// Une los borradores de un lote en src/demo/content/questions/batch-0N.json (docs/contenido-demo.md).
// Uso: node scripts/content/merge-batch.ts <número de lote> <carpeta de borradores>
// La carpeta trae cases.json con { cases: [{ key, vignette }] } y uno o más part-*.json con arreglos
// de preguntas. Las partes se unen en orden alfabético. Después corre prettier y vitest.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [batchArg, draftDir] = process.argv.slice(2);
const batch = Number(batchArg);
if (!Number.isInteger(batch) || batch < 1 || draftDir === undefined) {
  console.error(
    'Uso: node scripts/content/merge-batch.ts <número de lote> <carpeta de borradores>',
  );
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..', '..');
const dir = resolve(draftDir);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8')) as unknown;

const casesFile = readJson(join(dir, 'cases.json'));
const cases =
  typeof casesFile === 'object' && casesFile !== null && 'cases' in casesFile
    ? casesFile.cases
    : [];
const parts = readdirSync(dir)
  .filter((name) => /^part-.*\.json$/.test(name))
  .sort();
const questions = parts.flatMap((name) => {
  const part = readJson(join(dir, name));
  if (!Array.isArray(part)) throw new Error(`${name} debe ser un arreglo de preguntas`);
  return part as unknown[];
});
if (questions.length !== 50) {
  console.error(`Un lote lleva 50 preguntas y hay ${questions.length} en ${parts.join(', ')}`);
  process.exit(1);
}

const target = join(
  root,
  'src/demo/content/questions',
  `batch-${String(batch).padStart(2, '0')}.json`,
);
const content = { batch, status: 'pending_physician_review', cases, questions };
writeFileSync(target, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
console.log(`Escribí ${target} con ${questions.length} preguntas de ${parts.length} partes`);
console.log('Sigue con npx prettier --write en ese archivo y npx vitest run src/demo');
