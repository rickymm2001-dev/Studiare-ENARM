// Escribe la plantilla de Excel del banco de preguntas para el médico (4,000 a 5,000 preguntas, de 4
// a 6 opciones). Las listas desplegables salen de las taxonomías de src/demo/content.
// Uso: npm run bank:template   (o node scripts/content/bank-template.ts [salida.xlsx])
// Salida por defecto en content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx
// La plantilla llenada se convierte con node scripts/content/bank-convert.ts <archivo.xlsx>
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadTaxonomies } from './bankColumns.ts';
import { buildTemplateWorkbook } from './bankTemplate.ts';

const root = resolve(import.meta.dirname, '..', '..');
const output = resolve(
  process.argv[2] ?? resolve(root, 'content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx'),
);

mkdirSync(dirname(output), { recursive: true });
await buildTemplateWorkbook(loadTaxonomies(root)).xlsx.writeFile(output);
console.log(`Plantilla del banco en ${output}`);
