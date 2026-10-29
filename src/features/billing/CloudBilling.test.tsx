// @vitest-environment jsdom
// Suscripción con la cuenta en la nube (Fase P bloque 5, D-096, y B10 del plan del cambio). Lo que
// ofrece cada tarjeta de planes según lo que el alumno ya tiene, Administrar suscripción con Stripe o
// con Mercado Pago, la tarjeta de quien no tiene sesión en este navegador y el aviso al volver de la
// pasarela. Cancelar, con Mercado Pago o con el pago simulado, pide confirmar en un diálogo, nunca vive
// en la tarjeta de Gratis y deja el plan hasta su fecha (V5-B0). La forma de pago se prueba en
// CheckoutOptions.test.tsx.
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloud } from '@/app/cloudState';
import { SCREENS } from '@/app/screens';
import { renderApp, resetApp, type RenderedApp } from '@/app/testing/renderApp';
import { planOf } from '@/config/billing';
import { writeStoredFlags } from '@/config/featureFlags';
import { DataProvider } from '@/data/DataProvider';
import type { Subscription, User } from '@/data/schemas/people';
import { EMPTY_DETAILS } from '@/data/usecases/account';
import { changePlan, simulatedPeriodEnd } from '@/data/usecases/subscription';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import {
  BillingPortalCard,
  MercadoPagoManageCard,
  PaymentReturnNotice,
  RETURN_CHECKS,
  RETURN_CHECK_MS,
} from './CloudBilling';
import { longDate } from './planState';

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
  /** De dónde viene el plan según my_plan. Sin valor, un pago si el plan no es Gratis */
  source?: 'payment' | 'referral' | 'pass';
  /** Lo demás de my_plan v2, que se suma a plan y source */
  extra?: Record<string, unknown>;
  invoke: (name: string) => Promise<{ data: unknown; error: unknown }>;
  rpcCalls: string[];
  invokeCalls: [string, unknown][];
  otpCalls: unknown[];
  verifyCalls: unknown[];
  /** Error con el que responde signInWithOtp, como el rechazo del registro por invitación (B9) */
  otpError?: { status: number; message: string } | null;
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
        return Promise.resolve({ error: state.otpError ?? null });
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
          source: state.plan === 'free' ? 'none' : (state.source ?? 'payment'),
          status: state.plan === 'free' ? 'none' : 'active',
          provider: 'stripe',
          periodEnd: null,
          ...state.extra,
        },
        error: null,
      });
    },
    functions: {
      invoke: (name: string, init: unknown) => {
        state.invokeCalls.push([name, init]);
        return state.invoke(name);
      },
    },
  };
  return state;
}

const PERIOD_END = '2026-11-14T15:00:00.000Z';

/** La suscripción que reflejó la nube, con lo que la prueba cambie */
const mirrored =
  (patch: Partial<Subscription>) =>
  async (api: RenderedApp['api'], user: { id: string }): Promise<void> => {
    await api.repos.subscriptions.put({
      userId: user.id,
      plan: 'monthly',
      status: 'active',
      isSimulated: false,
      periodEnd: PERIOD_END,
      source: 'payment',
      cloudStatus: 'active',
      provider: 'stripe',
      updatedAt: new Date().toISOString(),
      ...patch,
    });
  };

const region = (name: string) => screen.getByRole('region', { name });

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
  it('con la nube conectada el aviso es el del servidor y elegir abre la forma de pago, sin pago simulado', async () => {
    fakeCloudFor();
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path);
    await typing.click(
      await screen.findByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    );
    expect(
      await screen.findByRole('heading', {
        name: billingCloudText.checkoutTitle(t.billing.plans.monthly),
      }),
    ).toBeVisible();
    expect(screen.queryByText(t.billing.confirm)).toBeNull();
    expect(screen.queryByRole('button', { name: t.billing.cancel })).toBeNull();
    expect(screen.getByText(billingCloudText.testMode)).toBeVisible();
  });

  it('con la prueba disponible el botón de cada plan de pago dice Prueba 7 días gratis', async () => {
    fakeCloudFor();
    app = await renderApp(SCREENS.subscription.path, {
      seed: mirrored({
        plan: 'free',
        status: 'none',
        source: undefined,
        cloudStatus: undefined,
        periodEnd: null,
        trialAvailable: true,
      }),
    });
    const monthly = await screen.findByRole('region', { name: t.billing.plans.monthly });
    // El plan reflejado llega de la base local un momento después de la tabla
    expect(
      await within(monthly).findByRole('button', { name: t.billing.freeTrialCta }),
    ).toBeVisible();
    expect(
      within(region(t.billing.plans.annual)).getByRole('button', { name: t.billing.freeTrialCta }),
    ).toBeVisible();
    // El lugar Fundador se aparta al empezar la prueba
    expect(within(monthly).getByText(t.billing.founderNote(100))).toBeVisible();
  });

  it('el anual muestra el precio Fundador de 749 con 1,499 tachado, su ahorro de 20% e IVA incluido', async () => {
    fakeCloudFor();
    app = await renderApp(SCREENS.subscription.path);
    const annual = await screen.findByRole('region', { name: t.billing.plans.annual });
    expect(within(annual).getByText(t.billing.price(749))).toBeVisible();
    expect(within(annual).getByText(t.billing.price(1499)).tagName).toBe('S');
    expect(within(annual).getByText(t.billing.founderSavings(20))).toBeVisible();
    expect(within(annual).getByText(t.billing.taxIncluded)).toBeVisible();
  });

  it('el botón de los candados abre directo la forma de pago del Mensual (?plan=mensual)', async () => {
    fakeCloudFor();
    app = await renderApp(`${SCREENS.subscription.path}?plan=mensual`);
    expect(
      await screen.findByRole('heading', {
        name: billingCloudText.checkoutTitle(t.billing.plans.monthly),
      }),
    ).toBeVisible();
    // El parámetro se quita para que volver no la abra otra vez
    await waitFor(() => {
      expect(app?.router.state.location.search).toBe('');
    });
  });

  it('con un plan pagado vigente ?plan=mensual solo muestra los planes', async () => {
    fakeCloudFor({ plan: 'monthly' });
    app = await renderApp(`${SCREENS.subscription.path}?plan=mensual`, { seed: mirrored({}) });
    expect(
      await screen.findByRole('button', { name: billingCloudText.changeTo.annual }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', {
        name: billingCloudText.checkoutTitle(t.billing.plans.monthly),
      }),
    ).toBeNull();
  });

  it('con la nube configurada y este navegador sin sesión no ofrece ningún pago y explica qué falta', async () => {
    fakeCloudFor();
    useCloud.setState({ state: { status: 'signed-out' } });
    app = await renderApp(SCREENS.subscription.path);
    expect(
      await screen.findByRole('heading', { name: billingCloudText.needLink.title }),
    ).toBeVisible();
    expect(screen.getByText(billingCloudText.needLink.body)).toBeVisible();
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
    const send = await screen.findByRole('button', { name: billingCloudText.needLink.send });
    // El botón espera a que se lea el correo de la cuenta
    await waitFor(() => {
      expect(send).toBeEnabled();
    });
    await typing.click(send);
    expect(await screen.findByText(billingCloudText.needLink.sent('ana@x.mx'))).toBeVisible();
    expect(fake.otpCalls).toEqual([expect.objectContaining({ email: 'ana@x.mx' })]);
  });

  it('si el servidor rechaza el correo porque no tiene invitación, lo dice con ese motivo', async () => {
    fakeCloudFor({
      otpError: {
        status: 403,
        message:
          'Studiare está abierto solo con invitación y este correo no tiene una (invitation_required)',
      },
    });
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
    const send = await screen.findByRole('button', { name: billingCloudText.needLink.send });
    await waitFor(() => {
      expect(send).toBeEnabled();
    });
    await typing.click(send);
    expect(await screen.findByText(t.accounts.signup.invitationRequired)).toBeVisible();
    expect(screen.queryByText(t.cloud.failedBody)).toBeNull();
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
    expect(await screen.findByText(billingCloudText.needLink.otherDevice)).toBeVisible();
    expect(screen.getByRole('button', { name: billingCloudText.needLink.send })).toBeVisible();
  });

  it('mientras revisa la conexión no ofrece pago ni enlace', async () => {
    fakeCloudFor();
    useCloud.setState({ state: { status: 'checking' } });
    app = await renderApp(SCREENS.subscription.path);
    expect(await screen.findByText(t.cloud.checking)).toBeVisible();
    expect(screen.queryByRole('button', { name: billingCloudText.needLink.send })).toBeNull();
    expect(
      screen.queryByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    ).toBeNull();
  });
});

describe('administrar la suscripción', () => {
  const portal = billingCloudText.portal;
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
    expect(state.invokeCalls).toEqual([['create-portal-session', { body: {} }]]);
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

  it('si el servidor no tiene la configuración del portal dice cómo cambiar o cancelar', async () => {
    fakeCloudFor({ invoke: () => Promise.resolve(withBody({ error: 'not_configured' }, 503)) });
    const open = vi.fn();
    const typing = userEvent.setup();
    render(<BillingPortalCard open={open} />);
    await typing.click(screen.getByRole('button', { name: portal.go }));
    const message = await screen.findByText(portal.errors.not_configured);
    expect(message).toBeVisible();
    // No basta con decir que no está activado. Dice a quién escribir para cambiar de plan o cancelar
    expect(message).toHaveTextContent(/equipo de Studiare/);
    expect(message).toHaveTextContent(/cancelar/);
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: portal.go })).toBeEnabled();
  });

  it('si la suscripción es de Mercado Pago lo explica en lugar de abrir el portal', async () => {
    fakeCloudFor({ invoke: () => Promise.resolve(withBody({ error: 'mercadopago' }, 409)) });
    const open = vi.fn();
    const typing = userEvent.setup();
    render(<BillingPortalCard open={open} />);
    await typing.click(screen.getByRole('button', { name: portal.go }));
    expect(await screen.findByText(portal.errors.mercadopago)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
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

  it('la pantalla Suscripción lo ofrece solo a quien paga con Stripe y con la nube conectada', async () => {
    fakeCloudFor({ plan: 'monthly' });
    app = await renderApp(SCREENS.subscription.path, { seed: mirrored({}) });
    expect(await screen.findByRole('heading', { name: portal.title })).toBeVisible();
    expect(screen.getByRole('button', { name: portal.go })).toBeVisible();
    expect(screen.queryByRole('button', { name: billingCloudText.mercadoPago.cancel })).toBeNull();
  });

  it('Recibos lleva a Facturas, donde están los pagos reales, en lugar de decir que no hay recibos', async () => {
    fakeCloudFor({ plan: 'monthly' });
    app = await renderApp(SCREENS.subscription.path, { seed: mirrored({}) });
    const receipts = await screen.findByRole('region', { name: t.billing.receiptsTitle });
    expect(
      within(receipts).getByText(billingCloudText.receiptsInCloud, { exact: false }),
    ).toBeVisible();
    expect(
      within(receipts).getByRole('link', { name: billingCloudText.receiptsInCloudLink }),
    ).toHaveAttribute('href', `${SCREENS.settings.path}#perfil`);
    expect(within(receipts).queryByText(t.billing.noReceipts)).toBeNull();
  });

  it('un alumno del plan Gratis no ve el portal', async () => {
    fakeCloudFor();
    app = await renderApp(SCREENS.subscription.path);
    await screen.findByRole('heading', { name: t.screens.subscription.title });
    expect(screen.queryByRole('heading', { name: portal.title })).toBeNull();
  });

  it('con un pase o un mes regalado tampoco, porque no hay nada que se renueve', async () => {
    fakeCloudFor({ plan: 'monthly', source: 'pass' });
    app = await renderApp(SCREENS.subscription.path, {
      seed: mirrored({ source: 'pass', passEnd: PERIOD_END, cloudStatus: undefined }),
    });
    await screen.findByRole('heading', { name: t.screens.subscription.title });
    await screen.findByText(billingCloudText.status.pass(longDate(PERIOD_END)));
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

describe('cancelar la suscripción de Mercado Pago', () => {
  const mp = billingCloudText.mercadoPago;
  const dialog = billingCloudText.cancelDialog;
  const subscription: Subscription = {
    userId: '01J9Z000000000000000000001',
    plan: 'monthly',
    status: 'active',
    isSimulated: false,
    periodEnd: PERIOD_END,
    source: 'payment',
    cloudStatus: 'active',
    provider: 'mercadopago',
    updatedAt: '2026-10-14T00:00:00.000Z',
  };

  it('pide confirmar en un diálogo con lo que se pierde y la fecha, y solo cancela al confirmar (V5-B0)', async () => {
    const state = fakeCloudFor({
      invoke: () =>
        Promise.resolve({ data: { status: 'canceled', periodEnd: PERIOD_END }, error: null }),
    });
    const onChanged = vi.fn();
    const typing = userEvent.setup();
    render(<MercadoPagoManageCard subscription={subscription} onChanged={onChanged} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await typing.click(screen.getByRole('button', { name: mp.cancel }));
    // Un clic no cancela. Abre el diálogo modal, con la fecha y lo que se pierde
    const warning = await screen.findByRole('alertdialog', { name: dialog.title });
    expect(state.invokeCalls).toEqual([]);
    expect(within(warning).getByText(mp.confirm(longDate(PERIOD_END)))).toBeVisible();
    expect(within(warning).getByText(dialog.loses)).toBeVisible();
    expect(
      within(warning).getByText(
        dialog.dailyQuestions(
          t.billing.access.dailyQuestions(null),
          t.billing.access.dailyQuestions(20),
        ),
      ),
    ).toBeVisible();
    for (const lost of ['fullExam', 'aiTutor', 'outlines', 'deckCatalog', 'importDecks', 'party']) {
      expect(within(warning).getByText(t.billing.access[lost as 'party'])).toBeVisible();
    }
    // Conservarla es lo seguro, recibe el foco y no llama a nadie
    expect(within(warning).getByRole('button', { name: dialog.keep })).toHaveFocus();
    await typing.click(within(warning).getByRole('button', { name: dialog.keep }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(state.invokeCalls).toEqual([]);
    expect(screen.getByRole('button', { name: mp.cancel })).toBeVisible();

    // Escape también conserva
    await typing.click(screen.getByRole('button', { name: mp.cancel }));
    await screen.findByRole('alertdialog', { name: dialog.title });
    await typing.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    expect(state.invokeCalls).toEqual([]);

    await typing.click(screen.getByRole('button', { name: mp.cancel }));
    await typing.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: dialog.confirm,
      }),
    );
    expect(await screen.findByText(mp.done(longDate(PERIOD_END)))).toBeVisible();
    expect(state.invokeCalls).toEqual([['cancel-subscription', { body: {} }]]);
    expect(onChanged).toHaveBeenCalledTimes(1);
    // Ya cancelada, el botón se va aunque la nube todavía no lo refleje
    expect(screen.queryByRole('button', { name: mp.cancel })).toBeNull();
  });

  it('sin fecha en la suscripción lo dice sin inventar una', async () => {
    fakeCloudFor();
    const typing = userEvent.setup();
    render(<MercadoPagoManageCard subscription={{ ...subscription, periodEnd: null }} />);
    await typing.click(screen.getByRole('button', { name: mp.cancel }));
    const warning = await screen.findByRole('alertdialog', { name: dialog.title });
    expect(within(warning).getByText(mp.confirmNoDate)).toBeVisible();
  });

  it('dice por qué no pudo cancelar y no avisa de un cambio', async () => {
    fakeCloudFor({
      invoke: () =>
        Promise.resolve({
          data: null,
          error: {
            context: new Response(JSON.stringify({ error: 'no_subscription' }), { status: 404 }),
          },
        }),
    });
    const onChanged = vi.fn();
    const typing = userEvent.setup();
    render(<MercadoPagoManageCard subscription={subscription} onChanged={onChanged} />);
    await typing.click(screen.getByRole('button', { name: mp.cancel }));
    await typing.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: dialog.confirm,
      }),
    );
    expect(await screen.findByText(mp.errors.no_subscription)).toBeVisible();
    expect(onChanged).not.toHaveBeenCalled();
    // Se puede volver a intentar
    expect(screen.getByRole('button', { name: mp.cancel })).toBeEnabled();
  });

  it('ya cancelada no ofrece cancelar otra vez', () => {
    fakeCloudFor();
    render(<MercadoPagoManageCard subscription={{ ...subscription, cancelAtPeriodEnd: true }} />);
    expect(screen.getByText(mp.already)).toBeVisible();
    expect(screen.queryByRole('button', { name: mp.cancel })).toBeNull();
  });

  it('Suscripción la muestra en lugar del portal a quien paga con Mercado Pago', async () => {
    fakeCloudFor({ plan: 'monthly', extra: { provider: 'mercadopago' } });
    app = await renderApp(SCREENS.subscription.path, {
      seed: mirrored({ provider: 'mercadopago' }),
    });
    expect(await screen.findByRole('button', { name: mp.cancel })).toBeVisible();
    expect(screen.queryByRole('button', { name: billingCloudText.portal.go })).toBeNull();
    // El botón vive en Administrar suscripción y nunca en la tarjeta de Gratis
    expect(within(region(mp.title)).getByRole('button', { name: mp.cancel })).toBeVisible();
    expect(within(region(t.billing.plans.free)).queryByRole('button')).toBeNull();
    // Para cambiar de plan con Mercado Pago se cancela y se contrata el otro al terminar
    expect(
      within(region(t.billing.plans.annual)).getByText(billingCloudText.mercadoPagoChangeNote),
    ).toBeVisible();
  });

  it('cancelada en la nube, Suscripción sigue diciendo el plan de pago hasta su fecha y no Gratis', async () => {
    fakeCloudFor({
      plan: 'monthly',
      extra: {
        provider: 'mercadopago',
        status: 'canceled',
        periodEnd: PERIOD_END,
        cancelAtPeriodEnd: true,
      },
    });
    app = await renderApp(SCREENS.subscription.path, {
      seed: mirrored({ provider: 'mercadopago', cloudStatus: 'canceled', cancelAtPeriodEnd: true }),
    });
    expect(
      await screen.findByText(billingCloudText.status.canceled(longDate(PERIOD_END))),
    ).toBeVisible();
    expect(region(t.billing.current(t.billing.plans.monthly))).toBeVisible();
    expect(screen.getByText(billingCloudText.validUntil(longDate(PERIOD_END)))).toBeVisible();
    expect(screen.getByText(mp.already)).toBeVisible();
    expect(screen.queryByRole('button', { name: mp.cancel })).toBeNull();
  });
});

describe('cancelar el pago simulado (V5-B0)', () => {
  const dialog = billingCloudText.cancelDialog;
  const NOW = new Date('2026-10-14T15:00:00.000Z');
  const END = simulatedPeriodEnd('monthly', NOW);
  const offline = () => {
    holder.cloud = null;
    useCloud.setState({ state: { status: 'off' } });
  };
  const subscribed = async (api: RenderedApp['api'], user: User) => {
    await changePlan(api, user, 'monthly', NOW);
  };

  it('Cancelar no vive en la tarjeta de Gratis sino en Tu suscripción, y un clic solo abre el diálogo', async () => {
    offline();
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path, { seed: subscribed });
    const manage = await screen.findByRole('region', { name: t.billing.manage.title });
    expect(within(manage).getByText(t.billing.manage.simulated)).toBeVisible();
    const free = region(t.billing.plans.free);
    expect(within(free).queryByRole('button', { name: t.billing.cancel })).toBeNull();
    expect(within(free).getByText(billingCloudText.cancelNote)).toBeVisible();
    expect(screen.getAllByRole('button', { name: t.billing.cancel })).toHaveLength(1);

    await typing.click(within(manage).getByRole('button', { name: t.billing.cancel }));
    const warning = await screen.findByRole('alertdialog', { name: dialog.title });
    expect(within(warning).getByText(dialog.until(longDate(END)))).toBeVisible();
    expect(within(warning).getByText(t.billing.access.party)).toBeVisible();
    await typing.click(within(warning).getByRole('button', { name: dialog.keep }));
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });
    // Sin confirmar nada cambia
    const stored = await app.api.repos.subscriptions.get(app.user.id);
    expect(stored).toMatchObject({ plan: 'monthly', status: 'active', periodEnd: END });
    expect(stored?.cancelAtPeriodEnd).toBeUndefined();
    expect(region(t.billing.current(t.billing.plans.monthly))).toBeVisible();
  });

  it('al confirmar, el plan sigue como Mensual hasta la fecha, con cancelAtPeriodEnd, y no baja a Gratis', async () => {
    offline();
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path, { seed: subscribed });
    const manage = await screen.findByRole('region', { name: t.billing.manage.title });
    await typing.click(within(manage).getByRole('button', { name: t.billing.cancel }));
    await typing.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: dialog.confirm,
      }),
    );
    expect(await screen.findByText(billingCloudText.status.canceled(longDate(END)))).toBeVisible();
    expect(region(t.billing.current(t.billing.plans.monthly))).toBeVisible();
    expect(screen.getByText(billingCloudText.validUntil(longDate(END)))).toBeVisible();
    expect(screen.queryByRole('button', { name: t.billing.cancel })).toBeNull();
    expect(within(region(t.billing.plans.monthly)).getByText(t.billing.currentPlan)).toBeVisible();
    const stored = await app.api.repos.subscriptions.get(app.user.id);
    expect(stored).toMatchObject({
      plan: 'monthly',
      status: 'active',
      isSimulated: true,
      periodEnd: END,
      cancelAtPeriodEnd: true,
    });
    // Vigente hasta la fecha, y Gratis desde que pasa
    expect(planOf(stored, Date.parse(END) - 1)).toBe('monthly');
    expect(planOf(stored, Date.parse(END))).toBe('free');
    const events = await app.api.repos.events.query({ userId: app.user.id });
    expect(
      events.filter((event) => event.type === 'subscription_changed').map((event) => event.payload),
    ).toEqual([
      expect.objectContaining({ plan: 'monthly', status: 'active' }),
      expect.objectContaining({ plan: 'monthly', status: 'canceled', amountMxn: 0 }),
    ]);
  });
});

describe('un solo plan pagado a la vez', () => {
  it('con una suscripción de Stripe vigente las otras tarjetas cambian de plan en el portal (3.1.1)', async () => {
    const state = fakeCloudFor({
      plan: 'annual',
      invoke: () =>
        Promise.resolve({ data: { url: 'https://billing.stripe.com/p/session/x' }, error: null }),
    });
    const typing = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', {
      assign,
      href: window.location.href,
      origin: window.location.origin,
    });
    app = await renderApp(SCREENS.subscription.path, { seed: mirrored({ plan: 'annual' }) });
    const monthly = await screen.findByRole('region', { name: t.billing.plans.monthly });
    expect(await within(monthly).findByText(billingCloudText.changeNote)).toBeVisible();
    expect(
      screen.queryByRole('button', { name: t.billing.choose(t.billing.plans.monthly) }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: t.billing.freeTrialCta })).toBeNull();
    await typing.click(
      within(monthly).getByRole('button', { name: billingCloudText.changeTo.monthly }),
    );
    await waitFor(() => {
      expect(state.invokeCalls).toEqual([['create-portal-session', { body: { flow: 'update' } }]]);
    });
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://billing.stripe.com/p/session/x');
    });
    vi.unstubAllGlobals();
  });

  it('con un pase vigente dice hasta cuándo vale y solo deja sumar otro mes o año', async () => {
    writeStoredFlags({ cashPasses: true });
    fakeCloudFor({ plan: 'monthly', source: 'pass' });
    const typing = userEvent.setup();
    app = await renderApp(SCREENS.subscription.path, {
      seed: mirrored({ source: 'pass', passEnd: PERIOD_END, cloudStatus: undefined }),
    });
    expect(await screen.findByText(billingCloudText.passNote(longDate(PERIOD_END)))).toBeVisible();
    expect(screen.queryByRole('button', { name: t.billing.freeTrialCta })).toBeNull();
    await typing.click(screen.getByRole('button', { name: billingCloudText.addPeriod.annual }));
    expect(
      await screen.findByRole('heading', {
        name: billingCloudText.checkoutTitle(t.billing.plans.annual),
      }),
    ).toBeVisible();
    // Solo los pases. La tarjeta con renovación espera a que termine el pase (8.10)
    expect(
      screen.getByRole('radio', { name: new RegExp(billingCloudText.options.oxxo.label) }),
    ).toBeVisible();
    expect(
      screen.queryByRole('radio', { name: new RegExp(billingCloudText.options.card.label) }),
    ).toBeNull();
    expect(
      screen.getByText(new RegExp(billingCloudText.summary.passAdds(longDate(PERIOD_END)))),
    ).toBeVisible();
  });

  it('con un mes regalado por referido sí deja pagar', async () => {
    fakeCloudFor({ plan: 'monthly', source: 'referral' });
    app = await renderApp(SCREENS.subscription.path, {
      seed: mirrored({ source: 'referral', cloudStatus: undefined }),
    });
    expect(
      await screen.findByRole('button', { name: t.billing.choose(t.billing.plans.annual) }),
    ).toBeVisible();
    expect(screen.queryByText(billingCloudText.changeNote)).toBeNull();
  });
});

describe('al volver de la pasarela', () => {
  const returning = (search: string, subscription: Subscription | null = null) =>
    render(
      <DataProvider kind="real">
        <MemoryRouter initialEntries={[`/suscripcion${search}`]}>
          <PaymentReturnNotice userId="01J9Z000000000000000000001" subscription={subscription} />
        </MemoryRouter>
      </DataProvider>,
    );

  it('cancelar dice que no se cobró nada', () => {
    fakeCloudFor();
    returning('?pago=cancelado');
    expect(screen.getByText(billingCloudText.returning.canceled)).toBeVisible();
  });

  it('sin parámetro no muestra nada', () => {
    fakeCloudFor();
    const view = returning('');
    expect(view.container).toBeEmptyDOMElement();
  });

  it('confirma el pago cuando el servidor ya cambió el plan', async () => {
    const state = fakeCloudFor({ plan: 'free' });
    returning('?pago=ok');
    expect(await screen.findByText(billingCloudText.returning.ok)).toBeVisible();
    await waitFor(() => {
      expect(state.rpcCalls.length).toBeGreaterThanOrEqual(1);
    });
    state.plan = 'monthly';
    expect(
      await screen.findByText(billingCloudText.returning.confirmed, undefined, {
        timeout: RETURN_CHECK_MS * 3,
      }),
    ).toBeVisible();
  });

  it('con la prueba gratis dice que empezó y que hoy no se cobró nada', async () => {
    const state = fakeCloudFor({ plan: 'free' });
    returning('?pago=ok');
    await waitFor(() => {
      expect(state.rpcCalls.length).toBeGreaterThanOrEqual(1);
    });
    state.plan = 'founder';
    state.extra = { status: 'trialing', trialEnd: PERIOD_END, periodEnd: PERIOD_END };
    expect(
      await screen.findByText(billingCloudText.returning.trialStarted, undefined, {
        timeout: RETURN_CHECK_MS * 3,
      }),
    ).toBeVisible();
  });

  it('un segundo pase que alarga el mismo plan también confirma el pago', async () => {
    const state = fakeCloudFor({
      plan: 'monthly',
      source: 'pass',
      extra: { passEnd: PERIOD_END, periodEnd: PERIOD_END },
    });
    returning('?pago=ok', {
      userId: '01J9Z000000000000000000001',
      plan: 'monthly',
      status: 'active',
      isSimulated: false,
      periodEnd: PERIOD_END,
      source: 'pass',
      passEnd: PERIOD_END,
      updatedAt: '2026-10-14T00:00:00.000Z',
    });
    await waitFor(() => {
      expect(state.rpcCalls.length).toBeGreaterThanOrEqual(1);
    });
    state.extra = { passEnd: '2026-12-14T15:00:00.000Z', periodEnd: '2026-12-14T15:00:00.000Z' };
    expect(
      await screen.findByText(billingCloudText.returning.confirmed, undefined, {
        timeout: RETURN_CHECK_MS * 3,
      }),
    ).toBeVisible();
  });

  it('con una ficha o una transferencia pendiente lo dice enseguida, sin esperar el aviso', () => {
    fakeCloudFor({ plan: 'free' });
    returning('?pago=pendiente&metodo=oxxo');
    expect(screen.getByText(billingCloudText.returning.pending.oxxo)).toBeVisible();
    cleanup();
    fakeCloudFor({ plan: 'free' });
    returning('?pago=pendiente&metodo=spei');
    expect(screen.getByText(billingCloudText.returning.pending.spei)).toBeVisible();
    cleanup();
    fakeCloudFor({ plan: 'free' });
    const view = returning('?pago=pendiente&metodo=otro');
    expect(view.container).toBeEmptyDOMElement();
  });

  it('cuando la nube ya tiene el pendiente deja el aviso con su monto a PendingPaymentNotice', () => {
    fakeCloudFor({ plan: 'free' });
    const view = returning('?pago=pendiente&metodo=spei', {
      userId: '01J9Z000000000000000000001',
      plan: 'free',
      status: 'none',
      isSimulated: false,
      pendingPayment: {
        method: 'spei',
        plan: 'monthly',
        amountMxn: 149,
        expiresAt: null,
        createdAt: '2026-10-14T00:00:00.000Z',
      },
      updatedAt: '2026-10-14T00:00:00.000Z',
    });
    expect(view.container).toBeEmptyDOMElement();
  });

  it('si tarda demasiado lo dice, y deja de preguntar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = fakeCloudFor({ plan: 'free' });
    returning('?pago=ok');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETURN_CHECK_MS * (RETURN_CHECKS + 2));
    });
    expect(screen.getByText(billingCloudText.returning.slow)).toBeVisible();
    const calls = state.rpcCalls.length;
    expect(calls).toBe(RETURN_CHECKS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RETURN_CHECK_MS * 5);
    });
    expect(state.rpcCalls.length).toBe(calls);
  });
});
