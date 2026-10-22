// Copia a las Edge Functions la limpieza de textos del reporte de errores del navegador (B15, 2.2 del plan
// de B15). Las funciones no importan de src (PC 7.3), así que scrub, screenOf y lo que necesitan viven también
// en supabase/functions/_shared/generated/scrub.ts, con las mismas reglas que quitan correos, ids, tokens,
// claves y consultas antes de que un error salga a Sentry. supabase/functions/_shared/generated.test.ts genera
// en memoria y compara con lo que hay en disco. Si cambias src/data/telemetry/clientErrors.ts y no corres
// npm run functions:scrub, la prueba falla.
// Uso: npm run functions:scrub
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as prettier from 'prettier';

const ROOT = resolve(import.meta.dirname, '..', '..');
export const SCRUB_SOURCE = 'src/data/telemetry/clientErrors.ts';
export const SCRUB_TARGET = 'supabase/functions/_shared/generated/scrub.ts';

const HEADER =
  `// Generado por scripts/telemetry/sync-scrub.ts desde ${SCRUB_SOURCE}. No lo edites a mano. Cambia el\n` +
  `// original y corre npm run functions:scrub.\n`;

/** El archivo generado, con su ruta desde la raíz y ya con el formato de Prettier */
export async function generateScrub(root = ROOT): Promise<Map<string, string>> {
  const source = readFileSync(resolve(root, SCRUB_SOURCE), 'utf8');
  // La copia no importa nada. Si el original empieza a importar, la copia se rompería en las funciones
  if (/^\s*import\s/m.test(source)) {
    throw new Error(`${SCRUB_SOURCE} ya importa algo. Revisa la copia generada para las funciones`);
  }
  const config = (await prettier.resolveConfig(resolve(root, 'package.json'))) ?? {};
  const text = await prettier.format(HEADER + source, {
    ...config,
    filepath: resolve(root, SCRUB_TARGET),
  });
  return new Map([[SCRUB_TARGET, text]]);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const files = await generateScrub();
  for (const [path, text] of files) {
    const target = resolve(ROOT, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  console.log(`${files.size} archivo en supabase/functions/_shared/generated`);
}
