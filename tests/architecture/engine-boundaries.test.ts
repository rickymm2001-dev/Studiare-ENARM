// Los motores no importan React ni Dexie (criterio de la Fase A, 5 Políticas).
// Se revisa de tres formas.
// 1. ESLint tiene una lista blanca de importaciones para src/engines y la regla real se comporta bien
// 2. Una revisión transitiva sigue cada importación interna desde src/engines y confirma que solo
//    llega a motores, esquemas y configuración, y que de ahí solo salen paquetes permitidos
// 3. Ningún motor lee el reloj ni el azar del sistema
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { ESLint } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** Debe coincidir con ENGINE_ALLOWED_IMPORTS de eslint.config.js */
const ALLOWED_PACKAGES = [/^zod$/, /^ts-fsrs$/, /^date-fns(\/.*)?$/, /^@date-fns\/tz$/];
const ALLOWED_INTERNAL_DIRS = ['src/engines', 'src/data/schemas', 'src/config'];
const FORBIDDEN_GLOBALS = [/\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/, /\bMath\.random\s*\(/];

function specifiersOf(source: string): string[] {
  return [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1] ?? '');
}

function resolveInternal(root: string, fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(root, 'src', specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find((path) => statSync(path, { throwIfNoEntry: false })?.isFile()) ?? null;
}

function isInside(root: string, file: string, dir: string): boolean {
  const relativePath = relative(join(root, dir), file);
  return !relativePath.startsWith('..') && !relativePath.includes(`..${sep}`);
}

function listSourceFiles(dir: string): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Sigue las importaciones desde los motores, o desde las entradas dadas, y devuelve cada frontera rota */
function findTransitiveViolations(
  root: string,
  entries: string[] = listSourceFiles(join(root, 'src', 'engines')),
): string[] {
  const violations: string[] = [];
  const pending = [...entries];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, 'utf8');
    const name = relative(root, file).replaceAll('\\', '/');
    if (isInside(root, file, 'src/engines')) {
      for (const pattern of FORBIDDEN_GLOBALS) {
        if (pattern.test(source)) violations.push(`${name} usa ${pattern.source}`);
      }
    }
    for (const specifier of specifiersOf(source)) {
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const target = resolveInternal(root, file, specifier);
        if (!target) {
          violations.push(`${name} importa ${specifier}, que no se encontró`);
        } else if (!ALLOWED_INTERNAL_DIRS.some((dir) => isInside(root, target, dir))) {
          violations.push(
            `${name} importa ${specifier}, fuera de motores, esquemas y configuración`,
          );
        } else {
          pending.push(target);
        }
      } else if (!ALLOWED_PACKAGES.some((pattern) => pattern.test(specifier))) {
        violations.push(`${name} importa el paquete ${specifier}`);
      }
    }
  }
  return violations;
}

/** Arma un proyecto falso en una carpeta temporal para probar el detector */
function fakeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'enarm-arch-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

let engineRules: Record<string, unknown> = {};
let screenRules: Record<string, unknown> = {};
const tempRoots: string[] = [];

beforeAll(async () => {
  // ESLint tarda en cargar la configuración con tipos. Se hace una sola vez y con margen
  const eslint = new ESLint({ cwd: ROOT });
  const engineConfig = (await eslint.calculateConfigForFile('src/engines/example.ts')) as {
    rules: Record<string, unknown>;
  };
  const screenConfig = (await eslint.calculateConfigForFile('src/features/example.tsx')) as {
    rules: Record<string, unknown>;
  };
  engineRules = engineConfig.rules;
  screenRules = screenConfig.rules;
}, 60_000);

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

describe('fronteras de src/engines', () => {
  it('la regla real de ESLint prohíbe todo lo que no está en la lista blanca', () => {
    const rule = engineRules['no-restricted-imports'] as [
      unknown,
      { patterns: { regex: string }[] },
    ];
    const regex = new RegExp(rule[1].patterns[0]?.regex ?? '^$');
    const forbidden = [
      'react',
      'react-dom/client',
      'dexie',
      'dexie-react-hooks',
      'zustand',
      'react-router',
      '@/data/hooks',
      '@/data/context',
      '@/data/DataProvider',
      '@/data/db/database',
      '@/data/testing/fixtures',
      '@/features/review/x',
      '@/ui/cn',
      '../data/db/database',
    ];
    const allowed = [
      'zod',
      'ts-fsrs',
      'date-fns',
      'date-fns/addDays',
      '@date-fns/tz',
      './stats',
      '@/engines/stats/wilson',
      '@/data/schemas/common',
      '@/config/thresholds',
    ];
    for (const specifier of forbidden) expect(regex.test(specifier), specifier).toBe(true);
    for (const specifier of allowed) expect(regex.test(specifier), specifier).toBe(false);
  });

  it('ESLint también prohíbe el reloj y el azar del sistema en motores', () => {
    const syntax = JSON.stringify(engineRules['no-restricted-syntax']);
    expect(syntax).toContain('Date');
    expect(syntax).toContain('random');
  });

  it('la revisión transitiva detecta una importación indirecta de Dexie y deja pasar lo permitido', () => {
    const bad = fakeProject({
      'src/engines/bad.ts': "import { useLiveData } from '@/data/hooks';\n",
      'src/data/hooks.ts': "import { useLiveQuery } from 'dexie-react-hooks';\n",
    });
    const clock = fakeProject({ 'src/engines/clock.ts': 'export const t = Date.now();\n' });
    const good = fakeProject({
      'src/engines/good.ts':
        "import { z } from 'zod';\nimport { IdSchema } from '@/data/schemas/common';\nexport const f = (now: Date) => new Date(now);\n",
      'src/data/schemas/common.ts': "import { z } from 'zod';\nexport const IdSchema = z.ulid();\n",
    });
    tempRoots.push(bad, clock, good);
    expect(findTransitiveViolations(bad)).toEqual([
      'src/engines/bad.ts importa @/data/hooks, fuera de motores, esquemas y configuración',
    ]);
    expect(findTransitiveViolations(clock)).toHaveLength(1);
    expect(findTransitiveViolations(good)).toEqual([]);
  });

  it('ningún motor real rompe las fronteras, ni directa ni indirectamente', () => {
    expect(findTransitiveViolations(ROOT)).toEqual([]);
  });

  it('los esquemas y la configuración que pueden usar los motores tampoco traen React ni Dexie', () => {
    // Se revisan como si un motor importara cada uno de ellos
    const entries = [
      ...listSourceFiles(join(ROOT, 'src', 'data', 'schemas')),
      ...listSourceFiles(join(ROOT, 'src', 'config')),
    ];
    expect(entries.length).toBeGreaterThan(0);
    expect(findTransitiveViolations(ROOT, entries)).toEqual([]);
  });

  it('las pantallas tampoco importan Dexie directo', () => {
    expect(JSON.stringify(screenRules['no-restricted-imports'])).toContain('"dexie"');
  });
});
