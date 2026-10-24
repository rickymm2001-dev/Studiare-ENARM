// @vitest-environment jsdom
// El aviso del banco se carga solo cuando hay aviso (B11, 5.4). Si su archivo no llega, como sin red
// antes de que el service worker lo guarde, la pantalla sigue y no cae en Algo salió mal
import 'fake-indexeddb/auto';
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { useBankNotice } from '@/features/shared/bankNotice';
import { t } from '@/i18n/es-MX';

vi.mock('@/features/shared/BankNoticeBanner', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

let app: RenderedApp | undefined;
afterEach(async () => {
  useBankNotice.getState().clear();
  cleanup();
  await resetApp(app?.api);
  app = undefined;
});

describe('aviso del banco en el marco', () => {
  it('si el archivo del aviso no llega, la pantalla sigue', async () => {
    app = await renderApp(SCREENS.home.path);
    expect(await screen.findByRole('searchbox', { name: t.nav.search })).toBeVisible();
    act(() => {
      useBankNotice.getState().show({ reason: 'offline', granted: 3, requested: 5, retryAt: null });
    });
    // Espera a que la carga del aviso falle y React vuelva a pintar
    await import('@/features/shared/BankNoticeBanner').catch(() => undefined);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(screen.queryAllByText(t.routeError.title)).toEqual([]);
    expect(screen.getByRole('searchbox', { name: t.nav.search })).toBeVisible();
  });
});
