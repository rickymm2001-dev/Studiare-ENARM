// @vitest-environment jsdom
// Estado del plan con la nube (B10, 3.1.3). Cada estado de my_plan v2 tiene su línea, en Suscripción y
// en Perfil, más el cambio programado, la garantía, los avisos y el pago pendiente.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { Subscription } from '@/data/schemas/people';
import { PlanCard } from '@/features/profile/PlanCard';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { PendingPaymentNotice } from './PendingPaymentNotice';
import { pendingPaymentText } from './planLines';
import { PlanStatus } from './PlanStatus';
import { liveProviderOf, longDate, planStateOf } from './planState';

const END = '2026-11-14T15:00:00.000Z';
const TRIAL_END = '2026-10-21T15:00:00.000Z';
const status = billingCloudText.status;
const profile = t.settingsPage.plan;

const sub = (patch: Partial<Subscription> = {}): Subscription => ({
  userId: '01J9Z000000000000000000001',
  plan: 'founder',
  status: 'active',
  isSimulated: false,
  periodEnd: END,
  source: 'payment',
  cloudStatus: 'active',
  provider: 'stripe',
  updatedAt: '2026-10-14T00:00:00.000Z',
  ...patch,
});

afterEach(cleanup);

describe('qué estado tiene el plan', () => {
  it('clasifica cada estado de la nube y deja fuera Gratis y el pago simulado', () => {
    expect(planStateOf(null)).toBeNull();
    expect(planStateOf(sub({ plan: 'free', status: 'none' }))).toBeNull();
    expect(planStateOf(sub({ isSimulated: true }))).toBeNull();
    expect(
      planStateOf(sub({ cloudStatus: 'trialing', trialEnd: TRIAL_END, periodEnd: TRIAL_END })),
    ).toEqual({ kind: 'trialing', end: TRIAL_END, plan: 'founder' });
    expect(
      planStateOf(sub({ cloudStatus: 'trialing', trialEnd: TRIAL_END, cancelAtPeriodEnd: true })),
    ).toEqual({ kind: 'trialCanceled', end: TRIAL_END });
    expect(planStateOf(sub())).toEqual({ kind: 'renews', date: END, plan: 'founder' });
    expect(planStateOf(sub({ cancelAtPeriodEnd: true }))).toEqual({ kind: 'canceled', until: END });
    expect(planStateOf(sub({ cloudStatus: 'canceled' }))).toEqual({ kind: 'canceled', until: END });
    expect(planStateOf(sub({ cloudStatus: 'past_due', provider: 'mercadopago' }))).toEqual({
      kind: 'pastDue',
      provider: 'mercadopago',
    });
    expect(
      planStateOf(sub({ plan: 'monthly', source: 'pass', passEnd: END, cloudStatus: undefined })),
    ).toEqual({ kind: 'pass', until: END });
    expect(planStateOf(sub({ plan: 'monthly', source: 'referral' }))).toEqual({
      kind: 'referral',
      until: END,
    });
    // Un servidor de antes de B10 no manda el estado
    expect(planStateOf(sub({ cloudStatus: undefined }))).toEqual({ kind: 'paidUntil', until: END });
  });

  it('solo una suscripción pagada vigente tiene pasarela que administrar', () => {
    expect(liveProviderOf(sub())).toBe('stripe');
    expect(liveProviderOf(sub({ provider: 'mercadopago' }))).toBe('mercadopago');
    expect(liveProviderOf(sub({ provider: undefined }))).toBe('stripe');
    expect(liveProviderOf(sub({ source: 'pass' }))).toBeNull();
    expect(liveProviderOf(sub({ source: 'referral' }))).toBeNull();
    expect(liveProviderOf(sub({ plan: 'free', status: 'none' }))).toBeNull();
  });
});

describe('PlanStatus en Suscripción', () => {
  const lineFor = (subscription: Subscription) => {
    render(<PlanStatus subscription={subscription} supportEmail="ayuda@studiare.mx" />);
  };

  it('la prueba dice hasta cuándo y cuánto se cobra ese día', () => {
    lineFor(sub({ cloudStatus: 'trialing', trialEnd: TRIAL_END, periodEnd: TRIAL_END }));
    expect(
      screen.getByText(status.trialing(longDate(TRIAL_END), t.billing.price(79))),
    ).toBeVisible();
  });

  it('la prueba cancelada dice que termina sin cobro', () => {
    lineFor(sub({ cloudStatus: 'trialing', trialEnd: TRIAL_END, cancelAtPeriodEnd: true }));
    expect(screen.getByText(status.trialCanceled(longDate(TRIAL_END)))).toBeVisible();
  });

  it('activa dice cuándo se renueva y por cuánto, con el cambio programado y la garantía', () => {
    lineFor(
      sub({
        plan: 'founder_annual',
        scheduledChange: true,
        guaranteeUntil: '2026-10-21T00:00:00.000Z',
      }),
    );
    expect(screen.getByText(status.renews(longDate(END), t.billing.price(749)))).toBeVisible();
    expect(screen.getByText(status.scheduled(longDate(END)))).toBeVisible();
    expect(
      screen.getByText(status.guarantee(longDate('2026-10-21T00:00:00.000Z'), 'ayuda@studiare.mx')),
    ).toBeVisible();
  });

  it('sin correo de ayuda la garantía dice que escriba al equipo', () => {
    render(
      <PlanStatus
        subscription={sub({ guaranteeUntil: '2026-10-21T00:00:00.000Z' })}
        supportEmail={null}
      />,
    );
    expect(
      screen.getByText(status.guaranteeNoEmail(longDate('2026-10-21T00:00:00.000Z'))),
    ).toBeVisible();
  });

  it('cancelada, con cobro fallido, pase y mes regalado tienen su línea', () => {
    lineFor(sub({ cancelAtPeriodEnd: true }));
    expect(screen.getByText(status.canceled(longDate(END)))).toBeVisible();
    cleanup();
    lineFor(sub({ cloudStatus: 'past_due' }));
    expect(screen.getByText(status.pastDue)).toBeVisible();
    cleanup();
    lineFor(sub({ cloudStatus: 'past_due', provider: 'mercadopago' }));
    expect(screen.getByText(status.pastDueMercadoPago)).toBeVisible();
    cleanup();
    lineFor(sub({ plan: 'annual', source: 'pass', passEnd: END }));
    expect(screen.getByText(status.pass(longDate(END)))).toBeVisible();
    cleanup();
    lineFor(sub({ plan: 'monthly', source: 'referral' }));
    expect(screen.getByText(status.referral(longDate(END)))).toBeVisible();
  });

  it('un pago cancelado por el servidor se anuncia, aunque el plan sea Gratis', () => {
    for (const issue of ['founder_full', 'trial_duplicate', 'second_subscription'] as const) {
      lineFor(sub({ plan: 'free', status: 'none', issue }));
      expect(screen.getByRole('status')).toHaveTextContent(status.issues[issue]);
      cleanup();
    }
  });

  it('Gratis sin avisos no muestra nada', () => {
    const view = render(<PlanStatus subscription={sub({ plan: 'free', status: 'none' })} />);
    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('pago pendiente', () => {
  const pending = (method: 'oxxo' | 'spei' | 'mercadopago', expiresAt: string | null = null) =>
    sub({
      plan: 'free',
      status: 'none',
      pendingPayment: {
        method,
        plan: 'monthly',
        amountMxn: 149,
        expiresAt,
        createdAt: '2026-10-14T00:00:00.000Z',
      },
    });

  it('dice la ficha OXXO con su monto y su vencimiento, la transferencia SPEI y Mercado Pago', () => {
    const pendingText = billingCloudText.pending;
    expect(pendingPaymentText(pending('oxxo', END))).toBe(
      pendingText.oxxoUntil(t.billing.price(149), longDate(END)),
    );
    expect(pendingPaymentText(pending('oxxo'))).toBe(pendingText.oxxo(t.billing.price(149)));
    expect(pendingPaymentText(pending('spei'))).toBe(pendingText.spei(t.billing.price(149)));
    expect(pendingPaymentText(pending('mercadopago'))).toBe(pendingText.mercadopago);
    expect(pendingPaymentText(sub({ issue: 'voucher_expired' }))).toBe(pendingText.voucherExpired);
    expect(pendingPaymentText(sub())).toBeNull();
  });

  it('se anuncia como estado', () => {
    render(<PendingPaymentNotice subscription={pending('spei')} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      billingCloudText.pending.spei(t.billing.price(149)),
    );
  });
});

describe('Tu plan en Perfil', () => {
  const card = (subscription: Subscription | null) =>
    render(
      <MemoryRouter>
        <PlanCard subscription={subscription} />
      </MemoryRouter>,
    );

  it('con la prueba dice hasta cuándo y que ese día se cobra salvo que cancele', () => {
    card(sub({ cloudStatus: 'trialing', trialEnd: TRIAL_END, periodEnd: TRIAL_END }));
    expect(screen.getByText(t.billing.plans.founder)).toBeVisible();
    expect(
      screen.getByText(profile.trialing(longDate(TRIAL_END), t.billing.price(79))),
    ).toBeVisible();
  });

  it('con un pase, una cancelación, un cobro fallido o un mes regalado dice su línea', () => {
    card(sub({ plan: 'monthly', source: 'pass', passEnd: END }));
    expect(screen.getByText(profile.pass(longDate(END)))).toBeVisible();
    cleanup();
    card(sub({ cancelAtPeriodEnd: true }));
    expect(screen.getByText(profile.canceled(longDate(END)))).toBeVisible();
    cleanup();
    card(sub({ cloudStatus: 'past_due' }));
    expect(screen.getByText(profile.pastDue)).toBeVisible();
    cleanup();
    card(sub({ plan: 'monthly', source: 'referral' }));
    expect(screen.getByText(profile.referralUntil(longDate(END)))).toBeVisible();
    cleanup();
    card(sub({ plan: 'founder_annual' }));
    expect(screen.getByText(t.billing.plans.founder_annual)).toBeVisible();
    expect(screen.getByText(profile.renews(longDate(END), t.billing.price(749)))).toBeVisible();
  });

  it('el pago simulado lo dice y Gratis no tiene línea de estado', () => {
    card(sub({ isSimulated: true, periodEnd: null }));
    expect(screen.getByText(profile.simulated)).toBeVisible();
    cleanup();
    card(null);
    expect(screen.getByText(t.billing.plans.free)).toBeVisible();
    expect(screen.queryByText(/hasta el/)).toBeNull();
  });
});
