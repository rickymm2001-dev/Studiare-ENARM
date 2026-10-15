// Las Edge Functions se despliegan solas, sin el resto del repo (B12, 7.6). Se revisa que
// 1. Lo que importa cada supabase/functions/*/index.ts se queda dentro de supabase/functions, sin
//    pruebas ni dobles de prueba, y que todo paquete sale del deno.json de esa función, con la misma
//    versión que package.json
// 2. _shared no usa Deno, process, Buffer ni node:, y solo los index.ts leen el entorno. runtime.ts es la
//    excepción de las funciones de pagos y del banco, que lo leen ahí
// 3. Las funciones de IA leen exactamente los nombres de la sección 2.7, y env.ts valida los mismos
// 4. Nada que llegue a producción menciona la clave ni la API de OpenAI, que solo usan las evaluaciones,
//    ni el nombre de variable que CLAUDE.md prohíbe
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AI_BATCH_ENV_NAMES, AI_PROXY_ENV_NAMES } from '../../supabase/functions/_shared/ai/env.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const FUNCTIONS = join(ROOT, 'supabase', 'functions');
const SHARED = join(FUNCTIONS, '_shared');

/** Sección 2.7 del plan de B12. ai-batch no atiende al navegador, así que no lee APP_ORIGINS */
const SUPABASE_NAMES = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const EXPECTED_ENV: Record<string, string[]> = {
  'ai-proxy': ['ENARM_ANTHROPIC_KEY', 'APP_ORIGINS', 'AI_ALLOW_MOCK', ...SUPABASE_NAMES],
  'ai-batch': ['ENARM_ANTHROPIC_KEY', 'AI_ALLOW_MOCK', 'AI_TICK_DEADLINE_MS', ...SUPABASE_NAMES],
};

function listFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function rel(path: string): string {
  return relative(ROOT, path).split(sep).join('/');
}

function isInside(file: string, dir: string): boolean {
  const relativePath = relative(dir, file);
  return (
    relativePath !== '' && !relativePath.startsWith('..') && !relativePath.includes(`..${sep}`)
  );
}

/** El código sin comentarios, para no contar un Deno o un node: que solo se nombra en el texto */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

function specifiersOf(source: string): string[] {
  const code = withoutComments(source);
  return [
    ...code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...code.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ...code.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1] ?? '');
}

function isRelative(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

interface Closure {
  files: string[];
  bare: Set<string>;
  missing: string[];
}

/** Todos los archivos a los que llega un index.ts, siguiendo sus importaciones relativas */
function closureOf(entry: string): Closure {
  const files = new Set<string>();
  const bare = new Set<string>();
  const missing: string[] = [];
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop() ?? '';
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of specifiersOf(readFileSync(file, 'utf8'))) {
      if (!isRelative(specifier)) {
        bare.add(specifier);
        continue;
      }
      const target = resolve(dirname(file), specifier);
      if (statSync(target, { throwIfNoEntry: false })?.isFile()) pending.push(target);
      else missing.push(`${rel(file)} -> ${specifier}`);
    }
  }
  return { files: [...files].sort(), bare, missing };
}

const ENTRIES = readdirSync(FUNCTIONS)
  .filter((name) => !name.startsWith('_'))
  .map((name) => ({ name, entry: join(FUNCTIONS, name, 'index.ts') }))
  .filter(({ entry }) => statSync(entry, { throwIfNoEntry: false })?.isFile());

interface DenoJson {
  imports?: Record<string, string>;
}

function denoImportsOf(name: string): Record<string, string> | null {
  const path = join(FUNCTIONS, name, 'deno.json');
  if (!statSync(path, { throwIfNoEntry: false })?.isFile()) return null;
  return (JSON.parse(readFileSync(path, 'utf8')) as DenoJson).imports ?? {};
}

/** La entrada del mapa de importaciones que atiende un nombre de paquete, exacta o por prefijo */
function mappingFor(imports: Record<string, string>, specifier: string): string | null {
  if (imports[specifier] !== undefined) return imports[specifier];
  const prefix = Object.keys(imports)
    .filter((key) => key.endsWith('/') && specifier.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return prefix === undefined ? null : (imports[prefix] ?? null);
}

const PACKAGE_JSON = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const PACKAGE_VERSIONS: Record<string, string> = {
  ...PACKAGE_JSON.devDependencies,
  ...PACKAGE_JSON.dependencies,
};

/** npm:zod@4.6.5 o npm:/hono@4.13.12/ dan el paquete y su versión */
function npmTarget(target: string): { name: string; version: string } | null {
  const match = /^npm:\/?((?:@[^/@]+\/)?[^/@]+)@([^/]+)\/?$/.exec(target);
  return match ? { name: match[1] ?? '', version: match[2] ?? '' } : null;
}

function denoEnvReads(source: string): string[] {
  return [...withoutComments(source).matchAll(/\bDeno\.env\.get\(\s*'([A-Z0-9_]+)'\s*\)/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('lo que importa cada función', () => {
  it('encuentra las funciones de IA y las anteriores', () => {
    const names = ENTRIES.map(({ name }) => name);
    expect(names).toEqual(
      expect.arrayContaining(['ai-proxy', 'ai-batch', 'bank-sync', 'create-checkout']),
    );
  });

  it.each(ENTRIES)('$name se queda dentro de supabase/functions, sin pruebas', ({ entry }) => {
    const { files, missing } = closureOf(entry);
    expect(missing).toEqual([]);
    const outside = files.filter((file) => !isInside(file, FUNCTIONS)).map(rel);
    expect(outside).toEqual([]);
    const testOnly = files
      .filter((file) => file.endsWith('.test.ts') || file.split(sep).includes('testing'))
      .map(rel);
    expect(testOnly).toEqual([]);
  });

  it.each(ENTRIES)('$name toma cada paquete de su deno.json', ({ name, entry }) => {
    const { bare } = closureOf(entry);
    const imports = denoImportsOf(name);
    const builtins = [...bare].filter((specifier) => /^(node|jsr|npm|https?):/.test(specifier));
    expect(builtins).toEqual([]);
    if (imports === null) {
      expect([...bare]).toEqual([]);
      return;
    }
    const unmapped = [...bare].filter((specifier) => mappingFor(imports, specifier) === null);
    expect(unmapped).toEqual([]);
  });

  it('los deno.json piden las mismas versiones que package.json', () => {
    let checked = 0;
    for (const { name } of ENTRIES) {
      const imports = denoImportsOf(name);
      if (imports === null) continue;
      for (const [key, target] of Object.entries(imports)) {
        const parsed = npmTarget(target);
        expect(parsed, `${name}/deno.json ${key}`).not.toBeNull();
        if (parsed === null) continue;
        expect(key.replace(/\/$/, ''), `${name}/deno.json ${key}`).toBe(parsed.name);
        expect(parsed.version, `${name}/deno.json ${key}`).toBe(PACKAGE_VERSIONS[parsed.name]);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });

  it('la revisión sí detecta un paquete sin mapa y una versión distinta', () => {
    const imports = { zod: 'npm:zod@4.6.5', 'hono/': 'npm:/hono@4.13.12/' };
    expect(mappingFor(imports, 'hono/body-limit')).toBe('npm:/hono@4.13.12/');
    expect(mappingFor(imports, 'hono')).toBeNull();
    expect(mappingFor(imports, '@anthropic-ai/sdk')).toBeNull();
    expect(npmTarget('npm:/@anthropic-ai/sdk@0.132.1/')).toEqual({
      name: '@anthropic-ai/sdk',
      version: '0.132.1',
    });
    expect(npmTarget('npm:zod@^4')).toEqual({ name: 'zod', version: '^4' });
    expect(npmTarget('https://esm.sh/zod')).toBeNull();
  });
});

describe('_shared no depende del entorno', () => {
  const sources = listFiles(SHARED).filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.endsWith('.test.ts') &&
      !file.split(sep).includes('testing') &&
      file !== join(SHARED, 'runtime.ts'),
  );

  it('revisa los archivos del núcleo de IA', () => {
    expect(sources.map(rel)).toEqual(
      expect.arrayContaining([
        'supabase/functions/_shared/ai/routes.ts',
        'supabase/functions/_shared/ai/edge.ts',
        'supabase/functions/_shared/ai/env.ts',
      ]),
    );
  });

  it('no usa Deno, process, Buffer ni node:', () => {
    const offending = sources.flatMap((file) => {
      const code = withoutComments(readFileSync(file, 'utf8'));
      const found: string[] = [];
      if (/\bDeno\./.test(code)) found.push('Deno');
      if (/\bprocess\./.test(code)) found.push('process');
      if (/\bBuffer\b/.test(code)) found.push('Buffer');
      if (specifiersOf(code).some((specifier) => specifier.startsWith('node:')))
        found.push('node:');
      if (/\bEdgeRuntime\b/.test(code)) found.push('EdgeRuntime');
      return found.map((what) => `${rel(file)} usa ${what}`);
    });
    expect(offending).toEqual([]);
  });

  it('la revisión no se confunde con un comentario o una URL', () => {
    const code = withoutComments(
      "// Deno.env.get('X') solo en el texto\nconst url = 'https://x.supabase.co'; /* process.env */",
    );
    expect(code).not.toMatch(/Deno\.|process\./);
    expect(code).toContain('https://x.supabase.co');
  });
});

describe('el entorno de las funciones de IA', () => {
  it.each(Object.keys(EXPECTED_ENV))('%s lee exactamente los nombres de 2.7', (name) => {
    const source = readFileSync(join(FUNCTIONS, name, 'index.ts'), 'utf8');
    expect([...denoEnvReads(source)].sort()).toEqual([...(EXPECTED_ENV[name] ?? [])].sort());
    // Nada de leer el entorno completo ni con un nombre armado
    const code = withoutComments(source);
    expect(code).not.toMatch(/Deno\.env\.(toObject|has|set|delete)\b/);
    expect(code.match(/Deno\.env\.get\(/g)?.length).toBe(EXPECTED_ENV[name]?.length);
  });

  it('env.ts valida los mismos nombres que leen los index.ts', () => {
    expect([...AI_PROXY_ENV_NAMES].sort()).toEqual([...(EXPECTED_ENV['ai-proxy'] ?? [])].sort());
    expect([...AI_BATCH_ENV_NAMES].sort()).toEqual([...(EXPECTED_ENV['ai-batch'] ?? [])].sort());
  });
});

describe('el cliente de Anthropic se arma en un solo lugar', () => {
  // anthropic.ts lo crea con la clave explícita y sin leer credenciales del entorno (10.29). El proxy de
  // desarrollo y las dos funciones lo usan de ahí, y nadie más llama al constructor del SDK
  it('solo supabase/functions/_shared/ai/anthropic.ts crea el cliente del SDK', () => {
    const dirs = [FUNCTIONS, join(ROOT, 'server', 'src'), join(ROOT, 'src')];
    const creators = dirs
      .flatMap((dir) => listFiles(dir))
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => /\bnew\s+Anthropic\s*\(/.test(withoutComments(readFileSync(file, 'utf8'))))
      .map(rel);
    expect(creators).toEqual(['supabase/functions/_shared/ai/anthropic.ts']);
  });
});

describe('nada de OpenAI ni del nombre prohibido en producción', () => {
  // Los textos se arman por partes para que esta prueba no se encuentre a sí misma si alguien la mueve
  const openAiNeedles = [
    ['ENARM', 'OPENAI', 'KEY'].join('_'),
    ['api', 'openai', 'com'].join('.'),
    ['server', 'evals', 'providers'].join('/'),
    ['evals', 'providers', 'openai'].join('/'),
  ];
  const forbiddenName = ['ANTHROPIC', 'API', 'KEY'].join('_');
  const productionDirs = [FUNCTIONS, join(ROOT, 'src'), join(ROOT, 'server', 'src')];

  it.each(productionDirs.map((dir) => ({ dir: rel(dir), path: dir })))(
    '$dir no menciona la clave ni la API de OpenAI',
    ({ path }) => {
      const files = listFiles(path);
      expect(files.length).toBeGreaterThan(5);
      const hits = files.flatMap((file) => {
        const content = readFileSync(file, 'utf8');
        return openAiNeedles
          .filter((needle) => content.includes(needle))
          .map((needle) => `${rel(file)}: ${needle}`);
      });
      expect(hits).toEqual([]);
    },
  );

  it('supabase/functions no menciona el nombre de variable que CLAUDE.md prohíbe', () => {
    const hits = listFiles(FUNCTIONS)
      .filter((file) => readFileSync(file, 'utf8').includes(forbiddenName))
      .map(rel);
    expect(hits).toEqual([]);
  });
});
