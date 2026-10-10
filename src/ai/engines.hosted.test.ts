// El cliente de los motores con el proxy alojado. Pide la sesión de Supabase y la manda en cada
// llamada, y el aviso de falta de sesión o de plan llega tal cual al alumno.
import { describe, expect, it, vi } from 'vitest';
import { callEngine } from './engines';
import { hypothesisInput } from './testing/aiSamples';

vi.mock('./endpoint', () => ({
  AI_BASE_URL: 'https://ia.studiare.mx',
  aiAuthHeaders: () => Promise.resolve({ authorization: 'Bearer token-de-prueba' }),
}));

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('callEngine con el proxy alojado', () => {
  it('llama a la dirección alojada y manda la sesión en el encabezado', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        json({ error: 'plan_required', message: 'La IA es de los planes de pago.' }, 403),
      ),
    );
    const result = await callEngine('forgetting', hypothesisInput(), {
      status: { kind: 'real' },
      studentRef: '01HZX0000000000000000000AA',
      fetchImpl: fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://ia.studiare.mx/ai/forgetting');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer token-de-prueba');
    expect(result).toMatchObject({
      ok: false,
      reason: 'plan_required',
      message: 'La IA es de los planes de pago.',
    });
  });

  it('una sesión vencida llega como unauthorized con el mensaje del servidor', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        json({ error: 'unauthorized', message: 'Tu sesión venció. Entra otra vez.' }, 401),
      ),
    );
    const result = await callEngine('forgetting', hypothesisInput(), {
      status: { kind: 'real' },
      studentRef: '01HZX0000000000000000000AA',
      fetchImpl: fetchImpl,
    });
    expect(result).toMatchObject({ ok: false, reason: 'unauthorized' });
  });
});
