// Copia a la Edge Function de IA lo que el núcleo necesita de la app y de los prompts (B12, 1.3 del
// plan). Las funciones no importan de src ni leen archivos sueltos al desplegarse, así que los
// motores puros de IA y la lista cerrada de textos académicos viven también en
// supabase/functions/_shared/ai/engines/, y los prompts en supabase/functions/_shared/ai/prompts.generated.ts
// con su versión y su huella SHA-256. La fuente sigue siendo src y los prompts. Nadie edita la copia.
// supabase/functions/_shared/ai/sync.test.ts corre el modo --check y falla si algo cambió.
// No importa nada generado por él mismo, así funciona aunque la copia falte o esté vieja.
// Uso: npm run ai:sync            escribe la copia
//      npm run ai:sync -- --check  no escribe nada y sale con error si la copia no está al día
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readPromptSources } from '../../server/src/ai/promptFiles.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const AI_SHARED_DIR = 'supabase/functions/_shared/ai';
export const ENGINES_DIR = `${AI_SHARED_DIR}/engines`;
export const PROMPTS_MODULE = `${AI_SHARED_DIR}/prompts.generated.ts`;

/** Los motores puros que el núcleo usa. Solo importan zod y entre ellos con ./archivo.ts (D-098) */
export const ENGINE_SOURCES = [
  'src/engines/aiContracts.ts',
  'src/engines/aiGuards.ts',
  'src/engines/aiMock.ts',
  'src/engines/cardSim.ts',
  'src/engines/cloze.ts',
  'src/engines/grounding.ts',
  'src/engines/piiFilter.ts',
  'src/config/academicSources.ts',
] as const;

export const GENERATED_MARK = '// Copia generada por scripts/ai/sync-function-sources.ts';

const header = (source: string) =>
  `${GENERATED_MARK} desde ${source}. No la edites.\n` +
  `// Cambia el original y corre npm run ai:sync.\n`;

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** Lo que debe haber en disco, por ruta relativa a la raíz */
export function generateFunctionSources(root = ROOT): Map<string, string> {
  const files = new Map<string, string>();
  for (const source of ENGINE_SOURCES) {
    const text = readFileSync(resolve(root, source), 'utf8');
    files.set(`${ENGINES_DIR}/${baseName(source)}`, header(source) + text);
  }

  const prompts = readPromptSources({
    serverPromptsDir: resolve(root, 'server/prompts'),
    rootPromptsDir: resolve(root, 'prompts'),
  });
  const entries = prompts.map(
    (prompt) =>
      `  {\n` +
      `    file: ${JSON.stringify(prompt.file)},\n` +
      `    version: ${JSON.stringify(prompt.version)},\n` +
      `    sha256: ${JSON.stringify(prompt.sha256)},\n` +
      `    text: ${JSON.stringify(prompt.text)},\n` +
      `  },\n`,
  );
  files.set(
    PROMPTS_MODULE,
    header('server/prompts y prompts') +
      `import type { PromptSource } from './promptSources.ts';\n\n` +
      `/** Los archivos de prompt con su versión y su huella SHA-256, en orden de ruta */\n` +
      `export const PROMPT_SOURCES: readonly PromptSource[] = [\n${entries.join('')}];\n`,
  );
  return files;
}

/** Diferencias entre lo generado y lo que hay en disco. Vacío si la copia está al día */
export function diffFunctionSources(root = ROOT): string[] {
  const files = generateFunctionSources(root);
  const problems: string[] = [];
  for (const [path, text] of files) {
    const target = resolve(root, path);
    if (!existsSync(target)) problems.push(`falta ${path}`);
    else if (readFileSync(target, 'utf8') !== text) problems.push(`cambió ${path}`);
  }
  const enginesDir = resolve(root, ENGINES_DIR);
  if (existsSync(enginesDir)) {
    for (const name of readdirSync(enginesDir)) {
      if (!files.has(`${ENGINES_DIR}/${name}`)) problems.push(`sobra ${ENGINES_DIR}/${name}`);
    }
  }
  return problems;
}

/** Escribe la copia y borra de engines/ lo que ya no se genera. Devuelve cuántos archivos escribió */
export function writeFunctionSources(root = ROOT): number {
  const files = generateFunctionSources(root);
  const enginesDir = resolve(root, ENGINES_DIR);
  if (existsSync(enginesDir)) {
    for (const name of readdirSync(enginesDir)) {
      if (!files.has(`${ENGINES_DIR}/${name}`)) rmSync(resolve(enginesDir, name), { force: true });
    }
  }
  for (const [path, text] of files) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  return files.size;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  if (process.argv.includes('--check')) {
    const problems = diffFunctionSources();
    if (problems.length > 0) {
      console.error('La copia de la Edge Function de IA no está al día. Corre `npm run ai:sync`');
      for (const problem of problems) console.error(`- ${problem}`);
      process.exit(1);
    }
    console.log('La copia de la Edge Function de IA está al día');
  } else {
    const count = writeFunctionSources();
    console.log(`${String(count)} archivos en ${AI_SHARED_DIR}`);
  }
}
