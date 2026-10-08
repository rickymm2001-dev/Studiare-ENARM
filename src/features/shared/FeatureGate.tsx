// Deja ver una función solo si el plan del alumno la incluye (D-085, fila 14). Hoy todas están
// abiertas en todos los planes, pero cada punto de entrada ya pregunta, así que decidir cuáles son
// de pago es cambiar la tabla de planes y no la interfaz.
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import {
  canUseFeature,
  PLANS,
  type GatedFeature,
  type PlanDef,
  type PlanKey,
} from '@/config/billing';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { useActivePlan } from './useActivePlan';

export function FeatureGate({
  userId,
  feature,
  children,
  plans = PLANS,
}: {
  userId: string;
  feature: GatedFeature;
  children: ReactNode;
  /** Tabla de planes. Solo cambia en las pruebas */
  plans?: Record<PlanKey, Pick<PlanDef, 'features'>>;
}) {
  const plan = useActivePlan(userId);
  if (plan === undefined) return null;
  if (canUseFeature(plan, feature, plans)) return <>{children}</>;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3 text-sm"
    >
      <Lock aria-hidden className="size-4 shrink-0 text-fg-muted" />
      <p className="flex-1">{t.billing.featureLocked(t.billing.featureNames[feature])}</p>
      <Button asChild size="sm" variant="secondary">
        <Link to={screenPath('subscription')}>{t.billing.featureSeePlans}</Link>
      </Button>
    </div>
  );
}
