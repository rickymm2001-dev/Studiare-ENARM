// Los archivos que lleva una Edge Function al desplegarla (docs/DESPLIEGUE.md). Parte de su index.ts y
// sigue cada import y export relativo, también los de solo tipos y los import() dinámicos, como hace
// supabase functions deploy (WalkImportPaths del CLI). Las rutas quedan desde la raíz del repo, así que
// '../_shared/x.ts' dentro de supabase/functions/create-checkout se sube como
// supabase/functions/_shared/x.ts y se resuelve igual en el servidor.
import { readFileSync } from 'node:fs';
import { posix, join } from 'node:path';

export const FUNCTIONS_DIR = 'supabase/functions';

/**
 * Lo que importa o reexporta un módulo. Sigue la idea del patrón del CLI de Supabase, pero exige que
 * la sentencia empiece la línea y lleve from, para no tomar una constante como
 * export const X = 'https://...' por un import
 */
const IMPORT_PATTERNS = [
  /^\s*(?:import|export)\s+(?:type\s+)?[^'";]*?\bfrom\s*['"]([^'"]+)['"]/gm,
  /^\s*import\s*['"]([^'"]+)['"]/gm,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** Las líneas que solo son comentario, para que un ejemplo en un comentario no cuente como import */
const LINE_COMMENT = /^\s*\/\/.*$/gm;

export interface ClosureFile {
  /** Desde la raíz del repo, con barras normales */
  path: string;
  content: string;
  bytes: number;
}

export interface FunctionClosure {
  slug: string;
  entrypointPath: string;
  /** El index.ts primero y después en orden alfabético. Incluye el deno.json de la función si lo tiene */
  files: ClosureFile[];
  /**
   * La ruta del deno.json de la función, desde la raíz del repo, o null si no tiene. Es su mapa de
   * imports. Las funciones que importan zod, hono o el SDK de Anthropic por su nombre lo necesitan,
   * porque el servidor no puede resolver esos nombres sin él
   */
  importMapPath: string | null;
  /** Importaciones que no son relativas, como npm: o https:. No se suben, el servidor las baja */
  external: string[];
}

export class ClosureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClosureError';
  }
}

/** Lo que importa un módulo, en el orden en que aparece */
export function importSpecifiers(source: string): string[] {
  const code = source.replace(LINE_COMMENT, '');
  const found: { at: number; specifier: string }[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of code.matchAll(pattern)) {
      found.push({ at: match.index, specifier: (match[1] ?? '').trim() });
    }
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.specifier)
    .filter((specifier) => specifier !== '');
}

const isRelative = (specifier: string) => specifier.startsWith('./') || specifier.startsWith('../');

export function functionClosure(
  root: string,
  slug: string,
  readFile: (path: string) => string = (path) => readFileSync(join(root, path), 'utf8'),
): FunctionClosure {
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) throw new ClosureError(`El nombre ${slug} no es válido`);
  const entrypointPath = `${FUNCTIONS_DIR}/${slug}/index.ts`;
  const seen = new Map<string, ClosureFile>();
  const external = new Set<string>();
  const pending = [entrypointPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) continue;
    let content: string;
    try {
      content = readFile(current);
    } catch {
      throw new ClosureError(
        current === entrypointPath
          ? `La función ${slug} no tiene ${entrypointPath}`
          : `${current} no existe y lo importa la función ${slug}`,
      );
    }
    seen.set(current, { path: current, content, bytes: Buffer.byteLength(content, 'utf8') });
    for (const specifier of importSpecifiers(content)) {
      if (!isRelative(specifier)) {
        external.add(specifier);
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(current), specifier));
      if (!target.startsWith(`${FUNCTIONS_DIR}/`)) {
        throw new ClosureError(
          `${current} importa ${specifier}, que queda fuera de ${FUNCTIONS_DIR}. Las funciones solo suben lo que vive ahí`,
        );
      }
      if (!posix.extname(target)) {
        throw new ClosureError(`${current} importa ${specifier} sin extensión. Deno la necesita`);
      }
      pending.push(target);
    }
  }
  // El mapa de imports no lo importa nadie, pero la función lo necesita para resolver sus paquetes
  const importMapPath = `${FUNCTIONS_DIR}/${slug}/deno.json`;
  let importMap: ClosureFile | null = null;
  try {
    const content = readFile(importMapPath);
    importMap = { path: importMapPath, content, bytes: Buffer.byteLength(content, 'utf8') };
  } catch {
    // Sin deno.json, la función solo usa rutas relativas y npm: o https: completos
  }
  if (importMap) seen.set(importMap.path, importMap);
  const files = [...seen.values()].sort((a, b) =>
    a.path === entrypointPath ? -1 : b.path === entrypointPath ? 1 : a.path.localeCompare(b.path),
  );
  return {
    slug,
    entrypointPath,
    files,
    importMapPath: importMap ? importMapPath : null,
    external: [...external].sort(),
  };
}
