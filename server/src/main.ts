// Punto de entrada del proxy de IA. npm run dev lo levanta junto con la app.
// Uso: node server/src/main.ts [--mock]
import { ENV_FILE, PROXY_PORT } from './config.ts';
import { loadAiCredentials } from './env.ts';
import { startProxy } from './server.ts';

const forceMock = process.argv.includes('--mock');
const credentials = loadAiCredentials({ envFile: ENV_FILE, forceMock });

const proxy = await startProxy({ port: PROXY_PORT, mode: credentials.mode });
const modeText =
  credentials.mode === 'real'
    ? 'modo real (clave encontrada en server/.env.local)'
    : 'modo simulado (sin clave, respuestas fijas)';
console.log(
  `Proxy de IA escuchando en http://${proxy.address.address}:${proxy.address.port} en ${modeText}`,
);

function shutdown() {
  void proxy.close().finally(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
