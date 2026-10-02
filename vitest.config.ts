import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Entorno node por defecto. Las pruebas de componentes declaran jsdom en su encabezado
    environment: 'node',
    include: [
      'src/**/*.test.{ts,tsx}',
      'server/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'tests/architecture/**/*.test.ts',
    ],
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'server/src/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'src/main.tsx'],
      reportsDirectory: './coverage',
    },
  },
});
