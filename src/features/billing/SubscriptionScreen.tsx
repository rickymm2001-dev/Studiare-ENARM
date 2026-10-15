// Suscripción (pantalla 16). Planes con sus banderas de acceso. Sin la nube, checkout simulado sin datos
// de tarjeta y recibos marcados como simulados (15.7), que no cobran nada (3.2). Con la nube conectada
// el plan lo decide el servidor (D-096) y, desde B10, el alumno ve el estado de su plan (prueba,
// renovación, cancelación, pase o pago pendiente), elige la forma de pago (CheckoutOptions) y cambia
// de plan en el portal de Stripe. Un solo plan pagado a la vez (D-118). Con un pase vigente solo se
// suma otro pase (8.10).
import { Check, Crown, Gauge, Minus, Receipt } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { useCloud } from '@/app/cloudState';
import { screenPath } from '@/app/screens';
import {
  canUse,
  checkoutPlanFor,
  FOUNDER_PROMO_ACTIVE,
  PLAN_HIGHLIGHTS,
  PLANS,
  planOf,
  VISIBLE_PLANS,
  visiblePlanOf,
  type PaidPlanKey,
  type PlanHighlight,
  type PlanKey,
  type RegularPlanKey,
} from '@/config/billing';
import { cloudConfigured, loadCloud } from '@/data/cloud/client';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { refreshCloudPlan } from '@/data/payments/cloudPlan';
import { changePlan } from '@/data/usecases/subscription';
import { t } from '@/i18n/es-MX';
import { billingCloudText } from '@/i18n/billingCloud';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { TRIAL_PLAN_PARAM } from '../shared/lockedCta';
import { useUserEvents } from '../shared/useUserEvents';
import { CheckoutOptions } from './CheckoutOptions';
import { paymentOptionsFor, readPaymentFlags } from './paymentOptions';
import {
  BillingPortalCard,
  CloudRequiredCard,
  MercadoPagoManageCard,
  PaymentReturnNotice,
} from './CloudBilling';
import { PendingPaymentNotice } from './PendingPaymentNotice';
import { longDate, liveProviderOf, trialOffered } from './planState';
import { PlanPrice } from './PlanPrice';
import { PlanStatus } from './PlanStatus';
import { usePortal } from './usePortal';

/**
 * Funciones que todavía no existen. Se muestran como Próximamente para no prometer de más (D-076).
 * Hoy ninguna, porque el examen completo ya existe (hallazgo de B1, D-119)
 */
const COMING_SOON: ReadonlySet<'dailyQuestions' | PlanHighlight> = new Set();

/**
 * Las preguntas al día y lo que compara cada plan, en el orden de PLAN_HIGHLIGHTS. Incluye lo que
 * Gratis cierra con su candado, como Apuntes, Party, Importar mazos y el catálogo (B8)
 */
const ACCESS_KEYS: readonly ('dailyQuestions' | PlanHighlight)[] = [
  'dailyQuestions',
  ...PLAN_HIGHLIGHTS,
];

/** ?plan= de la dirección, el que lleva el botón de los candados, como plan visible */
const REQUESTED_PLANS: Record<string, RegularPlanKey> = {
  [TRIAL_PLAN_PARAM]: 'monthly',
  anual: 'annual',
};

/** La forma de pago abierta. Con passOnly es Sumar otro mes o año a un pase vigente */
interface OpenCheckout {
  plan: RegularPlanKey;
  passOnly: boolean;
}

export function SubscriptionScreen() {
  return (
    <RequireSession screen="subscription">
      {(session) => <Billing session={session} />}
    </RequireSession>
  );
}

function Billing({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user } = session;
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(user.id).then((value) => value ?? null),
    [api.repos, user.id],
  );
  const events = useUserEvents(user.id);
  const [checkout, setCheckout] = useState<OpenCheckout | null>(null);
  const [simulated, setSimulated] = useState<PlanKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [params, setParams] = useSearchParams();
  const portal = usePortal();
  const current = planOf(subscription);
  // Con la nube conectada el plan lo decide el servidor y no hay pago simulado (D-096)
  const inCloud = useCloud((store) => store.state.status === 'linked');
  // Con la nube configurada y este navegador sin sesión, el servidor no sabe quién paga. No se ofrece
  // ningún pago, ni el real ni el simulado, que no cobraría nada pero haría creer que sí
  const needsCloud = cloudConfigured() && !inCloud;
  // Con un plan pagado vigente otro pago abriría una segunda suscripción que cobra aparte. No se ofrece
  // y el servidor también lo rechaza. Un mes regalado por referido sí deja pagar (D-118)
  const liveProvider = inCloud ? liveProviderOf(subscription) : null;
  const passLive = inCloud && current !== 'free' && subscription?.source === 'pass';
  const trialAvailable = trialOffered(subscription, inCloud);
  const flags = readPaymentFlags();
  const canAddPass = paymentOptionsFor(flags, true).length > 0;
  // Quien paga el precio regular no ve el de Fundador, que ya no es el suyo
  const regularPaid =
    (current === 'monthly' || current === 'annual') && subscription?.source !== 'referral';
  const promo = FOUNDER_PROMO_ACTIVE && !regularPaid;
  const receipts = (events ?? []).flatMap((event) =>
    event.type === 'subscription_changed' && event.payload.receiptId
      ? [{ at: event.at, ...event.payload }]
      : [],
  );

  const refresh = () => {
    void loadCloud().then((cloud) => {
      if (cloud) void refreshCloudPlan(api, cloud, user.id);
    });
  };

  // El botón de los candados abre aquí la forma de pago del plan que pide (?plan=mensual). Se toma al
  // entrar y se quita de la dirección, para que volver no la abra otra vez. Con un plan pagado vigente
  // solo se ven los planes
  const [requested] = useState(() => REQUESTED_PLANS[params.get('plan') ?? ''] ?? null);
  const [requestDone, setRequestDone] = useState(false);
  const hasPaidPlan = liveProvider !== null || passLive;
  const autoCheckout: OpenCheckout | null =
    requested && !requestDone && inCloud && subscription !== undefined && !hasPaidPlan
      ? { plan: requested, passOnly: false }
      : null;
  const openCheckout = checkout ?? autoCheckout;
  useEffect(() => {
    if (!params.has('plan')) return;
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete('plan');
        return next;
      },
      { replace: true },
    );
  }, [params, setParams]);

  return (
    <>
      <ScreenHeader
        title={t.screens.subscription.title}
        description={inCloud || needsCloud ? billingCloudText.notice : t.billing.simulatedNotice}
      />
      {needsCloud ? <CloudRequiredCard userId={user.id} /> : null}
      {inCloud ? <PaymentReturnNotice userId={user.id} subscription={subscription} /> : null}
      <StatPanel label={t.billing.current(t.billing.plans[current])}>
        <StatCell
          icon={<Crown />}
          label={t.billing.stats.plan}
          value={t.billing.plans[current]}
          caption={
            inCloud && subscription?.periodEnd
              ? billingCloudText.validUntil(longDate(subscription.periodEnd))
              : t.billing.periods[current]
          }
        />
        <StatCell
          icon={<Gauge />}
          label={t.billing.stats.daily}
          value={
            PLANS[current].access.dailyQuestions === null
              ? '∞'
              : PLANS[current].access.dailyQuestions.toLocaleString('es-MX')
          }
          caption={
            PLANS[current].access.dailyQuestions === null
              ? t.billing.stats.unlimited
              : t.billing.stats.dailyCaption
          }
        />
      </StatPanel>
      {inCloud ? (
        <>
          <PlanStatus subscription={subscription} />
          <PendingPaymentNotice subscription={subscription} />
        </>
      ) : null}
      {openCheckout && inCloud ? (
        <CheckoutOptions
          plan={openCheckout.plan}
          chargedPlan={checkoutPlanFor(openCheckout.plan, promo) as PaidPlanKey}
          passOnly={openCheckout.passOnly}
          trialAvailable={trialAvailable}
          passEnd={subscription?.passEnd ?? null}
          flags={flags}
          onTrialMismatch={refresh}
          onBack={() => {
            setCheckout(null);
            setRequestDone(true);
          }}
        />
      ) : simulated && !needsCloud && !inCloud ? (
        <Card aria-labelledby="checkout-titulo">
          <CardHeader>
            <CardTitle id="checkout-titulo">{t.billing.checkoutTitle}</CardTitle>
            <CardDescription>
              {t.billing.checkoutSummary(
                t.billing.plans[simulated],
                t.billing.price(PLANS[simulated].priceMxn),
                t.billing.periods[simulated],
              )}
            </CardDescription>
          </CardHeader>
          <p className="mb-3 rounded-md bg-sim px-3 py-2 text-sm text-sim-fg">
            {t.billing.simulatedNotice}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void changePlan(api, user, simulated).then(() => {
                  setBusy(false);
                  setSimulated(null);
                  setMessage('');
                });
              }}
            >
              {busy ? t.billing.processing : t.billing.confirm}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSimulated(null);
              }}
            >
              {t.billing.back}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {passLive && subscription.passEnd ? (
            <p className="text-sm text-fg-muted">
              {billingCloudText.passNote(longDate(subscription.passEnd))}
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {VISIBLE_PLANS.map((key) => {
              const plan = PLANS[key];
              // Quien paga un Fundador tiene el mensual o el anual, con su precio de promoción
              const isCurrent = key === visiblePlanOf(current);
              return (
                <Card
                  key={key}
                  aria-labelledby={`plan-${key}`}
                  className={cn('flex flex-col', isCurrent && 'border-indicator')}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle id={`plan-${key}`}>{t.billing.plans[key]}</CardTitle>
                      {isCurrent ? <Badge variant="info">{t.billing.currentPlan}</Badge> : null}
                    </div>
                    <PlanPrice plan={key} promo={promo} trial={trialAvailable} />
                  </CardHeader>
                  <ul className="mb-4 flex flex-col gap-2 text-sm">
                    {ACCESS_KEYS.map((access) => {
                      const label =
                        access === 'dailyQuestions'
                          ? t.billing.access.dailyQuestions(plan.access.dailyQuestions)
                          : t.billing.access[access];
                      const included = access === 'dailyQuestions' ? true : canUse(key, access);
                      return (
                        <li
                          key={access}
                          className={cn('flex items-center gap-2', !included && 'text-fg-muted')}
                        >
                          {included ? (
                            <Check aria-hidden className="size-4 text-fg-muted" />
                          ) : (
                            <Minus aria-hidden className="size-4" />
                          )}
                          <span>
                            {label}
                            {included && COMING_SOON.has(access) ? (
                              <Badge variant="neutral" className="ml-2">
                                {t.billing.comingSoon}
                              </Badge>
                            ) : null}
                            <span className="sr-only">
                              . {included ? t.billing.included : t.billing.notIncluded}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-auto flex flex-col gap-2">
                    <PlanAction
                      planKey={key}
                      isCurrent={isCurrent}
                      needsCloud={needsCloud}
                      inCloud={inCloud}
                      liveProvider={liveProvider}
                      passLive={passLive}
                      canAddPass={canAddPass}
                      trialAvailable={trialAvailable}
                      portalBusy={portal.busy}
                      onPortal={() => {
                        void portal.go('update');
                      }}
                      onChoose={(passOnly) => {
                        if (key === 'free') return;
                        if (inCloud) setCheckout({ plan: key as RegularPlanKey, passOnly });
                        else setSimulated(checkoutPlanFor(key));
                      }}
                      onCancelSimulated={() => {
                        void changePlan(api, user, 'free').then(() => {
                          setMessage(t.billing.canceled);
                        });
                      }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
      <p role="status" className="text-sm text-fg-muted">
        {portal.busy ? billingCloudText.portalOpening : (portal.error ?? message)}
      </p>
      {inCloud && !openCheckout && liveProvider === 'stripe' ? <BillingPortalCard /> : null}
      {inCloud && !openCheckout && liveProvider === 'mercadopago' && subscription ? (
        <MercadoPagoManageCard subscription={subscription} onChanged={refresh} />
      ) : null}
      <Card aria-labelledby="recibos-titulo">
        <CardHeader>
          <CardTitle id="recibos-titulo">{t.billing.receiptsTitle}</CardTitle>
        </CardHeader>
        {receipts.length === 0 && inCloud ? (
          // Con la nube los pagos reales no son recibos simulados. Viven en Facturas, en Perfil
          <p className="text-sm text-fg-muted">
            {billingCloudText.receiptsInCloud}{' '}
            <Link
              to={`${screenPath('settings')}#perfil`}
              className="font-semibold text-primary-ink underline underline-offset-2"
            >
              {billingCloudText.receiptsInCloudLink}
            </Link>
          </p>
        ) : receipts.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.billing.noReceipts}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {[...receipts].reverse().map((receipt) => (
              <li
                key={receipt.receiptId}
                className="flex items-start gap-3 rounded-md border border-line p-3"
              >
                <Receipt aria-hidden className="mt-0.5 size-5 text-fg-muted" />
                <div className="flex flex-col text-sm">
                  <span className="font-medium">{t.billing.receiptTitle}</span>
                  <span>
                    {t.billing.receiptLine(
                      t.billing.plans[receipt.plan],
                      t.billing.price(receipt.amountMxn),
                      new Date(receipt.at).toLocaleDateString('es-MX'),
                    )}
                  </span>
                  <span className="text-fg-muted">
                    {t.billing.receiptFolio(receipt.receiptId ?? '')}
                  </span>
                  <span className="font-semibold text-sim-fg">{t.billing.receiptSimulated}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/**
 * Lo que ofrece la tarjeta de un plan según lo que el alumno ya tiene (3.1.1). Elegir o empezar la
 * prueba, cambiar en el portal de Stripe, sumar otro pase o la nota de Mercado Pago
 */
function PlanAction({
  planKey,
  isCurrent,
  needsCloud,
  inCloud,
  liveProvider,
  passLive,
  canAddPass,
  trialAvailable,
  portalBusy,
  onPortal,
  onChoose,
  onCancelSimulated,
}: {
  planKey: PlanKey;
  isCurrent: boolean;
  needsCloud: boolean;
  inCloud: boolean;
  liveProvider: 'stripe' | 'mercadopago' | null;
  passLive: boolean;
  canAddPass: boolean;
  trialAvailable: boolean;
  portalBusy: boolean;
  onPortal: () => void;
  onChoose: (passOnly: boolean) => void;
  onCancelSimulated: () => void;
}) {
  const text = billingCloudText;
  if (needsCloud) return null;
  if (planKey === 'free') {
    if (isCurrent) return null;
    if (!inCloud) {
      return (
        <Button variant="secondary" onClick={onCancelSimulated}>
          {t.billing.cancel}
        </Button>
      );
    }
    return liveProvider ? <p className="text-sm text-fg-muted">{text.cancelNote}</p> : null;
  }
  const visible = planKey as RegularPlanKey;
  // Con un pase vigente se suma otro mes o año, también al plan que ya tiene (8.10)
  if (passLive) {
    return canAddPass ? (
      <Button
        variant="secondary"
        onClick={() => {
          onChoose(true);
        }}
      >
        {text.addPeriod[visible]}
      </Button>
    ) : null;
  }
  if (isCurrent) return null;
  if (liveProvider === 'stripe') {
    return (
      <>
        <Button variant="secondary" disabled={portalBusy} onClick={onPortal}>
          {text.changeTo[visible]}
        </Button>
        <p className="text-sm text-fg-muted">{text.changeNote}</p>
      </>
    );
  }
  if (liveProvider === 'mercadopago') {
    return <p className="text-sm text-fg-muted">{text.mercadoPagoChangeNote}</p>;
  }
  return (
    <Button
      onClick={() => {
        onChoose(false);
      }}
    >
      {inCloud && trialAvailable
        ? t.billing.freeTrialCta
        : t.billing.choose(t.billing.plans[planKey])}
    </Button>
  );
}
