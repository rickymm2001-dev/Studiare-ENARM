import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Lo único que un motor puro puede importar (PLAN.md 2.1). Es lista blanca, así una importación
// nueva que traiga React o Dexie de forma indirecta no se cuela. Debe coincidir con
// tests/architecture/engine-boundaries.test.ts
const ENGINE_ALLOWED_IMPORTS = [
  'zod',
  'ts-fsrs',
  'date-fns(?:/.*)?',
  '@date-fns/tz',
  String.raw`\./.*`,
  '@/engines/.*',
  '@/data/schemas/.*',
  // Los contratos de B14 (solo tipos, sin importaciones) que comparten los motores y la app
  '@/data/model/contracts',
  '@/config/.*',
];
const ENGINE_FORBIDDEN_IMPORT_REGEX = `^(?!(?:${ENGINE_ALLOWED_IMPORTS.join('|')})$).*`;

// Lo compartido de las Edge Functions corre en Deno y se prueba en Node, así que no usa nada propio de
// ninguno de los dos ni importa fuera de supabase/functions (B12, 1.1 y 7.6 del plan). Lo de src llega
// por las copias generadas (npm run ai:sync y npm run bank:shared)
const FUNCTIONS_ESCAPE_REGEX = String.raw`^(?:\.\./)+(?:src|server|scripts|tests)/`;
const NODE_BUILTIN_REGEX = String.raw`^(?:node:.*|(?:fs|path|os|crypto|url|util|child_process|http|https|net|stream|buffer|events|zlib|worker_threads)(?:/.*)?)$`;
const SHARED_IMPORT_PATTERNS = [
  {
    regex: NODE_BUILTIN_REGEX,
    message: 'Lo compartido de las funciones corre en Deno. Sin módulos de Node.',
  },
  {
    regex: FUNCTIONS_ESCAPE_REGEX,
    message:
      'Las funciones no importan de src, server, scripts ni tests. Lo de src llega por su copia generada.',
  },
  {
    regex: '^@/',
    message: 'Las funciones no importan de src. Lo de src llega por su copia generada.',
  },
];
// El núcleo de IA solo importa los paquetes que mapean los deno.json de ai-proxy y ai-batch, con su
// versión exacta del package.json (B12, 1.4 del plan), y archivos de supabase/functions
const AI_SHARED_ALLOWED_IMPORTS = [
  'zod',
  'hono(?:/.*)?',
  '@anthropic-ai/sdk(?:/.*)?',
  String.raw`\.{1,2}/.*`,
];
const AI_SHARED_FORBIDDEN_IMPORT_REGEX = `^(?!(?:${AI_SHARED_ALLOWED_IMPORTS.join('|')})$).*`;

export default defineConfig([
  globalIgnores([
    'dist',
    // Build de las e2e de nube, con el Supabase simulado (B1 del plan del cambio)
    'dist-cloud',
    // Build de la calibración nocturna (B14), con su propio vite.calibration.config.ts
    'dist-calibration',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results',
    '.vitest',
    'node_modules',
    // Workflows de Claude Code. Usan globales del runtime de workflows (agent, parallel, args)
    '.claude',
    '.review',
  ]),

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      comments.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // any solo con un comentario que lo justifique (5, Políticas)
      '@typescript-eslint/no-explicit-any': 'error',
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Choca con no-non-null-assertion, que sí queremos. Una aserción con as queda explícita
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    },
  },

  // Navegador y React
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // El router es configuración y el armado de pantallas de prueba solo corre en Vitest, así que no
  // son módulos de componentes con recarga en caliente
  {
    files: ['src/app/router.tsx', 'src/app/testing/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Las pantallas y la app no tocan Dexie directo, solo repositorios y hooks (PLAN.md 2.1)
  {
    files: [
      'src/app/**/*.{ts,tsx}',
      'src/features/**/*.{ts,tsx}',
      'src/ui/**/*.{ts,tsx}',
      'src/ai/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['dexie', '@/data/db/*', '**/data/db/**'],
              message: 'Las pantallas usan repositorios y hooks de src/data, nunca Dexie directo.',
            },
          ],
        },
      ],
    },
  },

  // Motores puros. Sin React, sin Dexie, sin reloj ni azar del sistema (5, Políticas)
  {
    files: ['src/engines/**/*.{ts,tsx}'],
    // Las pruebas de los motores sí importan vitest. Ellas no se publican
    ignores: ['src/engines/**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: ENGINE_FORBIDDEN_IMPORT_REGEX,
              message:
                'Los motores son funciones puras. Solo importan zod, ts-fsrs, date-fns, otros motores, esquemas y configuración.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'fetch',
        'navigator',
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Los motores reciben el reloj como parámetro (now).',
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'Los motores reciben el reloj como parámetro (now).',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'Los motores reciben la semilla del azar como parámetro.',
        },
      ],
    },
  },

  // Lo compartido de las Edge Functions. Sin Node, sin Deno y sin importar fuera de supabase/functions.
  // Solo runtime.ts y monitoringRuntime.ts (el aviso a Sentry, aparte para que la IA no cargue todo runtime.ts)
  // arman las dependencias desde el entorno de Deno
  {
    files: ['supabase/functions/_shared/**/*.ts'],
    ignores: [
      'supabase/functions/_shared/**/*.test.ts',
      'supabase/functions/_shared/runtime.ts',
      'supabase/functions/_shared/monitoringRuntime.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: SHARED_IMPORT_PATTERNS }],
      'no-restricted-globals': [
        'error',
        'process',
        'Buffer',
        'Deno',
        'EdgeRuntime',
        'require',
        'module',
        '__dirname',
        '__filename',
        'global',
      ],
    },
  },

  // El núcleo de IA, además, solo con zod, hono y el SDK de Anthropic (B12, 1.4 del plan)
  {
    files: ['supabase/functions/_shared/ai/**/*.ts'],
    ignores: ['supabase/functions/_shared/ai/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...SHARED_IMPORT_PATTERNS,
            {
              regex: AI_SHARED_FORBIDDEN_IMPORT_REGEX,
              message:
                'El núcleo de IA solo importa zod, hono, @anthropic-ai/sdk y archivos de supabase/functions. Un paquete nuevo necesita su entrada en deno.json.',
            },
          ],
        },
      ],
    },
  },

  // Proxy, scripts, configuración y pruebas de Node
  {
    files: [
      'server/**/*.ts',
      'scripts/**/*.ts',
      'tests/**/*.ts',
      '*.config.ts',
      'playwright*.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
    },
  },

  // El propio archivo de configuración es JavaScript sin tipos
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
]);
