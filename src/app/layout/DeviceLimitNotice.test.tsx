// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { useCloud, type CloudState } from '../cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from '../preferences';
import { SCREENS } from '../screens';
import { renderApp, resetApp, type RenderedApp } from '../testing/renderApp';
import { DeviceLimitNotice } from './DeviceLimitNotice';

// Hora local fija, sin depender de la zona horaria de quien corre la prueba
const NOW = new Date(2030, 0, 1, 20, 0, 0).getTime();
const TOMORROW_MORNING = new Date(2030, 0, 2, 9, 30, 0).getTime();

const LIMIT: CloudState = {
  status: 'signed-out',
  reason: 'device_limit',
  retryAt: TOMORROW_MORNING,
};

function setCloudState(state: CloudState) {
  act(() => {
    useCloud.setState({ state });
  });
}

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setCloudState({ status: 'off' });
  usePreferences.setState(DEFAULT_PREFERENCES);
  await resetApp(app?.api);
  app = undefined;
});

describe('aviso del límite de cambios de dispositivo', () => {
  it('explica qué pasó, cuándo puede volver a cambiar y que el otro dispositivo sigue', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    setCloudState(LIMIT);
    render(<DeviceLimitNotice />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t.cloud.deviceLimit.title);
    expect(alert).toHaveTextContent('Cambiaste de dispositivo demasiadas veces');
    expect(alert).toHaveTextContent('un solo dispositivo activo');
    expect(alert).toHaveTextContent('a partir de mañana a las 09:30 h');
    expect(alert).toHaveTextContent('Tu otro dispositivo sigue con la cuenta');
    expect(screen.getByRole('button', { name: t.cloud.deviceLimit.dismiss })).toBeVisible();
  });

  it('sin hora conocida dice que podrá hacerlo más tarde', () => {
    setCloudState({ status: 'signed-out', reason: 'device_limit', retryAt: null });
    render(<DeviceLimitNotice />);
    expect(screen.getByRole('alert')).toHaveTextContent('desde este dispositivo más tarde');
  });

  it('con un correo de ayuda configurado ofrece un enlace para escribir', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', 'ayuda@ejemplo.com');
    setCloudState(LIMIT);
    render(<DeviceLimitNotice />);
    const link = screen.getByRole('link', { name: t.cloud.deviceLimit.helpLink });
    expect(link).toHaveAttribute(
      'href',
      `mailto:ayuda@ejemplo.com?subject=${encodeURIComponent(t.cloud.deviceLimit.helpMailSubject)}`,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('¿Crees que es un error');
  });

  it('sin correo de ayuda no inventa una dirección ni un enlace', () => {
    vi.stubEnv('VITE_SUPPORT_EMAIL', '');
    setCloudState(LIMIT);
    render(<DeviceLimitNotice />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(t.cloud.deviceLimit.helpWithoutContact);
  });

  it('el ícono es decorativo y el aviso se anuncia por sí solo', () => {
    setCloudState(LIMIT);
    const { container } = render(<DeviceLimitNotice />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('no aparece en ningún otro estado de la nube, ni con el aviso de otro dispositivo', () => {
    const others: CloudState[] = [
      { status: 'off' },
      { status: 'checking' },
      { status: 'signed-out' },
      { status: 'signed-out', reason: 'other_device' },
      { status: 'error' },
    ];
    for (const state of others) {
      setCloudState(state);
      const { unmount } = render(<DeviceLimitNotice />);
      expect(screen.queryByRole('alert')).toBeNull();
      unmount();
    }
  });

  it('se descarta con el botón, quita el motivo y pasa el foco al contenido', async () => {
    setCloudState(LIMIT);
    render(
      <>
        <DeviceLimitNotice />
        <main id="contenido" tabIndex={-1} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: t.cloud.deviceLimit.dismiss }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useCloud.getState().state).toEqual({ status: 'signed-out' });
    expect(document.getElementById('contenido')).toHaveFocus();
  });

  it('se puede descartar con el teclado', async () => {
    setCloudState(LIMIT);
    render(<DeviceLimitNotice />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: t.cloud.deviceLimit.dismiss })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('aviso del límite en el marco de la app', () => {
  it('aparece en una pantalla cuando cambia el estado de la nube', async () => {
    app = await renderApp(SCREENS.profile.path);
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    setCloudState(LIMIT);
    expect(await screen.findByRole('alert')).toHaveTextContent(t.cloud.deviceLimit.title);
  });
});
