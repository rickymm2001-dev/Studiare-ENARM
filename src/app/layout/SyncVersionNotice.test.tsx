// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLatestVersion } from '../applyLatestVersion';
import { INITIAL_SYNC_UI } from '../syncScheduler';
import { useSyncStatus } from '../syncState';
import { syncVersionText } from '@/i18n/syncVersion';
import { SyncVersionNotice } from './SyncVersionNotice';

vi.mock('../applyLatestVersion', () => ({ applyLatestVersion: vi.fn(() => Promise.resolve()) }));

afterEach(() => {
  cleanup();
  useSyncStatus.getState().reset();
  vi.clearAllMocks();
});

describe('aviso de versión nueva de la sincronización', () => {
  it('no sale mientras la sincronización no esté en pausa', () => {
    useSyncStatus.setState({ state: INITIAL_SYNC_UI });
    render(<SyncVersionNotice />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('sale con su explicación cuando hay eventos de una versión más nueva', () => {
    useSyncStatus.setState({ state: { ...INITIAL_SYNC_UI, blockedByNewerVersion: true } });
    render(<SyncVersionNotice />);
    expect(screen.getByRole('status')).toHaveTextContent(syncVersionText.title);
    expect(screen.getByText(syncVersionText.body)).toBeVisible();
  });

  it('Actualizar ahora pide la versión nueva y se desactiva mientras tanto', async () => {
    const typing = userEvent.setup();
    useSyncStatus.setState({ state: { ...INITIAL_SYNC_UI, blockedByNewerVersion: true } });
    render(<SyncVersionNotice />);
    await typing.click(screen.getByRole('button', { name: syncVersionText.update }));
    expect(applyLatestVersion).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: syncVersionText.updating })).toBeDisabled();
  });

  it('se puede cerrar con el teclado', async () => {
    const typing = userEvent.setup();
    useSyncStatus.setState({ state: { ...INITIAL_SYNC_UI, blockedByNewerVersion: true } });
    render(<SyncVersionNotice />);
    screen.getByRole('button', { name: syncVersionText.dismiss }).focus();
    await typing.keyboard('{Enter}');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
