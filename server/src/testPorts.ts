// Puertos de los servidores que levanta Playwright. La vista previa del build (4173), la vista previa
// del build con la nube simulada (4174) y el proxy de IA simulado (8787). PW_PORT_OFFSET los corre a
// los tres juntos, para que varias copias del repositorio (git worktree) corran Playwright al mismo
// tiempo sin chocar ni reusar el servidor de otra copia. Sin la variable quedan los de siempre.
// Lo leen las configuraciones de Playwright, vite.config.ts y server/src/main.ts. Ver tests/e2e/README.md
import { ALLOWED_ORIGINS, PROXY_HOST, PROXY_PORT } from './config.ts';

export const PORT_OFFSET_VARIABLE = 'PW_PORT_OFFSET';

export const BASE_PREVIEW_PORT = 4173;
export const BASE_CLOUD_PREVIEW_PORT = 4174;

/**
 * El desplazamiento va de 10 en 10, así el juego de una copia nunca cae en el de otra (la nube usa el
 * puerto siguiente al de la vista previa). El tope deja la vista previa abajo de 5173, el puerto de
 * npm run dev, y el proxy abajo de 9800
 */
export const PORT_OFFSET_STEP = 10;
export const MAX_PORT_OFFSET = 990;

export interface TestPorts {
  /** 0 es el juego de siempre */
  offset: number;
  preview: number;
  cloudPreview: number;
  proxy: number;
}

type Env = Readonly<Record<string, string | undefined>>;

export function readPortOffset(env: Env): number {
  const text = (env[PORT_OFFSET_VARIABLE] ?? '').trim();
  if (text === '') return 0;
  const offset = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  if (!Number.isInteger(offset) || offset % PORT_OFFSET_STEP !== 0 || offset > MAX_PORT_OFFSET) {
    throw new Error(
      `${PORT_OFFSET_VARIABLE} debe ser un múltiplo de ${PORT_OFFSET_STEP} entre 0 y ${MAX_PORT_OFFSET}, por ejemplo 10. Llegó "${text}"`,
    );
  }
  return offset;
}

export function testPorts(env: Env): TestPorts {
  const offset = readPortOffset(env);
  return {
    offset,
    preview: BASE_PREVIEW_PORT + offset,
    cloudPreview: BASE_CLOUD_PREVIEW_PORT + offset,
    proxy: PROXY_PORT + offset,
  };
}

/** Dirección de un servidor de prueba. Siempre en 127.0.0.1, igual que el proxy */
export function loopbackUrl(port: number): string {
  return `http://${PROXY_HOST}:${port}`;
}

/**
 * Playwright puede reusar un servidor que ya responde en el puerto solo con el juego de siempre y
 * fuera del CI, como antes. Con otro juego nunca, porque podría ser el build de otra copia del
 * repositorio y la prueba pasaría contra código que no es el suyo
 */
export function mayReuseServer(ports: TestPorts, env: Env): boolean {
  return ports.offset === 0 && !env.CI;
}

/**
 * Con otro juego de puertos se da por hecho que otra copia corre Playwright en la misma máquina y que
 * su build compite por el procesador, así que cada servidor tiene el triple de tiempo para arrancar.
 * Con el juego de siempre el tiempo no cambia
 */
export const PARALLEL_TIMEOUT_FACTOR = 3;

export function serverStartTimeout(baseMs: number, ports: TestPorts): number {
  return ports.offset === 0 ? baseMs : baseMs * PARALLEL_TIMEOUT_FACTOR;
}

/**
 * Orígenes que acepta el proxy. Los fijos de config.ts más la vista previa corrida, con 127.0.0.1 y
 * con localhost. Siempre del propio equipo. Con el juego de siempre es exactamente ALLOWED_ORIGINS
 */
export function proxyAllowedOrigins(ports: TestPorts): ReadonlySet<string> {
  return new Set([
    ...ALLOWED_ORIGINS,
    `http://127.0.0.1:${ports.preview}`,
    `http://localhost:${ports.preview}`,
  ]);
}
