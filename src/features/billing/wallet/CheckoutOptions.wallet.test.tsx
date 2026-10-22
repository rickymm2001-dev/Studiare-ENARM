// @vitest-environment jsdom
// Los botones de Apple Pay y Google Pay dentro de la forma de pago (B17, 6.5). Cuándo aparecen (bandera, llave y
// Tarjeta elegida), que el aviso del cobro va antes de los botones, que cambiar de forma de pago los quita, y qué pasa
// al pagar o cuando el servidor no deja abrir el pago. Stripe.js es un doble, no se descarga nada.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { walletTexts } from '@/i18n/wallet';
import { CheckoutOptions } from '../CheckoutOptions';
import type { PaymentFlags } from '../paymentOptions';
import type { WalletStripe } from './stripeJs';
import { cloudWith, fakeStripe, KEY, refusal, session, type Reply } from './testing/fakes';
import type { WalletSetup } from './walletSetup';

const holder = vi.hoisted((): { cloud: unknown; stripe: unknown; loads: number } => ({
  cloud: null,
  stripe: null,
  loads: 0,
}));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));
vi.mock('./stripeJs', () => ({
  loadWalletStripe: () => {
    holder.loads += 1;
    return Promise.resolve(holder.stripe);
  },
}));

const text = billingCloudText;
const NOW = new Date('2026-10-14T15:00:00.000Z');
const ALL: PaymentFlags = { cashPasses: true, mercadoPago: true, testMode: false };
const WALLETS: WalletSetup = { publishableKey: KEY };

function Where() {
  const location = useLocation();
  return <p data-testid="donde">{`${location.pathname}${location.search}`}</p>;
}

function show(
  reply: Reply,
  props: Partial<Parameters<typeof CheckoutOptions>[0]> = {},
  fake = fakeStripe(),
) {
  const { cloud, calls } = cloudWith(reply);
  holder.cloud = cloud;
  holder.stripe = fake.stripe satisfies WalletStripe;
  const onBack = vi.fn();
  const onTrialMismatch = vi.fn();
  render(
    <MemoryRouter initialEntries={['/elegir']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <CheckoutOptions
                plan="monthly"
                chargedPlan="founder"
                trialAvailable
                flags={ALL}
                wallets={WALLETS}
                open={vi.fn()}
                onBack={onBack}
                onTrialMismatch={onTrialMismatch}
                now={() => NOW}
                {...props}
              />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { calls, fake, onBack, onTrialMismatch };
}

const radio = (label: string) => screen.getByRole('radio', { name: new RegExp(label) });

afterEach(() => {
  cleanup();
  holder.cloud = null;
  holder.stripe = null;
  holder.loads = 0;
});

describe('cuándo aparecen los botones', () => {
  it('sin la bandera o sin la llave, que es lo de hoy, no hay sección ni se pide nada a Stripe', async () => {
    for (const wallets of [null, undefined]) {
      const { calls } = show(session(), { wallets });
      expect(screen.queryByRole('region', { name: walletTexts.title })).toBeNull();
      await screen.findByRole('button', { name: text.actions.trial });
      expect(calls).toEqual([]);
      expect(holder.loads).toBe(0);
      cleanup();
    }
  });

  it('con la bandera y la llave, y Tarjeta elegida, aparecen debajo del resumen y piden la sesión wallet', async () => {
    const { calls, fake } = show(session());
    const region = await screen.findByRole('region', { name: walletTexts.title });
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
    expect(holder.loads).toBe(1);
    // El aviso del cobro automático (el resumen) está en pantalla antes de los botones, y la tarjeta sigue ahí
    const summary = screen.getByText(
      text.summary.trial(
        new Date(NOW.getTime() + 7 * 86_400_000).toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        t.billing.price(79),
        'mes',
      ),
    );
    expect(summary).toBeVisible();
    expect(summary.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: text.actions.trial })).toBeVisible();
  });

  it('cambiar a otra forma de pago los quita, y volver a Tarjeta pide otra sesión', async () => {
    const typing = userEvent.setup();
    const { calls, fake } = show(session());
    await screen.findByRole('region', { name: walletTexts.title });
    await typing.click(radio(text.options.oxxo.label));
    expect(screen.queryByRole('region', { name: walletTexts.title })).toBeNull();
    expect(fake.log.destroyed).toBe(1);
    await typing.click(radio(text.options.card.label));
    await screen.findByRole('region', { name: walletTexts.title });
    await waitFor(() => {
      expect(calls).toHaveLength(2);
    });
  });

  it('al sumar otro pase, que no tiene Tarjeta, nunca aparecen', async () => {
    const { calls } = show(session(), { passOnly: true, passEnd: '2026-11-20T15:00:00.000Z' });
    await screen.findByRole('button', { name: text.actions.oxxo });
    expect(screen.queryByRole('region', { name: walletTexts.title })).toBeNull();
    expect(calls).toEqual([]);
    expect(holder.loads).toBe(0);
  });

  it('sin prueba el plan sigue siendo el mismo y la sesión no promete prueba', async () => {
    const { calls } = show(session(false), { trialAvailable: false });
    await screen.findByRole('region', { name: walletTexts.title });
    await waitFor(() => {
      expect(calls).toEqual([
        {
          plan: 'founder',
          provider: 'stripe',
          mode: 'subscription',
          expectTrial: false,
          ui: 'wallet',
        },
      ]);
    });
  });
});

describe('pagar con la billetera desde la forma de pago', () => {
  it('al confirmarse el pago cierra la forma de pago y vuelve a Suscripción con pago ok', async () => {
    const { fake, onBack } = show(session());
    await screen.findByRole('region', { name: walletTexts.title });
    await waitFor(() => {
      expect(fake.log.mounted).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(walletTexts.preparing)).toBeNull();
    });
    fake.authorize();
    await waitFor(() => {
      expect(onBack).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('donde')).toHaveTextContent('/suscripcion?pago=ok');
    });
  });

  it('un pago rechazado deja la forma de pago abierta con el aviso y sin volver', async () => {
    const { fake, onBack } = show(
      session(),
      {},
      fakeStripe({
        confirm: [
          () =>
            Promise.resolve({
              type: 'error',
              error: { message: 'declined', code: 'paymentFailed' },
            }),
        ],
      }),
    );
    await waitFor(() => {
      expect(fake.log.mounted).toBe(1);
    });
    await waitFor(() => {
      expect(screen.queryByText(walletTexts.preparing)).toBeNull();
    });
    fake.authorize();
    expect(await screen.findByText(walletTexts.errors.declined)).toBeVisible();
    expect(onBack).not.toHaveBeenCalled();
    expect(screen.getByTestId('donde')).toHaveTextContent('/elegir');
  });
});

describe('cuando el servidor no deja abrir el pago con la billetera', () => {
  it('lo dice como la página hospedada y quita la sección', async () => {
    show(refusal({ error: 'already_subscribed' }));
    expect(await screen.findByText(text.errors.already_subscribed)).toBeVisible();
    expect(screen.queryByRole('region', { name: walletTexts.title })).toBeNull();
    expect(screen.getByRole('button', { name: text.actions.trial })).toBeVisible();
  });

  it('con la prueba que cambió pide volver a leer el plan', async () => {
    const { onTrialMismatch } = show(refusal({ error: 'trial_mismatch', trialAvailable: false }));
    expect(await screen.findByText(text.errors.trial_mismatch)).toBeVisible();
    expect(onTrialMismatch).toHaveBeenCalledTimes(1);
  });

  it('con el cupo Fundador lleno ofrece el precio regular, igual que al ir a pagar', async () => {
    show(refusal({ error: 'founder_full' }));
    expect(await screen.findByText(text.errors.founder_full)).toBeVisible();
    expect(screen.getByRole('button', { name: /precio regular/i })).toBeVisible();
    expect(screen.queryByRole('region', { name: walletTexts.title })).toBeNull();
  });

  it('con un cambio de plan pide otra sesión, porque el precio y la prueba son otros', async () => {
    const { calls } = show(session(), { chargedPlan: 'founder' });
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    cleanup();
    const annual = show(session(), { plan: 'annual', chargedPlan: 'founder_annual' });
    await waitFor(() => {
      expect(annual.calls).toEqual([
        {
          plan: 'founder_annual',
          provider: 'stripe',
          mode: 'subscription',
          expectTrial: true,
          ui: 'wallet',
        },
      ]);
    });
  });
});
