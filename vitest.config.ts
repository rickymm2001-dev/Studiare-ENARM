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
      'tests/security/**/*.test.ts',
      'tests/architecture/**/*.test.ts',
      'tests/recovery/**/*.test.ts',
      'tests/demo/**/*.test.ts',
      'tests/content/**/*.test.ts',
    ],
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/src/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'src/main.tsx', 'src/**/testing/**', 'src/**/*.d.ts'],
      reportsDirectory: './coverage',
      // Cobertura de 90% o más en los motores (14.1, criterio de la Fase B)
      thresholds: {
        'src/engines/**': { lines: 90, statements: 90, functions: 90, branches: 90 },
      },
    },
  },
});
