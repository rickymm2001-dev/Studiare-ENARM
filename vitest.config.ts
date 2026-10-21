import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // El plugin de PWA no corre en pruebas unitarias. Este sustituto no registra nada
      'virtual:pwa-register/react': fileURLToPath(
        new URL('./tests/setup/pwa-register-stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    // Entorno node por defecto. Las pruebas de componentes declaran jsdom en su encabezado
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'server/**/*.test.ts',
      'supabase/functions/**/*.test.ts',
      'scripts/**/*.test.ts',
      'tests/calibration/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'tests/architecture/**/*.test.ts',
      'tests/recovery/**/*.test.ts',
      'tests/demo/**/*.test.ts',
      'tests/content/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/src/**/*.ts', 'supabase/functions/_shared/**/*.ts'],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/main.tsx',
        'src/**/testing/**',
        'src/**/*.d.ts',
        // Dobles de prueba y copias generadas. Sus originales en src ya cuentan (B12, 1.3 del plan)
        'supabase/functions/**/testing/**',
        'supabase/functions/_shared/ai/engines/**',
        'supabase/functions/_shared/ai/prompts.generated.ts',
        'supabase/functions/_shared/bank/generated/**',
      ],
      reportsDirectory: './coverage',
      // Cobertura de 90% o más en los motores (14.1, criterio de la Fase B)
      thresholds: {
        'src/engines/**': { lines: 90, statements: 90, functions: 90, branches: 90 },
      },
    },
  },
});
