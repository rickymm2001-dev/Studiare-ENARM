// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_SYNC_UI, type SyncUiState } from '@/app/syncScheduler';
import { useSyncStatus } from '@/app/syncState';
import { t } from '@/i18n/es-MX';
import { SyncStatus } from './SyncStatus';
import { syncMessage, when } from './syncMessage';

const AT = '2026-10-08T10:00:00.000Z';

function show(
  state: SyncUiState,
  syncNow: (() => Promise<void>) | null = vi.fn(() => Promise.resolve()),
) {
  useSyncStatus.setState({ state, syncNow });
  return render(<SyncStatus />);
}

afterEach(() => {
  cleanup();
  useSyncStatus.getState().reset();
});

describe('estado de la sincronización', () => {
  it('antes de la primera dice que todavía no se ha sincronizado', () => {
    show(INITIAL_SYNC_UI);
    expect(screen.getByRole('status')).toHaveTextContent(t.cloud.sync.never);
  });

  it('al terminar bien dice cuándo y cuántos cambios', () => {
    show({
      running: false,
      lastSyncAt: AT,
      outcome: { status: 'ok', at: AT, pulled: 3, pushed: 5, rejected: 0 },
    });
    expect(screen.getByRole('status')).toHaveTextContent(t.cloud.sync.ok(when(AT)));
    expect(screen.getByText(t.cloud.sync.okChanges(3, 5))).toBeVisible();
  });

  it('avisa de los registros que no se pudieron validar', () => {
    show({
      running: false,
      lastSyncAt: AT,
      outcome: { status: 'ok', at: AT, pulled: 0, pushed: 0, rejected: 2 },
    });
    expect(screen.getByText(t.cloud.sync.rejected(2))).toBeVisible();
  });

  it('mientras corre lo dice y no deja pulsar el botón', () => {
    show({ ...INITIAL_SYNC_UI, running: true });
    expect(screen.getByRole('status')).toHaveTextContent(t.cloud.sync.running);
    expect(screen.getByRole('button', { name: t.cloud.sync.syncNow })).toBeDisabled();
  });

  it('sin la nube lista el botón está apagado', () => {
    show(INITIAL_SYNC_UI, null);
    expect(screen.getByRole('button', { name: t.cloud.sync.syncNow })).toBeDisabled();
  });

  it('Sincronizar ahora pide una sincronización', async () => {
    const syncNow = vi.fn(() => Promise.resolve());
    show(INITIAL_SYNC_UI, syncNow);
    await userEvent.click(screen.getByRole('button', { name: t.cloud.sync.syncNow }));
    expect(syncNow).toHaveBeenCalledTimes(1);
  });
});

describe('texto de cada resultado', () => {
  it.each([
    ['network', t.cloud.sync.network],
    ['auth', t.cloud.sync.auth],
    ['device', t.cloud.sync.device],
    ['server', t.cloud.sync.server],
    ['local', t.cloud.sync.local],
    ['clock', t.cloud.sync.clock],
  ] as const)('un fallo %s tiene su mensaje', (failure, message) => {
    expect(syncMessage({ status: 'failed', failure }, null)).toBe(message);
  });

  it('un fallo recuerda cuándo fue la última buena', () => {
    expect(syncMessage({ status: 'failed', failure: 'network' }, AT)).toBe(
      `${t.cloud.sync.network} ${t.cloud.sync.lastWas(when(AT))}`,
    );
  });

  it('el reloj desfasado dice cuántos minutos', () => {
    expect(syncMessage({ status: 'clock_skew', skewMs: 90 * 60_000 }, null)).toBe(
      t.cloud.sync.clockSkew(90),
    );
    expect(syncMessage({ status: 'clock_skew', skewMs: -10_000 }, null)).toBe(
      t.cloud.sync.clockSkew(1),
    );
  });
});
