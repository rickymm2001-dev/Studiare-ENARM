// Tu plan, lo primero de Perfil en Configuración (B3 del plan del cambio, comentario 5). Nombre,
// precio, la línea de su estado y el botón Cambiar tu plan, que abre Suscripción. Desde B10 la línea
// dice la prueba gratis con su fecha de fin, la renovación, la cancelación, el pase, el cobro fallido o
// el mes regalado (3.2). Qué línea toca lo decide planStateOf, igual que en Suscripción.
import { CreditCard } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { PLANS, planOf } from '@/config/billing';
import type { Subscription } from '@/data/schemas/people';
import { longDate, planStateOf, type PlanState } from '@/features/billing/planState';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';

const text = t.settingsPage.plan;

function stateLine(state: PlanState): string {
  switch (state.kind) {
    case 'trialing':
      return text.trialing(longDate(state.end), t.billing.price(PLANS[state.plan].priceMxn));
    case 'trialCanceled':
      return text.trialCanceled(longDate(state.end));
    case 'renews':
      return text.renews(longDate(state.date), t.billing.price(PLANS[state.plan].priceMxn));
    case 'canceled':
      return text.canceled(longDate(state.until));
    case 'pastDue':
      return text.pastDue;
    case 'pass':
      return text.pass(longDate(state.until));
    case 'referral':
      return text.referralUntil(longDate(state.until));
    case 'paidUntil':
      return text.paidUntil(longDate(state.until));
  }
}

export function PlanCard({ subscription }: { subscription: Subscription | null }) {
  const plan = planOf(subscription);
  const state = planStateOf(subscription);
  return (
    <Card aria-labelledby="plan-titulo">
      <CardHeader>
        <CardTitle as="h3" id="plan-titulo">
          {text.title}
        </CardTitle>
      </CardHeader>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-lg font-bold">{t.billing.plans[plan]}</p>
          <p className="text-sm text-fg-muted">
            {text.price(t.billing.price(PLANS[plan].priceMxn), t.billing.periods[plan])}
          </p>
          {state ? <p className="text-sm">{stateLine(state)}</p> : null}
          {subscription?.isSimulated && plan !== 'free' ? (
            <p className="text-sm text-fg-muted">{text.simulated}</p>
          ) : null}
        </div>
        <Button asChild variant="secondary">
          <Link to={screenPath('subscription')}>
            <CreditCard aria-hidden />
            {text.change}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
