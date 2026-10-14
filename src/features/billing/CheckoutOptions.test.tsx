// @vitest-environment jsdom
// Forma de pago con la nube (B10, 3.1.2). Cada opción según las banderas, el aviso con la fecha de fin
// de la prueba y lo que se cobra, el texto de Apple Pay y Google Pay, lo que se manda al servidor y
// cada error de create-checkout.
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLANS } from '@/config/billing';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { CheckoutOptions } from './CheckoutOptions';
import { paymentOptionsFor, type PaymentFlags } from './paymentOptions';
import { longDate } from './planState';

const holder = vi.hoisted((): { cloud: unknown } => ({ cloud: null }));
vi.mock('@/data/cloud/client', () => ({
  getCloud: () => holder.cloud,
  cloudConfigured: () => holder.cloud !== null,
  loadCloud: () => Promise.resolve(holder.cloud),
}));

const text = billingCloudText;
const NOW = new Date('2026-10-14T15:00:00.000Z');
const TRIAL_END = longDate('2026-10-21T15:00:00.000Z');
const ALL: PaymentFlags = { cashPasses: true, mercadoPago: true, testMode: true };
const CARD_ONLY: PaymentFlags = { cashPasses: false, mercadoPago: false, testMode: false };

interface Reply {
  data: unknown;
  error: unknown;
}
const ok = (url = 'https://checkout.stripe.com/c/pay/cs_1'): Reply => ({
  data: { url, mode: 'subscription', trial: true },
  error: null,
});
const failure = (body: unknown, status = 409): Reply => ({
  data: null,
  error: { context: new Response(JSON.stringify(body), { status }) },
});

function fakeCloud(replies: Reply[]) {
  const calls: unknown[] = [];
  holder.cloud = {
    functions: {
      invoke: (_name: string, init: { body: unknown }) => {
        calls.push(init.body);
        return Promise.resolve(replies[Math.min(calls.length - 1, replies.length - 1)]);
      },
    },
  };
  return calls;
}

function show(props: Partial<Parameters<typeof CheckoutOptions>[0]> = {}) {
  const open = vi.fn();
  const onBack = vi.fn();
  const onTrialMismatch = vi.fn();
  render(
    <MemoryRouter>
      <CheckoutOptions
        plan="monthly"
        chargedPlan="founder"
        trialAvailable
        flags={ALL}
        open={open}
        onBack={onBack}
        onTrialMismatch={onTrialMismatch}
        now={() => NOW}
        {...props}
      />
    </MemoryRouter>,
  );
  return { open, onBack, onTrialMismatch };
}

const radio = (label: string) => screen.getByRole('radio', { name: new RegExp(label) });

afterEach(() => {
  cleanup();
  holder.cloud = null;
});

describe('formas de pago según las banderas (3.5)', () => {
  it('con las banderas apagadas solo hay tarjeta, Apple Pay o Google Pay', () => {
    expect(paymentOptionsFor(CARD_ONLY, false)).toEqual(['card']);
    expect(paymentOptionsFor({ ...CARD_ONLY, cashPasses: true }, false)).toEqual([
      'card',
      'oxxo',
      'spei',
    ]);
    expect(paymentOptionsFor(ALL, false)).toEqual([
      'card',
      'oxxo',
      'spei',
      'mercadopago',
      'mercadopago_pass',
    ]);
    // Sumar otro periodo a un pase solo ofrece pases
    expect(paymentOptionsFor(ALL, true)).toEqual(['oxxo', 'spei', 'mercadopago_pass']);
    expect(paymentOptionsFor(CARD_ONLY, true)).toEqual([]);
  });

  it('el título dice el plan y cada opción su precio y su condición', () => {
    show();
    expect(
      screen.getByRole('heading', { name: text.checkoutTitle(t.billing.plans.monthly) }),
    ).toBeVisible();
    expect(radio(text.options.card.label)).toHaveTextContent(
      text.options.card.trial(t.billing.price(79), t.billing.periods.monthly),
    );
    expect(radio(text.options.oxxo.label)).toHaveTextContent(
      text.options.oxxo.description('1 mes', t.billing.price(149)),
    );
    expect(radio(text.options.spei.label)).toHaveTextContent(
      text.options.spei.description('1 mes', t.billing.price(149)),
    );
    // Mercado Pago sin Fundador ni prueba (8.3)
    expect(radio(text.options.mercadopago.label)).toHaveTextContent(
      text.options.mercadopago.description(t.billing.price(149), 'al mes'),
    );
    expect(screen.getByText(text.testMode)).toBeVisible();
  });

  it('sin la bandera de modo prueba no sale su aviso', () => {
    show({ flags: CARD_ONLY });
    expect(screen.queryByText(text.testMode)).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
  });
});

describe('aviso antes de pagar (4.18)', () => {
  it('con prueba dice que hoy no se cobra, la fecha de fin, el cobro, la garantía y el código', () => {
    show();
    expect(
      screen.getByText(text.summary.trial(TRIAL_END, t.billing.price(79), 'mes')),
    ).toBeVisible();
    expect(screen.getByText(new RegExp(text.summary.code.replace('?', '\\?')))).toBeVisible();
    expect(screen.getByRole('link', { name: text.summary.terms })).toHaveAttribute(
      'href',
      '/terminos',
    );
    expect(screen.getByRole('button', { name: text.actions.trial })).toBeVisible();
  });

  it('sin prueba dice que hoy se cobra y que ya usó su prueba', () => {
    show({ trialAvailable: false, plan: 'annual', chargedPlan: 'founder_annual' });
    expect(radio(text.options.card.label)).toHaveTextContent(
      text.options.card.noTrial(t.billing.price(749), t.billing.periods.annual),
    );
    expect(screen.getByText(text.summary.charge(t.billing.price(749), 'año'))).toBeVisible();
    expect(screen.getByRole('button', { name: text.go })).toBeVisible();
  });

  it('con OXXO dice que es un pago único, que suma al pase vigente y cómo se devuelve la garantía', async () => {
    const typing = userEvent.setup();
    show({ passEnd: '2026-11-20T15:00:00.000Z' });
    await typing.click(radio(text.options.oxxo.label));
    expect(
      screen.getByText(
        [
          text.summary.pass,
          text.summary.passAdds(longDate('2026-11-20T15:00:00.000Z')),
          text.summary.oxxoRefund,
        ].join(' '),
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: text.actions.oxxo })).toBeVisible();
    await typing.click(radio(text.options.spei.label));
    expect(screen.getByRole('button', { name: text.actions.spei })).toBeVisible();
  });

  it('con Mercado Pago no menciona códigos de descuento', async () => {
    const typing = userEvent.setup();
    show();
    await typing.click(radio(text.options.mercadopago_pass.label));
    expect(screen.queryByText(new RegExp(text.summary.code.replace('?', '\\?')))).toBeNull();
    expect(screen.getByRole('button', { name: text.actions.mercadopago })).toBeVisible();
  });
});

describe('ir a pagar', () => {
  it('con tarjeta manda el plan Fundador y la prueba que se avisó, y abre Stripe', async () => {
    const calls = fakeCloud([ok()]);
    const typing = userEvent.setup();
    const { open } = show();
    await typing.click(screen.getByRole('button', { name: text.actions.trial }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1');
    });
    expect(calls).toEqual([
      { plan: 'founder', provider: 'stripe', mode: 'subscription', expectTrial: true },
    ]);
  });

  it('con SPEI y Mercado Pago manda el plan regular', async () => {
    const choices = [
      [text.options.spei.label, text.actions.spei, 'https://checkout.stripe.com/c/pay/cs_2'],
      [
        text.options.mercadopago.label,
        text.actions.mercadopago,
        'https://www.mercadopago.com.mx/subscriptions/checkout?preapproval_id=1',
      ],
    ] as const;
    const sent: unknown[] = [];
    for (const [label, action, url] of choices) {
      const calls = fakeCloud([ok(url)]);
      const typing = userEvent.setup();
      const { open } = show();
      await typing.click(radio(label));
      await typing.click(screen.getByRole('button', { name: action }));
      await waitFor(() => {
        expect(open).toHaveBeenCalledWith(url);
      });
      sent.push(...calls);
      cleanup();
    }
    expect(sent).toEqual([
      { plan: 'monthly', provider: 'stripe', mode: 'pass', method: 'spei', expectTrial: false },
      { plan: 'monthly', provider: 'mercadopago', mode: 'subscription', expectTrial: false },
    ]);
  });

  it('con el cupo Fundador lleno o perdido ofrece el precio regular y lo cobra', async () => {
    for (const code of ['founder_full', 'founder_lost'] as const) {
      const calls = fakeCloud([failure({ error: code }), ok()]);
      const typing = userEvent.setup();
      const { open } = show();
      await typing.click(screen.getByRole('button', { name: text.actions.trial }));
      expect(await screen.findByText(text.errors[code])).toBeVisible();
      await typing.click(
        screen.getByRole('button', {
          name: text.regularInstead(
            `${t.billing.price(PLANS.monthly.priceMxn)} ${t.billing.periods.monthly}`,
          ),
        }),
      );
      await waitFor(() => {
        expect(open).toHaveBeenCalledTimes(1);
      });
      expect(calls[1]).toEqual({
        plan: 'monthly',
        provider: 'stripe',
        mode: 'subscription',
        expectTrial: true,
      });
      cleanup();
    }
  });

  it('cada error de create-checkout tiene su texto y no abre la pasarela', async () => {
    const cases: [unknown, string][] = [
      [{ error: 'already_subscribed' }, text.errors.already_subscribed],
      [
        { error: 'pass_in_force', passEnd: '2026-11-20T15:00:00.000Z' },
        text.errors.pass_in_force(longDate('2026-11-20T15:00:00.000Z')),
      ],
      [{ error: 'not_configured' }, text.errors.not_configured],
      [{ error: 'provider' }, text.errors.failed],
    ];
    for (const [body, message] of cases) {
      fakeCloud([failure(body)]);
      const typing = userEvent.setup();
      const { open } = show();
      await typing.click(screen.getByRole('button', { name: text.actions.trial }));
      expect(await screen.findByText(message)).toBeVisible();
      expect(open).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('si la prueba cambió mientras elegía lo dice y pide volver a leer el plan', async () => {
    fakeCloud([failure({ error: 'trial_mismatch', trialAvailable: false })]);
    const typing = userEvent.setup();
    const { open, onTrialMismatch } = show();
    await typing.click(screen.getByRole('button', { name: text.actions.trial }));
    expect(await screen.findByText(text.errors.trial_mismatch)).toBeVisible();
    expect(onTrialMismatch).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
  });

  it('no abre una dirección que no es de la pasarela y Volver regresa a los planes', async () => {
    fakeCloud([ok('https://malo.example/pagar')]);
    const typing = userEvent.setup();
    const { open, onBack } = show();
    await typing.click(screen.getByRole('button', { name: text.actions.trial }));
    expect(await screen.findByText(text.errors.unsafe_url)).toBeVisible();
    expect(open).not.toHaveBeenCalled();
    await typing.click(screen.getByRole('button', { name: text.back }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
