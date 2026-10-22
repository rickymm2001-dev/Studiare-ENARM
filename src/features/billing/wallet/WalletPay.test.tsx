// @vitest-environment jsdom
// Los botones de Apple Pay y Google Pay (B17, 6.5). Todo con un Stripe.js falso: nunca se descarga el script ni
// sale una petición a Stripe. Se prueba la sesión que se pide, cómo se arma el elemento, qué se dice con y sin
// billeteras, la confirmación, los errores, que un doble toque no confirme dos veces y que al desmontar se limpie.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetAnalytics,
  setAnalyticsConsent,
  setAnalyticsSink,
  type AnalyticsRecord,
} from '@/data/analytics/catalog';
import { billingCloudText } from '@/i18n/billingCloud';
import { walletTexts } from '@/i18n/wallet';
import type { WalletStripe } from './stripeJs';
import {
  cloudWith,
  fakeStripe,
  KEY,
  refusal,
  SECRET,
  session,
  type ConfirmResult,
  type Methods,
  type Reply,
} from './testing/fakes';
import WalletPay, { type WalletPayProps } from './WalletPay';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

function show(
  stripe: WalletStripe | null | 'falla',
  props: Partial<WalletPayProps> = {},
): { onPaid: ReturnType<typeof vi.fn>; onFailure: ReturnType<typeof vi.fn> } {
  const onPaid = vi.fn();
  const onFailure = vi.fn();
  render(
    <MemoryRouter>
      <WalletPay
        publishableKey={KEY}
        plan="founder"
        trialAvailable
        onPaid={onPaid}
        onFailure={onFailure}
        loadStripeJs={() =>
          stripe === 'falla' ? Promise.reject(new Error('sin red')) : Promise.resolve(stripe)
        }
        {...props}
      />
    </MemoryRouter>,
  );
  return { onPaid, onFailure };
}

const region = () => screen.getByRole('region', { name: walletTexts.title });

/** Pone la nube que contesta esa respuesta en el cliente de la prueba y devuelve los cuerpos que reciba */
function fakeCloud(reply: Reply): unknown[] {
  const { cloud, calls } = cloudWith(reply);
  holder.cloud = cloud;
  return calls;
}

afterEach(() => {
  cleanup();
  holder.cloud = null;
  resetAnalytics();
});

describe('preparar los botones', () => {
  it('pide la sesión wallet del plan, inicia Stripe con su secreto y monta solo Apple Pay y Google Pay', async () => {
    const calls = fakeCloud(session());
    const fake = fakeStripe();
    show(fake.stripe);
    await waitFor(() => {
      expect(fake.log.mounted).toBe(1);
    });
    expect(calls).toEqual([
      {
        plan: 'founder',
        provider: 'stripe',
        mode: 'subscription',
        expectTrial: true,
        ui: 'wallet',
      },
    ]);
    expect(fake.log.sdk).toEqual([{ clientSecret: SECRET }]);
    expect(fake.log.elementOptions).toEqual([
      {
        buttonHeight: 44,
        buttonTheme: { applePay: 'black', googlePay: 'black' },
        buttonType: { applePay: 'subscribe', googlePay: 'subscribe' },
        layout: { maxColumns: 1, overflow: 'never' },
        paymentMethodOrder: undefined,
        paymentMethods: {
          applePay: 'auto',
          googlePay: 'auto',
          link: 'never',
          paypal: 'never',
          klarna: 'never',
          amazonPay: 'never',
        },
      },
    ]);
  });

  it('con tema oscuro pide los botones para fondo oscuro', async () => {
    document.documentElement.classList.add('dark');
    try {
      fakeCloud(session());
      const fake = fakeStripe();
      show(fake.stripe);
      await waitFor(() => {
        expect(fake.log.mounted).toBe(1);
      });
      expect(fake.log.elementOptions[0]).toMatchObject({
        buttonTheme: { applePay: 'white-outline', googlePay: 'white' },
      });
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });

  it('mientras prepara lo dice, y con billeteras muestra el aviso y deja el lugar de los botones', async () => {
    fakeCloud(session());
    const fake = fakeStripe();
    show(fake.stripe);
    expect(region()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(walletTexts.preparing)).toBeVisible();
    await waitFor(() => {
      expect(region()).toHaveAttribute('aria-busy', 'false');
    });
    expect(screen.queryByText(walletTexts.preparing)).toBeNull();
    // El aviso antes de los botones remite al resumen del cobro y a los términos
    expect(screen.getByText(new RegExp(walletTexts.consentTrial.slice(0, 30)))).toBeVisible();
    expect(screen.getByRole('link', { name: billingCloudText.summary.terms })).toHaveAttribute(
      'href',
      '/terminos',
    );
    expect(screen.getByText(walletTexts.noCode)).toBeVisible();
    expect(screen.queryByText(walletTexts.noWallet)).toBeNull();
    expect(region().querySelector('[data-mounted="true"]')).not.toBeNull();
    expect(region().querySelector('[data-mounted="true"]')).toBeVisible();
  });

  it('sin prueba el aviso habla de un cobro, no de una prueba', async () => {
    fakeCloud(session(false));
    const fake = fakeStripe();
    show(fake.stripe, { trialAvailable: false, plan: 'monthly' });
    expect(
      await screen.findByText(new RegExp(walletTexts.consentCharge.slice(0, 30))),
    ).toBeVisible();
    expect(screen.queryByText(new RegExp(walletTexts.consentTrial.slice(0, 30)))).toBeNull();
  });

  it('Google Pay solo también cuenta como billetera', async () => {
    fakeCloud(session());
    const fake = fakeStripe({ methods: { applePay: false, googlePay: true } });
    show(fake.stripe);
    await waitFor(() => {
      expect(region()).toHaveAttribute('aria-busy', 'false');
    });
    expect(screen.queryByText(walletTexts.noWallet)).toBeNull();
  });

  it('sin ninguna billetera quita los botones y dice que se use la tarjeta', async () => {
    for (const methods of [undefined, { applePay: false, googlePay: false }] satisfies Methods[]) {
      fakeCloud(session());
      const fake = fakeStripe({ methods });
      show(fake.stripe);
      expect(await screen.findByText(walletTexts.noWallet)).toBeVisible();
      expect(screen.queryByText(walletTexts.intro)).toBeNull();
      expect(region().querySelector('[data-mounted="true"]')).not.toBeVisible();
      cleanup();
    }
  });
});

describe('cuando algo no se puede preparar', () => {
  it('si el servidor no deja abrir el pago avisa a quien lo montó y no muestra nada', async () => {
    fakeCloud(refusal({ error: 'already_subscribed' }));
    const fake = fakeStripe();
    const { onFailure } = show(fake.stripe);
    await waitFor(() => {
      expect(onFailure).toHaveBeenCalledWith({ ok: false, reason: 'already_subscribed' });
    });
    expect(screen.queryByRole('region')).toBeNull();
    expect(fake.log.sdk).toEqual([]);
  });

  it('la prueba que cambió llega como trial_mismatch con lo que dice el servidor', async () => {
    fakeCloud(refusal({ error: 'trial_mismatch', trialAvailable: false }));
    const { onFailure } = show(fakeStripe().stripe);
    await waitFor(() => {
      expect(onFailure).toHaveBeenCalledWith({
        ok: false,
        reason: 'trial_mismatch',
        trialAvailable: false,
      });
    });
  });

  it('si Stripe.js no carga dice que no están disponibles y deja la tarjeta, sin error en la consola', async () => {
    const calls = fakeCloud(session());
    const { onFailure } = show('falla');
    expect(await screen.findByText(walletTexts.unavailable)).toBeVisible();
    expect(onFailure).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    cleanup();
    show(null);
    expect(await screen.findByText(walletTexts.unavailable)).toBeVisible();
  });

  it('si las acciones del SDK fallan, o el elemento no carga, o no hay nube, dice que no están disponibles', async () => {
    fakeCloud(session());
    const broken = fakeStripe({ actionsError: true });
    show(broken.stripe);
    expect(await screen.findByText(walletTexts.unavailable)).toBeVisible();
    expect(broken.log.mounted).toBe(0);
    cleanup();

    const loadError = fakeStripe();
    show(loadError.stripe);
    await waitFor(() => {
      expect(loadError.log.mounted).toBe(1);
    });
    loadError.fire('loaderror', { elementType: 'expressCheckout', error: { type: 'api_error' } });
    expect(await screen.findByText(walletTexts.unavailable)).toBeVisible();
    cleanup();

    holder.cloud = null;
    show(fakeStripe().stripe);
    expect(await screen.findByText(walletTexts.unavailable)).toBeVisible();
  });
});

describe('pagar con la billetera', () => {
  const ready = async (fake: ReturnType<typeof fakeStripe>) => {
    await waitFor(() => {
      expect(region()).toHaveAttribute('aria-busy', 'false');
    });
    expect(fake.log.mounted).toBe(1);
  };

  it('al autorizar confirma con el evento y sin salir de la página, y avisa que se pagó', async () => {
    fakeCloud(session());
    const fake = fakeStripe();
    const { onPaid } = show(fake.stripe);
    await ready(fake);
    const paymentFailed = fake.authorize();
    await waitFor(() => {
      expect(onPaid).toHaveBeenCalledTimes(1);
    });
    expect(fake.log.confirms).toHaveLength(1);
    expect(fake.log.confirms[0]).toMatchObject({ redirect: 'if_required' });
    expect(fake.log.confirms[0]).toHaveProperty('expressCheckoutConfirmEvent.paymentFailed');
    expect(paymentFailed).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mientras confirma lo dice, y un segundo toque no confirma otra vez', async () => {
    fakeCloud(session());
    let finish: (value: ConfirmResult) => void = () => undefined;
    const slow = () =>
      new Promise<ConfirmResult>((resolve) => {
        finish = resolve;
      });
    const fake = fakeStripe({ confirm: [slow] });
    const { onPaid } = show(fake.stripe);
    await ready(fake);
    fake.authorize();
    expect(await screen.findByText(walletTexts.confirming)).toBeVisible();
    expect(region()).toHaveAttribute('aria-busy', 'true');
    fake.authorize();
    fake.authorize();
    expect(fake.log.confirms).toHaveLength(1);
    expect(onPaid).not.toHaveBeenCalled();
    await act(async () => {
      finish({ type: 'success' });
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(onPaid).toHaveBeenCalledTimes(1);
    });
  });

  it('un pago rechazado cierra la hoja con error, lo dice con el foco y deja intentar otra vez', async () => {
    fakeCloud(session());
    const fake = fakeStripe({
      confirm: [
        () =>
          Promise.resolve({
            type: 'error',
            error: { message: 'Your card was declined.', code: 'paymentFailed' },
          }),
        () => Promise.resolve({ type: 'success' }),
      ],
    });
    const { onPaid } = show(fake.stripe);
    await ready(fake);
    const paymentFailed = fake.authorize();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(walletTexts.errors.declined);
    expect(alert).toHaveFocus();
    // El mensaje en crudo de Stripe no se muestra
    expect(document.body).not.toHaveTextContent('Your card was declined');
    expect(paymentFailed).toHaveBeenCalledWith({ reason: 'fail' });
    expect(onPaid).not.toHaveBeenCalled();
    expect(screen.queryByText(walletTexts.confirming)).toBeNull();

    // Reintenta, y el aviso del error se va
    fake.authorize();
    await waitFor(() => {
      expect(onPaid).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('otro error de Stripe tiene su texto y una excepción pide revisar el plan antes de reintentar', async () => {
    fakeCloud(session());
    const failed = fakeStripe({
      confirm: [() => Promise.resolve({ type: 'error', error: { message: 'raro', code: null } })],
    });
    show(failed.stripe);
    await ready(failed);
    failed.authorize();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(walletTexts.errors.failed);
    // Con un error que no es el rechazo no se asegura que no se cobró nada
    expect(alert).not.toHaveTextContent(/no se cobr/i);
    expect(alert).toHaveTextContent('Revisa tu plan');
    cleanup();

    const thrown = fakeStripe({ confirm: [() => Promise.reject(new Error('sin red'))] });
    const { onPaid } = show(thrown.stripe);
    await ready(thrown);
    const paymentFailed = thrown.authorize();
    expect(await screen.findByRole('alert')).toHaveTextContent(walletTexts.errors.unknown);
    expect(paymentFailed).toHaveBeenCalledWith({ reason: 'fail' });
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('cancelar la hoja no hace nada raro', async () => {
    fakeCloud(session());
    const fake = fakeStripe();
    const { onPaid, onFailure } = show(fake.stripe);
    await ready(fake);
    fake.fire('cancel', { elementType: 'expressCheckout' });
    expect(onPaid).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
    // Y se puede pagar después
    fake.authorize();
    await waitFor(() => {
      expect(onPaid).toHaveBeenCalledTimes(1);
    });
  });

  it('el embudo se mide al autorizar el pago y no al preparar, solo plan, tarjeta y prueba', async () => {
    const seen: AnalyticsRecord[] = [];
    setAnalyticsSink((record) => seen.push(record));
    setAnalyticsConsent(true);
    fakeCloud(session());
    const fake = fakeStripe();
    show(fake.stripe);
    await ready(fake);
    expect(seen).toEqual([]);
    fake.authorize();
    await waitFor(() => {
      expect(seen).toHaveLength(1);
    });
    expect(seen[0]?.event).toBe('checkout_started');
    expect(seen[0]?.properties).toEqual({ plan: 'founder', method: 'card', with_trial: true });
  });
});

describe('limpieza', () => {
  it('al quitarse destruye el elemento y no avisa nada de lo que llegue tarde', async () => {
    fakeCloud(session());
    const fake = fakeStripe();
    const { onPaid, onFailure } = show(fake.stripe);
    await waitFor(() => {
      expect(fake.log.mounted).toBe(1);
    });
    cleanup();
    expect(fake.log.destroyed).toBe(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('si se quita antes de que llegue la sesión no monta nada', async () => {
    let answer: (reply: Reply) => void = () => undefined;
    holder.cloud = {
      functions: {
        invoke: () =>
          new Promise<Reply>((resolve) => {
            answer = resolve;
          }),
      },
    };
    const fake = fakeStripe();
    show(fake.stripe);
    await waitFor(() => {
      expect(region()).toBeVisible();
    });
    cleanup();
    await act(async () => {
      answer(session());
      await Promise.resolve();
    });
    expect(fake.log.sdk).toEqual([]);
    expect(fake.log.mounted).toBe(0);
  });
});
