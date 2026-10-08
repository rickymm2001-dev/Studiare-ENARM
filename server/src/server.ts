import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { createApp } from './app.ts';
import type { AiRoutesDeps } from './ai/route.ts';
import { PROXY_HOST } from './config.ts';
import type { AiMode } from './env.ts';

export interface RunningProxy {
  server: ServerType;
  address: AddressInfo;
  close(): Promise<void>;
}

/** Arranca el proxy. La dirección de escucha es siempre PROXY_HOST, no se puede cambiar desde fuera */
export function startProxy(options: {
  port: number;
  mode: AiMode;
  ai?: AiRoutesDeps;
}): Promise<RunningProxy> {
  const app = createApp({ mode: options.mode, ...(options.ai ? { ai: options.ai } : {}) });
  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: options.port, hostname: PROXY_HOST }, (info) => {
      resolve({
        server,
        address: info,
        close: () =>
          new Promise<void>((done, fail) => {
            server.close((error) => {
              if (error) fail(error);
              else done();
            });
          }),
      });
    });
    server.once('error', reject);
  });
}
