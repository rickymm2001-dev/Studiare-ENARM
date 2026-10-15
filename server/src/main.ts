// Punto de entrada del proxy de IA. npm run dev lo levanta junto con la app.
// Uso: node server/src/main.ts [--mock] [--ephemeral]
// --mock fuerza el modo simulado aunque haya clave. --ephemeral no lee ni escribe la configuración
// ni el libro del día, para que las pruebas no dependan del estado de otra corrida.
// Con --mock, PW_PORT_OFFSET corre el puerto y suma la vista previa corrida a los orígenes aceptados
// (server/src/testPorts.ts). El proxy que puede tener clave siempre escucha en 127.0.0.1:8787 (D-040)
import { ENV_FILE, PROXY_PORT } from './config.ts';
import { createAiDeps } from './ai/index.ts';
import { loadAiCredentials } from './env.ts';
import { startProxy } from './server.ts';
import { PORT_OFFSET_VARIABLE, proxyAllowedOrigins, testPorts } from './testPorts.ts';

const forceMock = process.argv.includes('--mock');
const ephemeral = process.argv.includes('--ephemeral');
const ports = testPorts(process.env);
if (ports.offset !== 0 && !forceMock) {
  console.error(
    `${PORT_OFFSET_VARIABLE} solo corre el proxy simulado de las pruebas (--mock). El proxy con clave siempre escucha en el puerto ${PROXY_PORT}. Quita ${PORT_OFFSET_VARIABLE} para npm run dev o npm run proxy`,
  );
  process.exit(1);
}
const credentials = loadAiCredentials({ envFile: ENV_FILE, forceMock });

const proxy = await startProxy({
  port: ports.proxy,
  mode: credentials.mode,
  allowedOrigins: proxyAllowedOrigins(ports),
  ai: createAiDeps({
    credentials,
    ...(ephemeral ? { files: { config: null, ledger: null } } : {}),
  }),
});
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
