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
import { PLANS } from '@/config/billing';
import type { PaidPlanKey, PaymentProvider } from '@/data/payments/checkout';
import { EMPTY_DETAILS } from '@/data/usecases/account';
import { t } from '@/i18n/es-MX';
import {
  BillingPortalCard,
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
  loadCloud: () => Promise.resolve(holder.cloud),
}));

interface FakeState {
  plan: string;
  invoke: () => Promise<{ data: unknown; error: unknown }>;
  rpcCalls: string[];
  invokeCalls: unknown[];
  otpCalls: unknown[];
  verifyCalls: unknown[];
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
    otpCalls: [],
    verifyCalls: [],
    ...overrides,
  };
  holder.cloud = {
    auth: {
      signInWithOtp: (args: unknown) => {
        state.otpCalls.push(args);
        return Promise.resolve({ error: null });
      },
      verifyOtp: (args: unknown) => {
        state.verifyCalls.push(args);
        return Promise.resolve({ data: { session: { access_token: 'x' } }, error: null });
      },
    },
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

  it('con la nube configurada y este navegador sin sesión no ofrece ningún pago y explica qué falta', async () => {
    fakeCloudFor();
    useCloud.setState({ state: { status: 'signed-out' } });
    app = await renderApp(SCREENS.subscription.path);
    expect(
      await screen.findByRole('heading', { name: t.billing.cloud.needLink.title }),
    ).toBeVisible();
    expect(screen.getByText(t.billing.cloud.needLink.body)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: t.billing.cancel })).toBeNull();
    expect(screen.queryByText(t.billing.confirm)).toBeNull();
    expect(screen.queryByText(t.billing.simulatedNotice)).toBeNull();
  });

  it('pide un enlace nuevo con el correo de la cuenta y dice que se abra en este navegador', async () => {
    const fake = fakeCloudFor();
    useCloud.setState({ state: { status: 'signed-out' } });
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path, {
      seed: async (api, user) => {
        await api.repos.accounts.put({
          userId: user.id,
          email: 'ana@x.mx',
          ...EMPTY_DETAILS,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    const send = await screen.findByRole('button', { name: t.billing.cloud.needLink.send });
    // El botón espera a que se lea el correo de la cuenta
    await waitFor(() => {
      expect(send).toBeEnabled();
    });
    await typing.click(send);
    expect(await screen.findByText(t.billing.cloud.needLink.sent('ana@x.mx'))).toBeVisible();
    expect(fake.otpCalls).toEqual([expect.objectContaining({ email: 'ana@x.mx' })]);
  });

  it('deja entrar con el código del correo abierto en otro dispositivo', async () => {
    const fake = fakeCloudFor();
    useCloud.setState({ state: { status: 'signed-out' } });
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path, {
      seed: async (api, user) => {
        await api.repos.accounts.put({
          userId: user.id,
          email: 'Ana@X.mx',
          ...EMPTY_DETAILS,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    await typing.type(await screen.findByLabelText(t.cloud.code.label), '12345678');
    await typing.click(screen.getByRole('button', { name: t.cloud.code.submit }));
    expect(await screen.findByText(t.cloud.code.verified)).toBeVisible();
    expect(fake.verifyCalls).toEqual([{ email: 'ana@x.mx', token: '12345678', type: 'email' }]);
  });

  it('si otro dispositivo tomó la cuenta lo dice y deja pedir el enlace', async () => {
    fakeCloudFor();
    useCloud.setState({ state: { status: 'signed-out', reason: 'other_device' } });
    app = await renderApp(SCREENS.subscription.path);
    expect(await screen.findByText(t.billing.cloud.needLink.otherDevice)).toBeVisible();
    expect(screen.getByRole('button', { name: t.billing.cloud.needLink.send })).toBeVisible();
  });

  it('mientras revisa la conexión no ofrece pago ni enlace', async () => {
    fakeCloudFor();
    useCloud.setState({ state: { status: 'checking' } });
    app = await renderApp(SCREENS.subscription.path);
    expect(await screen.findByText(t.cloud.checking)).toBeVisible();
    expect(screen.queryByRole('button', { name: t.billing.cloud.needLink.send })).toBeNull();
    expect(
      screen.queryByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    ).toBeNull();
  });
});

describe('tarjeta de pago', () => {
  const render_ = (
    open: (url: string) => void,
    onBack = () => undefined,
    options: { plan?: PaidPlanKey; providers?: readonly PaymentProvider[] } = {},
  ) =>
    render(
      <DataProvider kind="real">
        <CloudCheckoutCard
          plan={options.plan ?? 'annual'}
          onBack={onBack}
          open={open}
          providers={options.providers}
        />
      </DataProvider>,
    );

  it('con una sola pasarela no pide elegir y abre Stripe con la dirección del servidor', async () => {
    const state = fakeCloudFor();
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open);
    expect(screen.queryByLabelText(t.billing.cloud.provider)).toBeNull();
    expect(screen.getByText(t.billing.cloud.singleProvider)).toBeVisible();
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.go }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
    });
    expect(state.invokeCalls).toEqual([{ body: { plan: 'annual', provider: 'stripe' } }]);
  });

  it('con varias pasarelas abre la elegida', async () => {
    const state = fakeCloudFor();
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open, undefined, { providers: ['stripe', 'mercadopago'] });
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
    render_(open, undefined, { providers: ['stripe', 'mercadopago'] });
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

  it('si el cupo Fundador se llenó deja seguir con el mensual al precio regular', async () => {
    let calls = 0;
    const state = fakeCloudFor({
      invoke: () => {
        calls += 1;
        return Promise.resolve(
          calls === 1
            ? {
                data: null,
                error: {
                  context: new Response(JSON.stringify({ error: 'founder_full' }), {
                    status: 409,
                  }),
                },
              }
            : { data: { url: 'https://checkout.stripe.com/c/pay/cs_test_2' }, error: null },
        );
      },
    });
    const open = vi.fn();
    const typing = userEvent.setup();
    render_(open, undefined, { plan: 'founder' });
    await typing.click(screen.getByRole('button', { name: t.billing.cloud.go }));
    const regular = await screen.findByRole('button', {
      name: t.billing.cloud.regularInstead(
        `${t.billing.price(PLANS.monthly.priceMxn)} ${t.billing.periods.monthly}`,
      ),
    });
    await typing.click(regular);
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_2');
    });
    expect(state.invokeCalls).toEqual([
      { body: { plan: 'founder', provider: 'stripe' } },
      { body: { plan: 'monthly', provider: 'stripe' } },
    ]);
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

describe('administrar la suscripción', () => {
  const portal = t.billing.cloud.portal;
  const PORTAL_URL = 'https://billing.stripe.com/p/session/test_1';
  const withBody = (body: unknown, status: number) => ({
    data: null,
    error: { context: new Response(JSON.stringify(body), { status }) },
  });

  it('abre el portal de Stripe con la dirección que devolvió el servidor', async () => {
    const state = fakeCloudFor({
      invoke: () => Promise.resolve({ data: { url: PORTAL_URL }, error: null }),
    });
    const open = vi.fn();
    const typing = userEvent.setup();
    render(<BillingPortalCard open={open} />);
    await typing.click(screen.getByRole('button', { name: portal.go }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(PORTAL_URL);
    });
    expect(state.invokeCalls).toEqual([{ body: {} }]);
  });

  it('quien no pagó con Stripe recibe una explicación y puede volver a intentar', async () => {
    fakeCloudFor({ invoke: () => Promise.resolve(withBody({ error: 'no_customer' }, 404)) });
    const open = vi.fn();
    const typing = userEvent.setup();
    render(<BillingPortalCard open={open} />);
    await typing.click(screen.getByRole('button', { name: portal.go }));
    expect(await screen.findByText(portal.errors.no_customer)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: portal.go })).toBeEnabled();
  });

  it('no abre una dirección que no es del portal', async () => {
    fakeCloudFor({
      invoke: () => Promise.resolve({ data: { url: 'https://malo.example/portal' }, error: null }),
    });
    const open = vi.fn();
    const typing = userEvent.setup();
    render(<BillingPortalCard open={open} />);
    await typing.click(screen.getByRole('button', { name: portal.go }));
    expect(await screen.findByText(portal.errors.unsafe_url)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
  });

  it('sin la nube cargada dice que no pudo abrir el portal', async () => {
    holder.cloud = null;
    const typing = userEvent.setup();
    render(<BillingPortalCard open={vi.fn()} />);
    await typing.click(screen.getByRole('button', { name: portal.go }));
    expect(await screen.findByText(portal.errors.failed)).toBeVisible();
  });

  it('la pantalla Suscripción lo ofrece solo a quien ya paga y con la nube conectada', async () => {
    fakeCloudFor({ plan: 'monthly' });
    app = await renderApp(SCREENS.subscription.path, {
      seed: async (api, user) => {
        await api.repos.subscriptions.put({
          userId: user.id,
          plan: 'monthly',
          status: 'active',
          isSimulated: false,
          periodEnd: null,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    expect(await screen.findByRole('heading', { name: portal.title })).toBeVisible();
  });

  it('un alumno del plan Gratis no ve el portal', async () => {
    fakeCloudFor();
    app = await renderApp(SCREENS.subscription.path);
    await screen.findByRole('heading', { name: t.screens.subscription.title });
    expect(screen.queryByRole('heading', { name: portal.title })).toBeNull();
  });

  it('sin la nube conectada tampoco, porque el plan simulado se cambia en la misma pantalla', async () => {
    useCloud.setState({ state: { status: 'off' } });
    app = await renderApp(SCREENS.subscription.path, {
      seed: async (api, user) => {
        await api.repos.subscriptions.put({
          userId: user.id,
          plan: 'monthly',
          status: 'active',
          isSimulated: true,
          periodEnd: null,
          updatedAt: new Date().toISOString(),
        });
      },
    });
    await screen.findByRole('heading', { name: t.screens.subscription.title });
    expect(screen.queryByRole('heading', { name: portal.title })).toBeNull();
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
