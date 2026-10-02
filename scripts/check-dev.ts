// Comprueba que npm run dev levanta la app y el proxy juntos (Fase A, bloque 7).
// Arranca npm run dev, espera a que respondan la app, el proxy y la ruta /api de la app hacia
// el proxy, y luego apaga todo. Uso: node scripts/check-dev.ts
import { spawn, spawnSync } from 'node:child_process';

const APP_URL = 'http://127.0.0.1:5173/';
const PROXY_URL = 'http://127.0.0.1:8787/health';
const APP_TO_PROXY_URL = 'http://127.0.0.1:5173/api/health';
const TIMEOUT_MS = 60_000;

const child = spawn('npm run dev', { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));

function stop(): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    // En Windows hay que cerrar el árbol completo de procesos que abrió npm
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitFor(url: string, check: (response: Response) => Promise<boolean>) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (await check(response)) return;
    } catch {
      // Todavía no arranca
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No respondió a tiempo ${url}`);
}

const isProxyHealth = async (response: Response) => {
  if (!response.ok) return false;
  const body = (await response.json()) as { status?: string };
  return body.status === 'ok';
};

try {
  await waitFor(
    APP_URL,
    async (response) => response.ok && (await response.text()).includes('id="root"'),
  );
  console.log(`ok  la app responde en ${APP_URL}`);
  await waitFor(PROXY_URL, isProxyHealth);
  console.log(`ok  el proxy responde en ${PROXY_URL}`);
  await waitFor(APP_TO_PROXY_URL, isProxyHealth);
  console.log(`ok  la app llega al proxy por ${APP_TO_PROXY_URL}`);
  stop();
  process.exit(0);
} catch (error) {
  stop();
  console.error(error instanceof Error ? error.message : error);
  console.error('Salida de npm run dev:\n' + output);
  process.exit(1);
}
