// @vitest-environment jsdom
// Llegada con el enlace de invitación de un compañero (respuesta 77 del plan del cambio, B7)
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAccess } from '@/app/accessState';
import { useCloud } from '@/app/cloudState';
import { readPendingReferral } from '@/data/referrals/pendingReferral';
import { t } from '@/i18n/es-MX';
import { ReferralInvite } from './ReferralInvite';

const holder = vi.hoisted((): { configured: boolean; cloud: unknown } => ({
  configured: true,
  cloud: null,
}));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.configured,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

function show(path: string) {
  const router = createMemoryRouter([{ path: '/bienvenida', element: <ReferralInvite /> }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  holder.configured = true;
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
  useAccess.setState({ signup: { status: 'none' } });
  localStorage.clear();
});

describe('bienvenida con el enlace de un compañero', () => {
  it('guarda el código del enlace y dice que se aplica al entrar', async () => {
    show('/bienvenida?ref=abcd2345');
    expect(screen.getByRole('status')).toHaveTextContent(t.b7.referral.invited('ABCD2345'));
    await waitFor(() => {
      expect(readPendingReferral()).toBe('ABCD2345');
    });
  });

  it('sin código, o con uno que no tiene forma de código, no dice ni guarda nada', () => {
    show('/bienvenida');
    show('/bienvenida?ref=<b>x</b>');
    expect(screen.queryByRole('status')).toBeNull();
    expect(readPendingReferral()).toBeNull();
  });

  it('sin la nube los referidos no existen, así que no guarda nada', () => {
    holder.configured = false;
    show('/bienvenida?ref=ABCD2345');
    expect(screen.queryByRole('status')).toBeNull();
    expect(readPendingReferral()).toBeNull();
  });

  it('con la cuenta ya conectada lo canjea en el acto', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: 'ok', error: null }));
    holder.cloud = { rpc };
    useCloud.setState({
      state: {
        status: 'linked',
        identity: { authId: 'a', email: 'a@x.mx', role: 'student', alias: null },
      },
    });
    show('/bienvenida?ref=ABCD2345');
    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith('redeem_referral_code', { p_code: 'ABCD2345' });
    });
    await waitFor(() => {
      expect(readPendingReferral()).toBeNull();
    });
  });

  it('con la cuenta conectada pero sin completar su registro lo guarda y espera (B9)', async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: 'ok', error: null }));
    holder.cloud = { rpc };
    useCloud.setState({
      state: {
        status: 'linked',
        identity: { authId: 'a', email: 'a@x.mx', role: 'student', alias: null },
      },
    });
    useAccess.setState({ signup: { status: 'required', userId: 'perfil-nuevo' } });
    show('/bienvenida?ref=ABCD2345');
    await waitFor(() => {
      expect(readPendingReferral()).toBe('ABCD2345');
    });
    // Lo canjea el puente de la nube cuando termina Completa tu registro
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rpc).not.toHaveBeenCalled();
  });
});
