// Un proxy de IA de mentira para las pruebas de pantalla (B12, 3.5). Contesta /api/health con la versión 2
// del contrato y el estado de cada motor, y deja que cada prueba conteste las rutas de motor que le
// importen. Lo demás contesta 404. Anota cada llamada, para comprobar también lo que NO salió. Se instala
// con vi.stubGlobal('fetch', proxy.fetch).
import type { AiEngine } from '@/engines/aiContracts';

export type EngineGate = 'open' | 'gated';

export interface ProxyCall {
  url: string;
  body: Record<string, unknown> | undefined;
}

export interface FakeProxy {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  /** Todas las llamadas, la de /api/health incluida */
  calls: ProxyCall[];
  /** Solo las que van a un motor de IA, es decir, a /api/ai/ */
  engineCalls: () => ProxyCall[];
}

export interface FakeProxyOptions {
  /**
   * El estado de cada motor en /api/health. Lo que no se nombra queda cerrado. Sin esta opción el health
   * no trae motores, como el del proxy de desarrollo
   */
  engines?: Partial<Record<AiEngine, EngineGate>>;
  /** Contestan las rutas de motor, por el final de su dirección, por ejemplo /api/ai/flashcards */
  routes?: Readonly<Record<string, () => Response>>;
  /** Sin red. Toda llamada falla, como con el proxy caído, y se anota igual */
  unreachable?: boolean;
}

const ALL_GATED: Record<AiEngine, EngineGate> = {
  forgetting: 'gated',
  weekly_report: 'gated',
  flashcards: 'gated',
  bias_tips: 'gated',
  restructure: 'gated',
};

function bodyOf(init?: RequestInit): Record<string, unknown> | undefined {
  if (typeof init?.body !== 'string') return undefined;
  const parsed: unknown = JSON.parse(init.body);
  return typeof parsed === 'object' && parsed !== null
    ? (parsed as Record<string, unknown>)
    : undefined;
}

export function fakeProxy(options: FakeProxyOptions = {}): FakeProxy {
  const calls: ProxyCall[] = [];
  const answer = (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, body: bodyOf(init) });
    if (options.unreachable) return Promise.reject(new TypeError('sin red'));
    if (url.endsWith('/api/health')) {
      return Promise.resolve(
        Response.json({
          status: 'ok',
          mode: 'mock',
          version: 2,
          ...(options.engines ? { engines: { ...ALL_GATED, ...options.engines } } : {}),
        }),
      );
    }
    const route = Object.entries(options.routes ?? {}).find(([suffix]) => url.endsWith(suffix));
    if (route) return Promise.resolve(route[1]());
    return Promise.resolve(Response.json({ error: 'nope' }, { status: 404 }));
  };
  return {
    fetch: answer,
    calls,
    engineCalls: () => calls.filter((call) => call.url.includes('/api/ai/')),
  };
}
