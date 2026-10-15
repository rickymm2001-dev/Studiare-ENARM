// Copia a la función bank-sync el convertidor del banco y lo que necesita (B11, 3.12 del plan de B11).
// Las Edge Functions no importan de src (PC 7.3), así que el convertidor, la huella, los contratos, el
// motor de estructura y las taxonomías viven también en supabase/functions/_shared/bank/generated/.
// Las taxonomías JSON pasan a módulos .ts que exportan el mismo objeto, así ni Deno ni
// tsconfig.node.json importan JSON. supabase/functions/_shared/bank/generated.test.ts genera en
// memoria y compara con lo que hay en disco. Si cambias el convertidor y no corres npm run bank:shared,
// la prueba falla.
// Uso: npm run bank:shared
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as prettier from 'prettier';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const GENERATED_DIR = 'supabase/functions/_shared/bank/generated';

const header = (source: string) =>
  `// Generado por scripts/content/sync-bank-shared.ts desde ${source}. No lo edites a mano. Cambia el\n` +
  `// original y corre npm run bank:shared.\n`;

/** Cambia un texto que tiene que estar. Si el original cambió y ya no está, falla para revisarlo */
function replaceRequired(text: string, from: string, to: string, source: string): string {
  if (!text.includes(from))
    throw new Error(`${source} ya no trae "${from}". Revisa la copia generada`);
  return text.replace(from, to);
}

const TYPES = `${header('src/data/schemas/content.ts y src/data/schemas/bank.ts')}
// Los tipos que usa el motor de estructura, sin zod

export type QuestionTask =
  | 'diagnosis'
  | 'next_step'
  | 'initial_study'
  | 'confirmatory_study'
  | 'initial_treatment'
  | 'treatment_of_choice'
  | 'mechanism'
  | 'risk_factor'
  | 'complication_prognosis'
  | 'prevention_screening'
  | 'data_interpretation';

export interface StructureDictionary {
  version: number;
  status: 'pending_physician_review' | 'physician_reviewed';
  negations: {
    id: string;
    pattern: string;
    kind: 'negation' | 'exception' | 'false_statement' | 'least_likely' | 'contraindication';
  }[];
  falsePositives: string[];
  english?: {
    negations: {
      id: string;
      pattern: string;
      kind: 'negation' | 'exception' | 'false_statement' | 'least_likely' | 'contraindication';
    }[];
    falsePositives: string[];
  };
  tasks: { task: QuestionTask; patterns: string[] }[];
}
`;

/** Los archivos generados, por ruta relativa a la raíz, ya con el formato de Prettier */
export async function generateBankShared(root = ROOT): Promise<Map<string, string>> {
  const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
  const files = new Map<string, string>();
  const copy = (source: string, target: string, edit: (text: string) => string = (t) => t) => {
    files.set(`${GENERATED_DIR}/${target}`, header(source) + edit(read(source)));
  };

  copy('src/data/content/bankColumns.ts', 'bankColumns.ts');
  copy('src/data/content/passageSource.ts', 'passageSource.ts');
  copy('src/data/content/bankConvert.ts', 'bankConvert.ts', (text) =>
    replaceRequired(text, "from '../bank/contracts.ts'", "from './contracts.ts'", 'bankConvert.ts'),
  );
  copy('src/data/content/contentHash.ts', 'contentHash.ts', (text) =>
    replaceRequired(text, "from '../bank/contracts.ts'", "from './contracts.ts'", 'contentHash.ts'),
  );
  copy('src/data/bank/contracts.ts', 'contracts.ts');
  copy('src/engines/structure.ts', 'structure.ts', (text) => {
    let edited = replaceRequired(
      text,
      "import type { StructureDictionary } from '@/data/schemas/content';\n" +
        "import type { QuestionTaskSchema } from '@/data/schemas/bank';\n" +
        "import type { z } from 'zod';\n",
      "import type { QuestionTask as SchemaTask, StructureDictionary } from './types.ts';\n",
      'structure.ts',
    );
    edited = replaceRequired(
      edited,
      'export type QuestionTask = z.infer<typeof QuestionTaskSchema>;',
      'export type QuestionTask = SchemaTask;',
      'structure.ts',
    );
    return edited;
  });
  files.set(`${GENERATED_DIR}/types.ts`, TYPES);

  // Un JSON como módulo. Con tipo, cuando hace falta que las cadenas sean de una lista cerrada
  const json = (
    source: string,
    target: string,
    name: string,
    typed?: { type: string; from: string },
  ) => {
    const data: unknown = JSON.parse(read(source));
    const imports = typed ? `import type { ${typed.type} } from '${typed.from}';\n\n` : '\n';
    const annotation = typed ? `: ${typed.type}` : '';
    files.set(
      `${GENERATED_DIR}/${target}`,
      `${header(source)}${imports}export const ${name}${annotation} = ${JSON.stringify(data, null, 2)};\n`,
    );
  };
  json('src/demo/content/topic-taxonomy.json', 'topicTaxonomy.ts', 'topicTaxonomy');
  json('src/demo/content/bias-taxonomy.json', 'biasTaxonomy.ts', 'biasTaxonomy');
  json('src/demo/content/structure-dict.json', 'structureDict.ts', 'structureDictionary', {
    type: 'StructureDictionary',
    from: './types.ts',
  });

  const config = (await prettier.resolveConfig(resolve(root, 'package.json'))) ?? {};
  const formatted = new Map<string, string>();
  for (const [path, text] of files) {
    formatted.set(path, await prettier.format(text, { ...config, filepath: resolve(root, path) }));
  }
  return formatted;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const files = await generateBankShared();
  for (const [path, text] of files) {
    const target = resolve(ROOT, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  console.log(`${files.size} archivos en ${GENERATED_DIR}`);
}
