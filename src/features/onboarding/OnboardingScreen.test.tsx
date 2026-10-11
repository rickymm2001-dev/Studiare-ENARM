// @vitest-environment jsdom
// Entrar con el código del correo (D-115). El correo se abre en el teléfono y se entra en la
// computadora escribiendo el código, sin abrir el enlace en ella.
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudBridge } from '@/app/cloud';
import { useCloud } from '@/app/cloudState';
import { DEFAULT_PREFERENCES, usePreferences } from '@/app/preferences';
import { routes } from '@/app/router';
import { SCREENS } from '@/app/screens';
import { forgetDeviceClaim } from '@/data/cloud/device';
import { useDataApi, type DataApi } from '@/data/context';
import { DataProvider } from '@/data/DataProvider';
import { makeFakeCloud, type FakeCloud } from '@/data/testing/fakeCloud';
import { t } from '@/i18n/es-MX';

vi.setConfig({ testTimeout: 30_000 });

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const EMAIL = 'ana@x.mx';
const captured: { api?: DataApi } = {};

function Capture() {
  const value = useDataApi();
  useEffect(() => {
    captured.api = value;
  });
  return null;
}

function mount(fake: FakeCloud) {
  holder.cloud = fake.cloud;
  const router = createMemoryRouter(routes, { initialEntries: [SCREENS.onboarding.path] });
  render(
    <DataProvider kind="real">
      <Capture />
      <CloudBridge />
      <RouterProvider router={router} />
    </DataProvider>,
  );
  return router;
}

/** Sin sesión en este navegador. El correo con el código se abrió en otro dispositivo */
function phoneOnlyCloud() {
  const fake = makeFakeCloud({ session: null });
  fake.codeSession = { id: '7a2d0f1e-6b4a-4d2a-9d55-6f2f3f6a1b20', email: EMAIL };
  return fake;
}

beforeEach(() => {
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'checking' } });
});

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 100));
  await captured.api?.deleteAllData?.();
  captured.api = undefined;
  holder.cloud = null;
  localStorage.clear();
  forgetDeviceClaim();
  usePreferences.setState(DEFAULT_PREFERENCES);
  useCloud.setState({ state: { status: 'off' } });
});

describe('entrar con el código del correo', () => {
  it('en Ya tengo cuenta, el código abre la sesión, une la cuenta y entra a Inicio', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    expect(await screen.findByText(t.cloud.sentBody(EMAIL))).toBeVisible();
    expect(fake.otpRequests).toEqual([{ email: EMAIL }]);

    await typing.type(screen.getByLabelText(t.cloud.code.label), '123 456');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(SCREENS.home.path);
    });
    expect(useCloud.getState().state.status).toBe('linked');
    expect(usePreferences.getState().sessionUserId).not.toBeNull();
    // Este navegador reclamó la cuenta, como si hubiera abierto el enlace
    expect(fake.claims).toHaveLength(1);
  });

  it('un código equivocado lo dice y no entra', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    await typing.type(await screen.findByLabelText(t.cloud.code.label), '999999');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    expect(await screen.findByText(t.cloud.code.errors.invalid)).toBeVisible();
    expect(router.state.location.pathname).toBe(SCREENS.onboarding.path);
    expect(usePreferences.getState().sessionUserId).toBeNull();
    expect(fake.claims).toHaveLength(0);
  });

  it('pide un código de 6 a 10 dígitos antes de mandarlo', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    mount(fake);
    await typing.click(await screen.findByRole('tab', { name: t.onboarding.loginTab }));
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByRole('button', { name: t.cloud.sendLink }));
    await typing.type(await screen.findByLabelText(t.cloud.code.label), '123');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    expect(await screen.findByText(t.cloud.code.format)).toBeVisible();
  });

  it('al crear la cuenta, el código del correo entra con el mismo perfil', async () => {
    const fake = phoneOnlyCloud();
    const typing = userEvent.setup();
    const router = mount(fake);
    await typing.type(await screen.findByLabelText(t.onboarding.alias), 'Ana');
    await typing.type(screen.getByLabelText(t.account.email), EMAIL);
    await typing.click(screen.getByLabelText(t.onboarding.privacyAccept));
    await typing.click(screen.getByRole('button', { name: t.onboarding.create }));
    expect(await screen.findByText(t.cloud.sentBody(EMAIL))).toBeVisible();
    const local = await captured.api?.repos.accounts.list();
    expect(local).toHaveLength(1);

    await typing.type(screen.getByLabelText(t.cloud.code.label), '123456');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    await waitFor(() => {
      expect(useCloud.getState().state.status).toBe('linked');
    });
    expect(router.state.location.pathname).toBe(SCREENS.home.path);
    // No se creó un segundo perfil. La nube se unió al que se acaba de crear
    expect(usePreferences.getState().sessionUserId).toBe(local?.[0]?.userId);
    expect(await captured.api?.repos.accounts.list()).toHaveLength(1);
  });
});
