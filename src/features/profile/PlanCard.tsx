// Tu plan, lo primero de Perfil en Configuración (B3 del plan del cambio, comentario 5). Nombre,
// precio, hasta cuándo vale si lo dio el servidor y el botón Cambiar tu plan, que abre Suscripción.
// La prueba gratis llega en B10. Cuando exista, su fin va aquí junto a la renovación.
import { CreditCard } from 'lucide-react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import { PLANS, type PlanKey } from '@/config/billing';
import type { Subscription } from '@/data/schemas/people';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

export function PlanCard({ subscription }: { subscription: Subscription | null }) {
  const text = t.settingsPage.plan;
  const active = subscription?.status === 'active' ? subscription : null;
  const plan: PlanKey = active ? active.plan : 'free';
  const until = active?.periodEnd ? dateOf(active.periodEnd) : null;
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
          {until ? (
            <p className="text-sm">
              {active?.source === 'referral' ? text.referralUntil(until) : text.paidUntil(until)}
            </p>
          ) : null}
          {active?.isSimulated && plan !== 'free' ? (
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
