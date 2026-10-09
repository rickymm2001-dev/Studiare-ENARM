// Escribe la plantilla de Excel del banco de preguntas para el médico (4,000 a 5,000 preguntas, de 4
// a 6 opciones). Las listas desplegables salen de las taxonomías de src/demo/content.
// Uso: npm run bank:template   (o node scripts/content/bank-template.ts [salida.xlsx])
// Salida por defecto en content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx y, de ahí, la
// copia que publica la app en public/plantillas/
// La plantilla llenada se convierte con node scripts/content/bank-convert.ts <archivo.xlsx>
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadTaxonomies } from './bankColumns.ts';
import { buildTemplateWorkbook } from './bankTemplate.ts';

const root = resolve(import.meta.dirname, '..', '..');
const output = resolve(
  process.argv[2] ?? resolve(root, 'content-drafts/bank-plantilla/Studiare-banco-plantilla.xlsx'),
);
// La misma plantilla que descarga el médico desde la pantalla 22 de la app
const published = resolve(root, 'public/plantillas/Studiare-banco-plantilla.xlsx');

mkdirSync(dirname(output), { recursive: true });
const workbook = buildTemplateWorkbook(loadTaxonomies(root));
await workbook.xlsx.writeFile(output);
console.log(`Plantilla del banco en ${output}`);
// Con una salida a mano no se toca la que publica la app
if (process.argv[2] === undefined) {
  mkdirSync(dirname(published), { recursive: true });
  await workbook.xlsx.writeFile(published);
  console.log(`Y en ${published} para la app`);
}
