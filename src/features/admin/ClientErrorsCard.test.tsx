// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { adminText } from '@/i18n/admin';
import { ClientErrorsCard } from './ClientErrorsCard';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = adminText.clientErrors;

const row = {
  day: '2026-10-10',
  kind: 'error',
  message: 'TypeError: Cannot read properties of undefined',
  stack: 'at f (https://x.mx/assets/a.js:10:200)',
  screen: '/mazos',
  version: 'abc1234',
  occurrences: 3,
  first_seen: '2026-10-10T10:00:00Z',
  last_seen: '2026-10-10T11:00:00Z',
};

function cloudWith(reply: () => Promise<unknown>) {
  const limit = vi.fn().mockImplementation(reply);
  holder.cloud = {
    from: () => ({ select: () => ({ order: () => ({ limit }) }) }),
  };
  return limit;
}

beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'a', email: 'a@x.mx', role: 'admin', alias: null },
    },
  });
});
afterEach(() => {
  cleanup();
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('errores del navegador', () => {
  it('sin la cuenta de la nube conectada explica qué falta y no lee nada', () => {
    useCloud.setState({ state: { status: 'off' } });
    const limit = cloudWith(() => Promise.resolve({ data: [], error: null }));
    render(<ClientErrorsCard />);
    expect(screen.getByText(text.needsCloud)).toBeVisible();
    expect(screen.queryByRole('button', { name: text.refresh })).toBeNull();
    expect(limit).not.toHaveBeenCalled();
  });

  it('lista los errores con su conteo, su pantalla y su versión', async () => {
    cloudWith(() => Promise.resolve({ data: [row], error: null }));
    render(<ClientErrorsCard />);
    expect(await screen.findByText(row.message)).toBeVisible();
    expect(screen.getByText(text.kinds.error)).toBeVisible();
    expect(screen.getByText(text.times(3))).toBeVisible();
    expect(screen.getByText(/Pantalla \/mazos\. Versión abc1234\./)).toBeVisible();
    expect(screen.getByText(text.stack)).toBeVisible();
  });

  it('sin errores lo dice', async () => {
    cloudWith(() => Promise.resolve({ data: [], error: null }));
    render(<ClientErrorsCard />);
    expect(await screen.findByText(text.empty)).toBeVisible();
  });

  it('si no se pueden leer dice por qué puede ser', async () => {
    cloudWith(() => Promise.resolve({ data: null, error: { message: 'no existe' } }));
    render(<ClientErrorsCard />);
    expect(await screen.findByText(text.failed)).toBeVisible();
  });

  it('Actualizar vuelve a leer', async () => {
    const limit = cloudWith(() => Promise.resolve({ data: [], error: null }));
    const typing = userEvent.setup();
    render(<ClientErrorsCard />);
    await screen.findByText(text.empty);
    expect(limit).toHaveBeenCalledTimes(1);
    await typing.click(screen.getByRole('button', { name: text.refresh }));
    await waitFor(() => {
      expect(limit).toHaveBeenCalledTimes(2);
    });
  });
});
