// Lee el archivo que wrangler escribe en WRANGLER_OUTPUT_FILE_PATH al publicar en Cloudflare Pages y saca la
// dirección del despliegue, para que el flujo le corra la prueba de humo (B17, 1.3 y 2.8 del plan de B17).
// El archivo es JSON por líneas. Al publicar, wrangler agrega una entrada pages-deploy (proyecto, id y url) y otra
// pages-deploy-detailed, que además trae el alias de la rama y el ambiente (production o preview). Verificado en el
// código de wrangler (packages/wrangler/src/pages/deploy.ts, 2026-10-22)
//
// Uso en el flujo
//   node scripts/smoke/deploy-url.ts "$RUNNER_TEMP/wrangler.ndjson" >> "$GITHUB_OUTPUT"
// Imprime líneas nombre=valor (url, alias, environment) que GitHub entiende como salidas del paso. Si no hay una
// dirección válida sale con 1 y no imprime nada, así el paso siguiente no corre con una dirección inventada.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DeployDetails {
  /** La dirección única de este despliegue, como https://abc123.studiare.pages.dev */
  url: string;
  /** La dirección de la rama, como https://mi-rama.studiare.pages.dev. Solo la trae la entrada detallada */
  alias?: string;
  /** production o preview, si wrangler lo dijo */
  environment?: 'production' | 'preview';
}

/** Una dirección de Pages: https y un nombre de host de pages.dev, sin usuario, ruta ni consulta */
export function pagesDevUrlOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  // El analizador de URL borra en silencio tabuladores y saltos de línea, y una dirección con alguno se leería
  // como otra. Se rechaza antes de interpretarla
  if (/\s/.test(value.trim())) return undefined;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return undefined;
  }
  const clean =
    url.protocol === 'https:' &&
    /^(?:[a-z0-9-]+\.)+pages\.dev$/.test(url.hostname) &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';
  return clean ? url.origin : undefined;
}

/**
 * La dirección del último despliegue que consta en el archivo, o null si no hay ninguna válida. Las líneas que no
 * son JSON, las de otras entradas de wrangler y las direcciones que no son de pages.dev se ignoran
 */
export function parseWranglerOutput(text: string): DeployDetails | null {
  let found: DeployDetails | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== 'pages-deploy' && record.type !== 'pages-deploy-detailed') continue;
    const url = pagesDevUrlOf(record.url);
    if (url === undefined) continue;
    const alias = pagesDevUrlOf(record.alias);
    const environment =
      record.environment === 'production' || record.environment === 'preview'
        ? record.environment
        : undefined;
    // La entrada detallada trae más datos que la sencilla del mismo despliegue, y las dos llevan la misma dirección
    const previous: DeployDetails | null = found;
    const keep = previous?.url === url ? previous : null;
    const merged: DeployDetails = { url };
    const finalAlias = alias ?? keep?.alias;
    const finalEnvironment = environment ?? keep?.environment;
    if (finalAlias !== undefined) merged.alias = finalAlias;
    if (finalEnvironment !== undefined) merged.environment = finalEnvironment;
    found = merged;
  }
  return found;
}

/** Las líneas nombre=valor que GitHub lee de GITHUB_OUTPUT */
export function outputLines(details: DeployDetails): string[] {
  return [
    `url=${details.url}`,
    ...(details.alias === undefined ? [] : [`alias=${details.alias}`]),
    ...(details.environment === undefined ? [] : [`environment=${details.environment}`]),
  ];
}

// Uso desde la línea de comandos
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const file = process.argv[2];
  if (file === undefined || process.argv.length > 3) {
    console.error('Uso: node scripts/smoke/deploy-url.ts ARCHIVO_DE_WRANGLER');
    process.exitCode = 2;
  } else {
    let text = '';
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      console.error('No se pudo leer el archivo de salida de wrangler');
      process.exitCode = 1;
    }
    if (process.exitCode !== 1) {
      const details = parseWranglerOutput(text);
      if (details === null) {
        console.error('El archivo de wrangler no trae la dirección de un despliegue de pages.dev');
        process.exitCode = 1;
      } else {
        console.log(outputLines(details).join('\n'));
      }
    }
  }
}
