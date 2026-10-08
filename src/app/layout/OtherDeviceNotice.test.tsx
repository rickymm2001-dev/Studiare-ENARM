// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it } from 'vitest';
import { DataProvider } from '@/data/DataProvider';
import { t } from '@/i18n/es-MX';
import { useCloud, type CloudState } from '../cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from '../preferences';
import { routes } from '../router';
import { SCREENS } from '../screens';
import { renderApp, resetApp, type RenderedApp } from '../testing/renderApp';
import { OtherDeviceNotice } from './OtherDeviceNotice';

const OTHER_DEVICE: CloudState = { status: 'signed-out', reason: 'other_device' };

function setCloudState(state: CloudState) {
  act(() => {
    useCloud.setState({ state });
  });
}

let app: RenderedApp | undefined;
afterEach(async () => {
  cleanup();
  setCloudState({ status: 'off' });
  usePreferences.setState(DEFAULT_PREFERENCES);
  await resetApp(app?.api);
  app = undefined;
});

describe('aviso de otro dispositivo', () => {
  it('con el motivo other_device explica qué pasó y que se puede volver a entrar', () => {
    setCloudState(OTHER_DEVICE);
    render(<OtherDeviceNotice />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(t.cloud.otherDevice.title);
    expect(alert).toHaveTextContent('abrió en otro dispositivo');
    expect(alert).toHaveTextContent('un solo dispositivo activo');
    expect(alert).toHaveTextContent('vuelve a entrar');
    expect(alert).toHaveTextContent('cerrará la sesión del otro');
    expect(screen.getByRole('button', { name: t.cloud.otherDevice.dismiss })).toBeVisible();
  });

  it('el ícono es decorativo y el aviso se anuncia por sí solo', () => {
    setCloudState(OTHER_DEVICE);
    const { container } = render(<OtherDeviceNotice />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('no aparece en ningún otro estado de la nube', () => {
    const others: CloudState[] = [
      { status: 'off' },
      { status: 'checking' },
      { status: 'signed-out' },
      { status: 'error' },
    ];
    for (const state of others) {
      setCloudState(state);
      const { unmount } = render(<OtherDeviceNotice />);
      expect(screen.queryByRole('alert')).toBeNull();
      unmount();
    }
  });

  it('se descarta con el botón, quita el motivo y pasa el foco al contenido', async () => {
    setCloudState(OTHER_DEVICE);
    render(
      <>
        <OtherDeviceNotice />
        <main id="contenido" tabIndex={-1} />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: t.cloud.otherDevice.dismiss }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useCloud.getState().state).toEqual({ status: 'signed-out' });
    expect(document.getElementById('contenido')).toHaveFocus();
  });

  it('se puede descartar con el teclado', async () => {
    setCloudState(OTHER_DEVICE);
    render(<OtherDeviceNotice />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: t.cloud.otherDevice.dismiss })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('aviso de otro dispositivo en el marco de la app', () => {
  it('aparece en una pantalla con sesión cuando cambia el estado de la nube', async () => {
    app = await renderApp(SCREENS.profile.path);
    expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    setCloudState(OTHER_DEVICE);
    expect(await screen.findByRole('alert')).toHaveTextContent(t.cloud.otherDevice.title);
  });

  it('se ve también sin sesión, que es donde queda el alumno al salir', async () => {
    setCloudState(OTHER_DEVICE);
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });
    render(
      <DataProvider kind="real">
        <RouterProvider router={router} />
      </DataProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(t.cloud.otherDevice.title);
    // La portada carga aparte del aviso, así que se espera igual que el aviso
    expect(
      await screen.findByRole('heading', { level: 1, name: t.landing.title }, { timeout: 10_000 }),
    ).toBeVisible();
  });
});
