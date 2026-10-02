// Los motores no importan React ni Dexie (criterio de la Fase A, 5 Políticas).
// Se revisa de dos formas. Que ESLint tenga la regla para src/engines y que ningún archivo la rompa.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const ENGINES_DIR = join(ROOT, 'src', 'engines');

const FORBIDDEN_IMPORT = [
  /^react(\/|$)/,
  /^react-dom(\/|$)/,
  /^react-router(\/|$)/,
  /^dexie(-react-hooks)?$/,
  /^zustand(\/|$)/,
  /^@\/(app|features|ui|ai|workers|data\/(db|repos|usecases))(\/|$)/,
  /(^|\/)(app|features|ui|db|repos|usecases)(\/|$)/,
];
const FORBIDDEN_GLOBALS = [/\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/, /\bMath\.random\s*\(/];

function findViolations(source: string): string[] {
  const violations: string[] = [];
  const specifiers = [
    ...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ...source.matchAll(/\bimport\s+['"]([^'"]+)['"]/g),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((match) => match[1] ?? '');
  for (const specifier of specifiers) {
    if (FORBIDDEN_IMPORT.some((pattern) => pattern.test(specifier))) {
      violations.push(`importa ${specifier}`);
    }
  }
  for (const pattern of FORBIDDEN_GLOBALS) {
    if (pattern.test(source)) violations.push(`usa ${pattern.source}`);
  }
  return violations;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return listSourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('fronteras de src/engines', () => {
  it('el detector encuentra importaciones y relojes prohibidos', () => {
    expect(findViolations("import { useState } from 'react';")).toEqual(['importa react']);
    expect(findViolations("import Dexie from 'dexie';")).toEqual(['importa dexie']);
    expect(findViolations("import { db } from '../data/db/database';")).toHaveLength(1);
    expect(findViolations("const m = await import('@/features/review/x');")).toHaveLength(1);
    expect(findViolations('const t = Date.now();')).toHaveLength(1);
    expect(findViolations('const t = new Date();')).toHaveLength(1);
    expect(findViolations('const r = Math.random();')).toHaveLength(1);
    expect(findViolations("import { z } from 'zod';\nconst d = new Date(now);")).toEqual([]);
  });

  it('ningún archivo de src/engines rompe las fronteras', () => {
    for (const file of listSourceFiles(ENGINES_DIR)) {
      const violations = findViolations(readFileSync(file, 'utf8'));
      expect(violations, relative(ROOT, file)).toEqual([]);
    }
  });

  it('ESLint tiene las reglas de motores puros para src/engines', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const config = (await eslint.calculateConfigForFile('src/engines/example.ts')) as {
      rules: Record<string, unknown>;
    };
    const restricted = JSON.stringify(config.rules['no-restricted-imports']);
    for (const name of ['react', 'dexie', 'zustand', 'react-router', '@/data/db/*']) {
      expect(restricted).toContain(`"${name}"`);
    }
    const syntax = JSON.stringify(config.rules['no-restricted-syntax']);
    expect(syntax).toContain('Date');
    expect(syntax).toContain('random');
  });

  it('las pantallas tampoco importan Dexie directo', async () => {
    const eslint = new ESLint({ cwd: ROOT });
    const config = (await eslint.calculateConfigForFile('src/features/example.tsx')) as {
      rules: Record<string, unknown>;
    };
    expect(JSON.stringify(config.rules['no-restricted-imports'])).toContain('"dexie"');
  });
});
