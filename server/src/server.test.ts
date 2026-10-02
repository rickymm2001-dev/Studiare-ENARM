import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROXY_HOST } from './config.ts';
import { startProxy } from './server.ts';

describe('el proxy escucha solo en localhost (5.3, 14.3)', () => {
  it('la dirección de escucha es 127.0.0.1', async () => {
    expect(PROXY_HOST).toBe('127.0.0.1');
    const proxy = await startProxy({ port: 0, mode: 'mock' });
    try {
      expect(proxy.address.address).toBe('127.0.0.1');
      expect(proxy.address.family).toBe('IPv4');
      const response = await fetch(`http://127.0.0.1:${proxy.address.port}/health`);
      expect(await response.json()).toMatchObject({ status: 'ok', mode: 'mock' });
    } finally {
      await proxy.close();
    }
  });

  it('ningún archivo del proxy escucha en todas las interfaces', () => {
    for (const file of ['server.ts', 'main.ts', 'config.ts', 'app.ts']) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8');
      // Solo valores entre comillas, para no confundir el código con los comentarios
      expect(source, file).not.toMatch(/['"]0\.0\.0\.0['"]|['"]::['"]/);
    }
  });
});
