// Pruebas de rendimiento (V5-B0). Son los archivos *.performance.test.ts, que miden milisegundos con un
// tope fijo (Buscar tarjetas con 10,000 y 50,000 tarjetas en menos de 100 ms, el índice de duplicados con
// 20,000 notas en menos de 2 segundos). En una máquina ocupada
// fallan sin que nada esté roto, así que vitest.config.ts las deja fuera de npm run check y aquí corren
// solas con npm run test:perf, con el mismo entorno, alias y preparación que las demás. En el CI van en
// un trabajo aparte que no bloquea el pull request
import { configDefaults, defineConfig } from 'vitest/config';
import base from './vitest.config.ts';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/**/*.performance.test.{ts,tsx}'],
    exclude: [...configDefaults.exclude],
    coverage: { enabled: false },
  },
});
