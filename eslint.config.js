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
  '@/config/.*',
];
const ENGINE_FORBIDDEN_IMPORT_REGEX = `^(?!(?:${ENGINE_ALLOWED_IMPORTS.join('|')})$).*`;

export default defineConfig([
  globalIgnores([
    'dist',
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

  // El router es configuración, no un módulo de componentes con recarga en caliente
  {
    files: ['src/app/router.tsx'],
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
