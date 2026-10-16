// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CardGenerationError } from '@/ai/flashcards';
import { usePreferences } from '@/app/preferences';
import { GenerationLimitError } from '@/data/usecases/aiCards';
import { makeUser, testApi } from '@/data/testing/fixtures';
import type { CallMeta } from '@/ai/engines';
import { t } from '@/i18n/es-MX';
import { cardsFailureText, logFailedGeneration, useCardsAi } from './useCardsAi';

afterEach(() => {
  vi.unstubAllGlobals();
  usePreferences.setState({ role: 'student' });
});

function health(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(Response.json(body))),
  );
}

describe('estado de las tarjetas con IA para quien las usa', () => {
  it('un alumno con el motor cerrado no ve el botón y sí el aviso', async () => {
    health({
      status: 'ok',
      mode: 'real',
      version: 2,
      engines: { flashcards: 'gated' },
    });
    const { result } = renderHook(() => useCardsAi({ isDemo: false }));
    await waitFor(() => {
      expect(result.current.access).toBe('gated');
    });
    expect(result.current).toMatchObject({ offered: false, canGenerate: false });
  });

  it('con el motor abierto se ofrece y se puede pulsar', async () => {
    health({ status: 'ok', mode: 'real', version: 2, engines: { flashcards: 'open' } });
    const { result } = renderHook(() => useCardsAi({ isDemo: false }));
    await waitFor(() => {
      expect(result.current.canGenerate).toBe(true);
    });
    expect(result.current).toMatchObject({ access: 'open', offered: true });
  });

  it('un médico o un admin lo usa aunque la compuerta siga cerrada, para auditar', async () => {
    usePreferences.setState({ role: 'physician' });
    health({ status: 'ok', mode: 'real', version: 2, engines: { flashcards: 'gated' } });
    const { result } = renderHook(() => useCardsAi({ isDemo: false }));
    await waitFor(() => {
      expect(result.current.canGenerate).toBe(true);
    });
  });

  it('mientras revisa se ofrece sin poderse pulsar', async () => {
    health({ status: 'ok', mode: 'real', version: 2, engines: { flashcards: 'open' } });
    const { result } = renderHook(() => useCardsAi({ isDemo: false }));
    expect(result.current).toMatchObject({ access: 'checking', offered: true, canGenerate: false });
    await waitFor(() => {
      expect(result.current.access).toBe('open');
    });
  });

  it('sin proxy, como en desarrollo y en la demo, usa las respuestas fijas y se ofrece', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('sin red'))),
    );
    const { result } = renderHook(() => useCardsAi({ isDemo: false }));
    await waitFor(() => {
      expect(result.current.status.kind).toBe('no-proxy');
    });
    expect(result.current).toMatchObject({ access: 'open', canGenerate: true });
  });
});

describe('avisos de una generación que falló', () => {
  it('un tope local, o uno del servidor, llega con su texto', () => {
    expect(cardsFailureText(new GenerationLimitError(), 'otro')).toBe(t.aiCards.limitReached);
    expect(
      cardsFailureText(new CardGenerationError('generation_limit', 'Vuelve mañana.'), 'otro'),
    ).toBe('Vuelve mañana.');
    expect(cardsFailureText(new Error('x'), 'No se pudieron generar.')).toBe(
      'No se pudieron generar.',
    );
  });

  it('lo que costaron las llamadas que fallaron queda en la bitácora', async () => {
    const api = testApi('real');
    try {
      const user = makeUser();
      const meta: CallMeta = {
        engine: 'flashcards',
        mode: 'real',
        model: 'claude-sonnet-5-5',
        promptVersion: 'flashcards.provisional.v1',
        inputTokens: 800,
        outputTokens: 0,
        cacheWriteTokens: 0,
        cacheReadTokens: 0,
        estimatedCostUsd: 0.002,
        latencyMs: 400,
        outcome: 'fallback',
        validator: { passed: false, issues: [] },
      };
      await logFailedGeneration(
        api,
        user,
        new CardGenerationError('invalid_output', 'No.', [meta, meta]),
      );
      expect(await api.repos.aiCallLog.list()).toHaveLength(2);
      // Un error que no es de tarjetas no deja nada
      await logFailedGeneration(api, user, new Error('x'));
      expect(await api.repos.aiCallLog.list()).toHaveLength(2);
    } finally {
      await api.dispose();
    }
  });
});
