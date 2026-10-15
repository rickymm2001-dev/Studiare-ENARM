import { describe, expect, it } from 'vitest';
import { ALLOWED_ORIGINS, PROXY_PORT } from './config.ts';
import {
  loopbackUrl,
  MAX_PORT_OFFSET,
  mayReuseServer,
  proxyAllowedOrigins,
  readPortOffset,
  serverStartTimeout,
  testPorts,
} from './testPorts.ts';

describe('puertos de los servidores de Playwright', () => {
  it('sin PW_PORT_OFFSET son los de siempre', () => {
    for (const env of [
      {},
      { PW_PORT_OFFSET: '' },
      { PW_PORT_OFFSET: '  ' },
      { PW_PORT_OFFSET: '0' },
    ]) {
      expect(testPorts(env)).toEqual({ offset: 0, preview: 4173, cloudPreview: 4174, proxy: 8787 });
    }
    expect(PROXY_PORT).toBe(8787);
  });

  it('PW_PORT_OFFSET corre los tres puertos juntos', () => {
    expect(testPorts({ PW_PORT_OFFSET: '10' })).toEqual({
      offset: 10,
      preview: 4183,
      cloudPreview: 4184,
      proxy: 8797,
    });
    expect(testPorts({ PW_PORT_OFFSET: ' 990 ' }).preview).toBe(5163);
  });

  it('rechaza un desplazamiento que no es múltiplo de 10 entre 0 y el tope', () => {
    for (const text of ['1', '15', '-10', '+10', '10.0', '1e2', 'diez', '0x10', '1000', '99990']) {
      expect(() => readPortOffset({ PW_PORT_OFFSET: text }), text).toThrow(/PW_PORT_OFFSET/);
    }
    expect(readPortOffset({ PW_PORT_OFFSET: String(MAX_PORT_OFFSET) })).toBe(MAX_PORT_OFFSET);
  });

  it('los juegos de dos copias distintas nunca comparten un puerto ni tocan el de npm run dev', () => {
    const seen = new Map<number, number>();
    for (let offset = 0; offset <= MAX_PORT_OFFSET; offset += 10) {
      const ports = testPorts({ PW_PORT_OFFSET: String(offset) });
      for (const port of [ports.preview, ports.cloudPreview, ports.proxy]) {
        expect(seen.get(port), `puerto ${port}`).toBeUndefined();
        expect(port).not.toBe(5173);
        expect(port).toBeLessThan(65536);
        seen.set(port, offset);
      }
    }
  });

  it('las direcciones son siempre de 127.0.0.1', () => {
    expect(loopbackUrl(4183)).toBe('http://127.0.0.1:4183');
  });

  it('solo reusa un servidor abierto con los puertos de siempre y fuera del CI', () => {
    const defaults = testPorts({});
    const moved = testPorts({ PW_PORT_OFFSET: '20' });
    expect(mayReuseServer(defaults, {})).toBe(true);
    expect(mayReuseServer(defaults, { CI: '1' })).toBe(false);
    expect(mayReuseServer(moved, {})).toBe(false);
    expect(mayReuseServer(moved, { CI: '1' })).toBe(false);
  });

  it('con otro juego los servidores tienen más tiempo para arrancar y con el de siempre no cambia', () => {
    expect(serverStartTimeout(180_000, testPorts({}))).toBe(180_000);
    expect(serverStartTimeout(180_000, testPorts({ PW_PORT_OFFSET: '10' }))).toBe(540_000);
  });

  it('el proxy acepta la vista previa corrida, siempre del propio equipo', () => {
    expect(proxyAllowedOrigins(testPorts({}))).toEqual(ALLOWED_ORIGINS);

    const origins = proxyAllowedOrigins(testPorts({ PW_PORT_OFFSET: '10' }));
    expect(origins).toEqual(
      new Set([...ALLOWED_ORIGINS, 'http://127.0.0.1:4183', 'http://localhost:4183']),
    );
    for (const origin of origins) {
      expect(new URL(origin).hostname, origin).toMatch(/^(127\.0\.0\.1|localhost)$/);
    }
  });
});
