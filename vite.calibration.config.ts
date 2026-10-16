// Build de la calibración nocturna (B14, 3.1 del plan de B14). Empaqueta con Vite en modo SSR los motores
// puros de src/engines/calibration y el proceso de scripts/calibration en dist-calibration, porque los
// motores usan el alias @ y rutas sin extensión que Node no resuelve solo. Las dependencias (zod,
// date-fns, ts-fsrs, supabase-js y postgres) quedan como externas y las resuelve node_modules. Nada de
// esto entra al build de la app.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: true,
    outDir: 'dist-calibration',
    emptyOutDir: true,
    target: 'node22',
    sourcemap: false,
    minify: false,
    reportCompressedSize: false,
    rolldownOptions: {
      input: {
        calibrate: fileURLToPath(new URL('./scripts/calibration/calibrate.ts', import.meta.url)),
        selftest: fileURLToPath(new URL('./scripts/calibration/selftest.ts', import.meta.url)),
      },
      output: { entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs' },
    },
  },
});
