// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { DataProvider } from '@/data/DataProvider';
import { t } from '@/i18n/es-MX';
import {
  CloudCheckoutCard,
  PaymentReturnNotice,
  RETURN_CHECKS,
  RETURN_CHECK_MS,
} from './CloudBilling';

vi.setConfig({ testTimeout: 30_000 });

// getCloud devuelve el cliente falso que cada prueba arma
const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
}));

interface FakeState {
  plan: string;
  invoke: () => Promise<{ data: unknown; error: unknown }>;
  rpcCalls: string[];
  invokeCalls: unknown[];
}

function fakeCloudFor(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    plan: 'free',
    invoke: () =>
      Promise.resolve({
        data: { url: 'https://checkout.stripe.com/c/pay/cs_test_1' },
        error: null,
      }),
    rpcCalls: [],
    invokeCalls: [],
    ...overrides,
  };
  holder.cloud = {
    rpc: (name: string) => {
      state.rpcCalls.push(name);
      return Promise.resolve({
        data: {
          plan: state.plan,
          source: state.plan === 'free' ? 'none' : 'payment',
          status: 'active',
          provider: 'stripe',
          periodEnd: null,
        },
        error: null,
      });
    },
    functions: {
      invoke: (_name: string, init: unknown) => {
        state.invokeCalls.push(init);
        return state.invoke();
      },
    },
  };
  return state;
}

let app: RenderedApp | undefined;
beforeEach(() => {
  useCloud.setState({
    state: {
      status: 'linked',
      identity: { authId: 'a', email: 'a@x.mx', role: 'student', alias: null },
    },
  });
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await resetApp(app?.api);
  app = undefined;
  holder.cloud = null;
  useCloud.setState({ state: { status: 'off' } });
});

describe('pago real desde Suscripción', () => {
  it('con la nube conectada el aviso es el del servidor y no hay pago simulado', async () => {
    fakeCloudFor();
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path);
    await typing.click(
      await screen.findByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    );
    expect(
      await screen.findByRole('heading', { name: t.billing.cloud.checkoutTitle }),
    ).toBeVisible();
    expect(screen.queryByText(t.billing.confirm)).toBeNull();
    expect(screen.queryByRole('button', { name: t.billing.cancel })).toBeNull();
    expect(screen.getByText(t.billing.cloud.testMode)).toBeVisible();
  });

  it('sin la nube sigue el checkout simulado de siempre', async () => {
    useCloud.setState({ state: { status: 'off' } });
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path);
    await typing.click(
      await screen.findByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    );
    expect(await screen.findByText(t.billing.confirm)).toBeVisible();
  });
});

describe('tarjeta de pago', () => {
  const render_ = (open: (url: string) => void, onBack = () => undefined) =>
    render(
      <DataProvider kind="real">
        <CloudCheckoutCard plan="annual" onBack={onBack} open={open} />
      </DataProvider>,
    );

  it('abre la pasarela elegida con la dirección que devolvió el servidor', async () => {
    const state = fakeCloudFor();
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open);
    await typing.selectOptions(screen.getByLabelText(t.billing.cloud.provider), 'stripe');
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.go }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
    });
    expect(state.invokeCalls).toEqual([{ body: { plan: 'annual', provider: 'stripe' } }]);
  });

  it('manda la pasarela de Mercado Pago cuando se elige', async () => {
    const state = fakeCloudFor({
      invoke: () =>
        Promise.resolve({
          data: { url: 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1' },
          error: null,
        }),
    });
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open);
    await typing.selectOptions(screen.getByLabelText(t.billing.cloud.provider), 'mercadopago');
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.go }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(
        'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1',
      );
    });
    expect(state.invokeCalls).toEqual([{ body: { plan: 'annual', provider: 'mercadopago' } }]);
  });

  it('muestra el motivo si el servidor no puede y deja volver a intentar', async () => {
    fakeCloudFor({
      invoke: () =>
        Promise.resolve({
          data: null,
          error: {
            context: new Response(JSON.stringify({ error: 'founder_full' }), { status: 409 }),
          },
        }),
    });
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open);
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.go }));
    expect(await screen.findByText(t.billing.cloud.errors.founder_full)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t.billing.cloud.go })).toBeEnabled();
  });

  it('no abre una dirección que no es de la pasarela', async () => {
    fakeCloudFor({
      invoke: () => Promise.resolve({ data: { url: 'https://malo.example/pagar' }, error: null }),
    });
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open);
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.go }));
    expect(await screen.findByText(t.billing.cloud.errors.unsafe_url)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
  });

  it('Volver regresa a los planes', async () => {
    fakeCloudFor();
    const onBack = vi.fn();
    const typing = userEvent.setup();
    render_(vi.fn(), onBack);
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('al volver de la pasarela', () => {
  const returning = (search: string) =>
    render(
      <DataProvider kind="real">
        <MemoryRouter initialEntries={[`/suscripcion${search}`]}>
          <PaymentReturnNotice userId="01J9Z000000000000000000001" current="free" />
        </MemoryRouter>
      </DataProvider>,
    );

  it('cancelar dice que no se cobró nada', () => {
    fakeCloudFor();
    returning('?pago=cancelado');
    expect(screen.getByText(t.billing.cloud.returning.canceled)).toBeVisible();
  });

  it('sin parámetro no muestra nada', () => {
    fakeCloudFor();
    const view = returning('');
    expect(view.container).toBeEmptyDOMElement();
  });

  it('confirma el pago cuando el servidor ya cambió el plan', async () => {
    const state = fakeCloudFor({ plan: 'free' });
    returning('?pago=ok');
    expect(await screen.findByText(t.billing.cloud.returning.ok)).toBeVisible();
    await waitFor(() => {
      expect(state.rpcCalls.length).toBeGreaterThanOrEqual(1);
    });
    state.plan = 'monthly';
    expect(
      await screen.findByText(t.billing.cloud.returning.confirmed, undefined, {
        timeout: RETURN_CHECK_MS * 3,
      }),
    ).toBeVisible();
  });

  it('si tarda demasiado lo dice, y deja de preguntar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = fakeCloudFor({ plan: 'free' });
    returning('?pago=ok');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETURN_CHECK_MS * (RETURN_CHECKS + 2));
    });
    expect(screen.getByText(t.billing.cloud.returning.slow)).toBeVisible();
    const calls = state.rpcCalls.length;
    expect(calls).toBe(RETURN_CHECKS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETURN_CHECK_MS * 5);
    });
    expect(state.rpcCalls.length).toBe(calls);
  });
});
