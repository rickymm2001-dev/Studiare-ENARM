// Nombres de columnas, etiquetas y taxonomías de la plantilla del banco. Lo puro vive en
// src/data/content/bankColumns.ts, que usan también la app y su importador. Aquí solo queda lo que
// necesita disco.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  BiasInfo,
  ContentTaxonomies,
  TaxonomyBranch,
} from '../../src/data/content/bankColumns.ts';

export * from '../../src/data/content/bankColumns.ts';

/** Lee las taxonomías de src/demo/content, las mismas que valida la app */
export function loadTaxonomies(root: string): ContentTaxonomies {
  const read = (name: string) =>
    JSON.parse(readFileSync(resolve(root, 'src/demo/content', name), 'utf8')) as unknown;
  const topics = read('topic-taxonomy.json') as { branches: TaxonomyBranch[] };
  const biases = read('bias-taxonomy.json') as { biases: BiasInfo[] };
  return { branches: topics.branches, biases: biases.biases };
}
