// Mercado Pago simulado de las e2e de nube (B10 del plan del cambio, paso 4 del paquete C). Sirve en el
// dominio que la app acepta para Mercado Pago (FAKE_MERCADOPAGO_ORIGIN) la página donde el alumno
// autoriza su suscripción y la del pago único, con la etiqueta de simulado a la vista. Cada botón arma
// el recurso como lo devolvería la API de Mercado Pago (preapproval, authorized_payment o payment) y lo
// pasa por las mismas funciones del aviso real (supabase/functions/_shared/mercadopago.ts) antes de
// aplicarlo con FakeBilling. Así la prueba recorre la referencia, el estado y el monto que lee el aviso
// de verdad, sin firma ni red.
import type { Request } from '@playwright/test';
import {
  PASS_PRICES_MXN,
  PLAN_PRICES_MXN,
  type PassPlan,
} from '../../../supabase/functions/_shared/billingTypes.ts';
import {
  chargeNoticeFromAuthorizedPayment,
  chargeNoticeFromPayment,
  externalReferenceFor,
  subscriptionNoticeFromPreapproval,
} from '../../../supabase/functions/_shared/mercadopago.ts';
import type { FakeBilling, FakeCheckout, FakeReply } from './fakeBilling';
import { htmlDocument } from './fakeGateway';

export const MERCADOPAGO_AUTHORIZE_PATH = '/fake/mp/autorizar';
export const MERCADOPAGO_PAY_PATH = '/fake/mp/pagar';
export const MERCADOPAGO_CANCEL_PATH = '/fake/mp/cancelar';

/** Textos de las páginas simuladas. Viven aquí porque no son parte de la app */
export const mercadoPagoText = {
  simulated: 'Mercado Pago simulado. No se cobra dinero real.',
  subscriptionTitle: 'Suscribirte con Mercado Pago',
  subscriptionSummary: (price: string, every: string) =>
    `Studiare te cobrará ${price} cada ${every} hasta que canceles.`,
  authorize: 'Autorizar suscripción',
  passTitle: 'Pagar con Mercado Pago',
  passSummary: (price: string) => `Pago único de ${price} a Studiare.`,
  pay: 'Pagar',
  payCash: 'Pagar en efectivo',
  cancel: 'Cancelar y volver',
} as const;

const DAY_MS = 86_400_000;
let serial = 9_100_000_000;
/** Un id de pago de Mercado Pago, que son números */
const nextPaymentId = () => (serial += 1);

const html = (body: string): FakeReply => ({
  status: 200,
  body,
  contentType: 'text/html; charset=utf-8',
});
const redirect = (location: string): FakeReply => ({ status: 303, headers: { location } });
const notFound = (what: string): FakeReply => ({
  status: 404,
  body: what,
  contentType: 'text/plain',
});

const regularOf = (checkout: FakeCheckout): PassPlan =>
  checkout.plan === 'annual' || checkout.plan === 'founder_annual' ? 'annual' : 'monthly';
const pesos = (amount: number) => `$${amount.toLocaleString('es-MX')} MXN`;

function formField(request: Request, name: string): string | null {
  return new URLSearchParams(request.postData() ?? '').get(name);
}

function subscriptionPage(checkout: FakeCheckout): string {
  const plan = regularOf(checkout);
  return htmlDocument(
    mercadoPagoText.subscriptionTitle,
    `<p class="badge">${mercadoPagoText.simulated}</p>
<h1>${mercadoPagoText.subscriptionTitle}</h1>
<p>${mercadoPagoText.subscriptionSummary(pesos(PLAN_PRICES_MXN[plan]), plan === 'annual' ? 'año' : 'mes')}</p>
<form method="post" action="${MERCADOPAGO_AUTHORIZE_PATH}">
  <input type="hidden" name="checkout" value="${checkout.id}" />
  <button type="submit" class="primary">${mercadoPagoText.authorize}</button>
</form>
<form method="post" action="${MERCADOPAGO_CANCEL_PATH}">
  <input type="hidden" name="checkout" value="${checkout.id}" />
  <button type="submit">${mercadoPagoText.cancel}</button>
</form>`,
  );
}

function passPage(checkout: FakeCheckout): string {
  return htmlDocument(
    mercadoPagoText.passTitle,
    `<p class="badge">${mercadoPagoText.simulated}</p>
<h1>${mercadoPagoText.passTitle}</h1>
<p>${mercadoPagoText.passSummary(pesos(PASS_PRICES_MXN[regularOf(checkout)]))}</p>
<form method="post" action="${MERCADOPAGO_PAY_PATH}">
  <input type="hidden" name="checkout" value="${checkout.id}" />
  <input type="hidden" name="outcome" value="approved" />
  <button type="submit" class="primary">${mercadoPagoText.pay}</button>
</form>
<form method="post" action="${MERCADOPAGO_PAY_PATH}">
  <input type="hidden" name="checkout" value="${checkout.id}" />
  <input type="hidden" name="outcome" value="pending" />
  <button type="submit">${mercadoPagoText.payCash}</button>
</form>
<form method="post" action="${MERCADOPAGO_CANCEL_PATH}">
  <input type="hidden" name="checkout" value="${checkout.id}" />
  <button type="submit">${mercadoPagoText.cancel}</button>
</form>`,
  );
}

/**
 * El alumno autoriza la suscripción. Llegan los avisos subscription_preapproval con authorized y
 * subscription_authorized_payment con el primer cobro aprobado, que es el que da el plan
 */
function authorize(checkout: FakeCheckout, billing: FakeBilling): void {
  const plan = regularOf(checkout);
  const now = new Date(billing.now()).toISOString();
  const reference = externalReferenceFor(checkout.userId, plan, 'subscription');
  const state = subscriptionNoticeFromPreapproval(
    {
      id: checkout.id,
      status: 'authorized',
      external_reference: reference,
      reason: plan === 'annual' ? 'Studiare. Plan anual' : 'Studiare. Plan mensual',
      last_modified: now,
      auto_recurring: {
        frequency: plan === 'annual' ? 12 : 1,
        frequency_type: 'months',
        transaction_amount: PLAN_PRICES_MXN[plan],
        currency_id: 'MXN',
      },
    },
    billing.now(),
  );
  if (!state) throw new Error('El preapproval simulado no se pudo leer como aviso');
  billing.applySubscriptionState(state);
  const charge = chargeNoticeFromAuthorizedPayment({
    id: nextPaymentId(),
    preapproval_id: checkout.id,
    external_reference: reference,
    transaction_amount: PLAN_PRICES_MXN[plan],
    currency_id: 'MXN',
    debit_date: now,
    payment: { id: nextPaymentId(), status: 'approved' },
  });
  if (!charge) throw new Error('El cobro simulado de la suscripción no se pudo leer como aviso');
  billing.applyCharge(charge);
  checkout.status = 'paid';
}

/** El pago único. Aprobado da el pase y en efectivo queda pendiente, como una ficha */
function pay(
  checkout: FakeCheckout,
  outcome: 'approved' | 'pending',
  billing: FakeBilling,
): string {
  const plan = regularOf(checkout);
  const now = billing.now();
  const notice = chargeNoticeFromPayment({
    id: nextPaymentId(),
    status: outcome,
    payment_type_id: outcome === 'approved' ? 'credit_card' : 'ticket',
    external_reference: externalReferenceFor(checkout.userId, plan, 'pass'),
    transaction_amount: PASS_PRICES_MXN[plan],
    currency_id: 'MXN',
    date_created: new Date(now).toISOString(),
    ...(outcome === 'approved'
      ? { date_approved: new Date(now).toISOString() }
      : { date_of_expiration: new Date(now + 3 * DAY_MS).toISOString() }),
  });
  if (!notice) throw new Error('El pago simulado de Mercado Pago no se pudo leer como aviso');
  billing.applyCharge(notice);
  checkout.status = outcome === 'approved' ? 'paid' : 'pending';
  return outcome === 'approved'
    ? checkout.successUrl
    : (checkout.pendingUrl ?? checkout.successUrl);
}

/**
 * Atiende el dominio de Mercado Pago simulado. Lo registra fakeSupabase.ts en attach, con el mismo
 * FakeBilling del resto de los pagos
 */
export function handleMercadoPagoRequest(
  request: Request,
  url: URL,
  billing: FakeBilling,
): FakeReply {
  if (request.method() === 'GET') {
    const id = url.searchParams.get('preapproval_id') ?? url.searchParams.get('pref_id') ?? '';
    const checkout = billing.checkoutOf(id);
    if (checkout?.provider !== 'mercadopago') return notFound('Pago de Mercado Pago desconocido');
    if (url.pathname === '/subscriptions/checkout' && checkout.mode === 'subscription') {
      return html(subscriptionPage(checkout));
    }
    if (url.pathname === '/checkout/v1/redirect' && checkout.mode === 'pass') {
      return html(passPage(checkout));
    }
    return notFound('Página de Mercado Pago sin simular');
  }
  if (request.method() !== 'POST') return notFound('Página de Mercado Pago sin simular');
  const checkout = billing.checkoutOf(formField(request, 'checkout') ?? '');
  if (checkout?.provider !== 'mercadopago') return notFound('Pago de Mercado Pago desconocido');
  switch (url.pathname) {
    case MERCADOPAGO_AUTHORIZE_PATH:
      if (checkout.status === 'open') authorize(checkout, billing);
      return redirect(checkout.successUrl);
    case MERCADOPAGO_PAY_PATH: {
      if (checkout.status !== 'open') return redirect(checkout.successUrl);
      const outcome = formField(request, 'outcome') === 'pending' ? 'pending' : 'approved';
      return redirect(pay(checkout, outcome, billing));
    }
    case MERCADOPAGO_CANCEL_PATH:
      return redirect(billing.cancelCheckout(checkout.id));
    default:
      return notFound('Página de Mercado Pago sin simular');
  }
}
