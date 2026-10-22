// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncVersionText } from '@/i18n/syncVersion';
import { applyLatestVersion } from '../applyLatestVersion';
import { INITIAL_SYNC_UI } from '../syncScheduler';
import { useSyncStatus } from '../syncState';
import { NOTICE_STACK_ID } from './noticeStack';
import { RETRY_AFTER_MS, SyncVersionNotice } from './SyncVersionNotice';

vi.mock('../applyLatestVersion', () => ({ applyLatestVersion: vi.fn(() => Promise.resolve()) }));

const TRIED_KEY = 'studiare.sync-version.update-tried';

const block = (blocked = true) => {
  useSyncStatus.setState({ state: { ...INITIAL_SYNC_UI, blockedByNewerVersion: blocked } });
};

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  document.getElementById(NOTICE_STACK_ID)?.remove();
  useSyncStatus.getState().reset();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('aviso de versión nueva de la sincronización', () => {
  it('trae siempre su región viva y no dice nada mientras la sincronización no esté en pausa', () => {
    block(false);
    const { container } = render(<SyncVersionNotice />);
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
    expect(screen.queryByText(syncVersionText.title)).toBeNull();
  });

  it('con una pausa el texto aparece dentro de la región viva', () => {
    block();
    const { container } = render(<SyncVersionNotice />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent(syncVersionText.title);
    expect(screen.getByText(syncVersionText.body)).toBeVisible();
  });

  it('se apila dentro del contenedor de avisos de arriba cuando existe, junto al de la PWA', () => {
    const stack = document.createElement('div');
    stack.id = NOTICE_STACK_ID;
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
    block();
    render(<SyncVersionNotice />);
    expect(stack).toHaveTextContent(syncVersionText.title);
  });

  it('Actualizar ahora pide la versión nueva, anota el intento y se desactiva mientras tanto', async () => {
    const typing = userEvent.setup();
    block();
    render(<SyncVersionNotice />);
    await typing.click(screen.getByRole('button', { name: syncVersionText.update }));
    expect(applyLatestVersion).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(TRIED_KEY)).toBe('1');
    expect(screen.getByRole('button', { name: syncVersionText.updating })).toBeDisabled();
  });

  it('si la recarga no ocurre, el botón se reactiva a los pocos segundos para reintentar', async () => {
    vi.useFakeTimers();
    block();
    render(<SyncVersionNotice />);
    act(() => {
      screen.getByRole('button', { name: syncVersionText.update }).click();
    });
    expect(screen.getByRole('button', { name: syncVersionText.updating })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETRY_AFTER_MS);
    });
    const retry = screen.getByRole('button', { name: syncVersionText.retry });
    expect(retry).toBeEnabled();
    act(() => {
      retry.click();
    });
    expect(applyLatestVersion).toHaveBeenCalledTimes(2);
  });

  it('al volver a mostrarse la página el botón también se reactiva', () => {
    block();
    render(<SyncVersionNotice />);
    act(() => {
      screen.getByRole('button', { name: syncVersionText.update }).click();
    });
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    expect(screen.getByRole('button', { name: syncVersionText.retry })).toBeEnabled();
  });

  it('si tras actualizar la pausa sigue, dice que la versión no está disponible y no ofrece actualizar', () => {
    sessionStorage.setItem(TRIED_KEY, '1');
    block();
    render(<SyncVersionNotice />);
    expect(screen.getByText(syncVersionText.stuckTitle)).toBeVisible();
    expect(screen.getByText(syncVersionText.stuckBody)).toBeVisible();
    expect(screen.queryByRole('button', { name: syncVersionText.update })).toBeNull();
  });

  it('cuando la pausa termina olvida el intento', () => {
    sessionStorage.setItem(TRIED_KEY, '1');
    block();
    render(<SyncVersionNotice />);
    act(() => {
      block(false);
    });
    expect(sessionStorage.getItem(TRIED_KEY)).toBeNull();
    // Una pausa nueva empieza otra vez ofreciendo actualizar
    act(() => {
      block();
    });
    expect(screen.getByRole('button', { name: syncVersionText.update })).toBeVisible();
  });

  it('con el almacenamiento bloqueado funciona igual y ofrece actualizar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    block();
    render(<SyncVersionNotice />);
    expect(screen.getByRole('button', { name: syncVersionText.update })).toBeVisible();
    act(() => {
      screen.getByRole('button', { name: syncVersionText.update }).click();
    });
    expect(applyLatestVersion).toHaveBeenCalledTimes(1);
  });

  it('se puede cerrar con el teclado', async () => {
    const typing = userEvent.setup();
    block();
    render(<SyncVersionNotice />);
    screen.getByRole('button', { name: syncVersionText.dismiss }).focus();
    await typing.keyboard('{Enter}');
    expect(screen.queryByText(syncVersionText.title)).toBeNull();
  });
});
