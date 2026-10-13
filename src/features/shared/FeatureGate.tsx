// Deja ver una función solo si el plan del alumno la incluye (D-085, fila 14). Cada punto de entrada
// pregunta, así que decidir cuáles son de pago es cambiar la tabla de planes y no la interfaz. Una
// función cerrada puede mostrar su propia vista previa con candado en lugar del aviso corto (B6).
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
  locked,
  plans = PLANS,
}: {
  userId: string;
  feature: GatedFeature;
  children: ReactNode;
  /**
   * Lo que se ve en lugar de la función cuando el plan no la incluye, como una vista previa con su
   * candado y la prueba gratis (respuesta 20 del plan del cambio). Sin él sale el aviso corto
   */
  locked?: ReactNode;
  /** Tabla de planes. Solo cambia en las pruebas */
  plans?: Record<PlanKey, Pick<PlanDef, 'features'>>;
}) {
  const plan = useActivePlan(userId);
  if (plan === undefined) return null;
  if (canUseFeature(plan, feature, plans)) return <>{children}</>;
  if (locked !== undefined) return <>{locked}</>;
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
