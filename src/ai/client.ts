// Cliente del proxy de IA. La app nunca llama a Anthropic directo, solo a /api del proxy (8.1).
// Sin proxy, como en la demo publicada, todo corre en modo simulado con src/ai/fixtures (D-017).
import { z } from 'zod';

const HealthSchema = z.strictObject({
  status: z.literal('ok'),
  mode: z.enum(['real', 'mock']),
  version: z.int(),
});

export type AiStatus =
  | { kind: 'checking' }
  /** El proxy responde y tiene clave */
  | { kind: 'real' }
  /** El proxy responde sin clave, con respuestas fijas */
  | { kind: 'mock' }
  /** No hay proxy. La app usa las respuestas fijas del cliente */
  | { kind: 'no-proxy' }
  /** Sin conexión. Las funciones de IA dicen que necesitan conexión (14.4) */
  | { kind: 'offline' };

export const HEALTH_URL = '/api/health';
const TIMEOUT_MS = 3000;

export async function fetchAiStatus(fetchImpl: typeof fetch = fetch): Promise<AiStatus> {
  try {
    const response = await fetchImpl(HEALTH_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) return { kind: 'no-proxy' };
    const parsed = HealthSchema.safeParse(await response.json());
    if (!parsed.success) return { kind: 'no-proxy' };
    return { kind: parsed.data.mode };
  } catch {
    return { kind: 'no-proxy' };
  }
}
