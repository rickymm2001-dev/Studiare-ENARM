// Forma de pago con la cuenta en la nube (B10 del plan del cambio, 3.1.2). Reemplaza a la tarjeta de
// antes, que solo pagaba con Stripe. El alumno elige cómo pagar el plan Mensual o el Anual entre las
// formas que permiten las banderas (3.5) y, antes de mandarlo a la pasarela, ve el aviso de lo que se
// cobra y cuándo (4.18). La prueba gratis sale de trialAvailable de my_plan, nunca de una bandera, así
// la app no promete una prueba que el servidor no da. Si el servidor dice otra cosa responde
// trial_mismatch y la app vuelve a leer el plan.
//
// Solo la tarjeta con Stripe lleva el precio Fundador y la prueba. OXXO, SPEI y Mercado Pago usan el
// plan regular (8.3, checkoutRequestFor). Los códigos de descuento se escriben en la página de Stripe.
import { useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import {
  PASS_PRICES_MXN,
  PLANS,
  TRIAL_DAYS,
  isFounderPlan,
  regularPlanOf,
  type PaidPlanKey,
  type RegularPlanKey,
} from '@/config/billing';
import { loadCloud } from '@/data/cloud/client';
import {
  checkoutRequestFor,
  startCheckout,
  type CheckoutResult,
  type PaymentOption,
} from '@/data/payments/checkout';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { RadioCards, type RadioCardOption } from '@/ui/components/radio-cards';
import { longDate } from './planState';
import { paymentOptionsFor, readPaymentFlags, type PaymentFlags } from './paymentOptions';

const text = billingCloudText;
type Failure = Extract<CheckoutResult, { ok: false }>;

const isPass = (option: PaymentOption) =>
  option === 'oxxo' || option === 'spei' || option === 'mercadopago_pass';

/**
 * El texto del error de create-checkout. Con not_configured en un pase o en Mercado Pago es que el
 * servidor tiene apagada esa forma de pago aunque la copia de las banderas de este navegador diga que
 * no, así que se nombra la forma de pago y se pide elegir otra
 */
function failureText(failure: Failure, option: PaymentOption): string {
  switch (failure.reason) {
    case 'pass_in_force':
      return failure.passEnd
        ? text.errors.pass_in_force(longDate(failure.passEnd))
        : text.errors.passInForceNoDate;
    case 'not_configured':
      return option === 'card'
        ? text.errors.not_configured
        : text.errors.optionUnavailable(text.options[option].label);
    default:
      return text.errors[failure.reason];
  }
}

export function CheckoutOptions({
  plan,
  chargedPlan: requested,
  passOnly = false,
  trialAvailable,
  passEnd = null,
  flags = readPaymentFlags(),
  onBack,
  onTrialMismatch,
  open = (url: string) => {
    window.location.assign(url);
  },
  now = () => new Date(),
}: {
  /** El plan visible que eligió, Mensual o Anual */
  plan: RegularPlanKey;
  /** El que se cobra con tarjeta. Fundador mientras dure la promoción */
  chargedPlan: PaidPlanKey;
  /** Con un pase vigente solo se suma otro pase */
  passOnly?: boolean;
  /** Si el servidor da la prueba gratis, según my_plan */
  trialAvailable: boolean;
  /** Fin del pase vigente, desde el que se suma uno nuevo */
  passEnd?: string | null;
  flags?: PaymentFlags;
  onBack: () => void;
  /** El servidor dijo otra cosa de la prueba. Quien llama vuelve a leer el plan */
  onTrialMismatch?: () => void;
  /** Cómo se abre la pasarela. Se puede cambiar en las pruebas */
  open?: (url: string) => void;
  now?: () => Date;
}) {
  const options = paymentOptionsFor(flags, passOnly);
  const [option, setOption] = useState<PaymentOption>(options[0] ?? 'card');
  // Si los lugares Fundador se llenaron o se perdieron, el alumno puede seguir con el precio regular
  const [charged, setCharged] = useState<PaidPlanKey>(requested);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const regular = regularPlanOf(charged);
  const period = t.billing.periods[regular];
  const passPrice = t.billing.price(PASS_PRICES_MXN[regular]);
  const length = text.passLength[regular];
  const cardPrice = t.billing.price(PLANS[charged].priceMxn);
  const trial = trialAvailable && option === 'card';

  const describe = (value: PaymentOption): RadioCardOption<PaymentOption> => {
    switch (value) {
      case 'card':
        return {
          value,
          label: text.options.card.label,
          description: trialAvailable
            ? text.options.card.trial(cardPrice, period)
            : text.options.card.noTrial(cardPrice, period),
        };
      case 'oxxo':
      case 'spei':
      case 'mercadopago_pass':
        return {
          value,
          label: text.options[value].label,
          description: text.options[value].description(length, passPrice),
        };
      case 'mercadopago':
        return {
          value,
          label: text.options.mercadopago.label,
          description: text.options.mercadopago.description(
            t.billing.price(PLANS[regular].priceMxn),
            period,
          ),
        };
    }
  };

  const summary = isPass(option)
    ? [
        text.summary.pass,
        passEnd ? text.summary.passAdds(longDate(passEnd)) : null,
        option === 'oxxo' ? text.summary.oxxoRefund : null,
      ]
        .filter((line) => line !== null)
        .join(' ')
    : trial
      ? text.summary.trial(
          longDate(new Date(now().getTime() + TRIAL_DAYS * 86_400_000).toISOString()),
          cardPrice,
          text.every[regular],
        )
      : text.summary.charge(
          option === 'mercadopago' ? t.billing.price(PLANS[regular].priceMxn) : cardPrice,
          text.every[regular],
        );
  // Los códigos de descuento solo existen en la página de Stripe (respuesta 21)
  const withCode = option === 'card' || option === 'oxxo' || option === 'spei';
  const action =
    option === 'card'
      ? trial
        ? text.actions.trial
        : text.go
      : option === 'mercadopago' || option === 'mercadopago_pass'
        ? text.actions.mercadopago
        : text.actions[option];

  const go = async (target: PaidPlanKey = charged) => {
    setBusy(true);
    setFailure(null);
    const cloud = await loadCloud();
    if (!cloud) {
      setBusy(false);
      setFailure({ ok: false, reason: 'failed' });
      return;
    }
    const result = await startCheckout(
      cloud,
      checkoutRequestFor(option, target, trialAvailable && option === 'card'),
    );
    if (result.ok) {
      open(result.url);
      return;
    }
    setBusy(false);
    setFailure(result);
    if (result.reason === 'trial_mismatch') onTrialMismatch?.();
  };

  const lostFounder =
    (failure?.reason === 'founder_full' || failure?.reason === 'founder_lost') &&
    isFounderPlan(charged);

  return (
    <Card aria-labelledby="forma-de-pago-titulo" className="flex flex-col gap-3">
      <CardHeader>
        <CardTitle id="forma-de-pago-titulo">{text.checkoutTitle(t.billing.plans[plan])}</CardTitle>
      </CardHeader>
      <RadioCards
        legend={text.optionsLegend}
        value={option}
        options={options.map(describe)}
        onValueChange={(value) => {
          setOption(value);
          setFailure(null);
        }}
      />
      <div role="status" className="flex flex-col gap-2 rounded-md bg-muted px-3 py-2 text-sm">
        <p>{summary}</p>
        <p>
          {withCode ? `${text.summary.code} ` : null}
          <Link to={screenPath('terms')} className="underline underline-offset-4">
            {text.summary.terms}
          </Link>
        </p>
      </div>
      {flags.testMode ? (
        <p className="rounded-md bg-sim px-3 py-2 text-sm text-sim-fg">{text.testMode}</p>
      ) : null}
      <p role="status" className="min-h-5 text-sm text-fg-muted">
        {busy ? text.opening : failure ? failureText(failure, option) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {lostFounder ? (
          <Button
            disabled={busy}
            // El texto es largo y en el teléfono se parte en dos renglones en lugar de salirse (H27)
            className="h-auto min-h-11 whitespace-normal"
            onClick={() => {
              const next = regularPlanOf(charged);
              setCharged(next);
              void go(next);
            }}
          >
            {text.regularInstead(
              `${t.billing.price(PLANS[regularPlanOf(charged)].priceMxn)} ${t.billing.periods[regularPlanOf(charged)]}`,
            )}
          </Button>
        ) : (
          <Button
            disabled={busy || options.length === 0}
            onClick={() => {
              void go();
            }}
          >
            {action}
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={onBack}>
          {text.back}
        </Button>
      </div>
    </Card>
  );
}
