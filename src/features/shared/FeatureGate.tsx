// Deja ver una función solo si el plan del alumno la incluye (D-085, fila 14). Cada punto de entrada
// pregunta, así que decidir cuáles son de pago es cambiar la tabla de planes y no la interfaz. Cierra
// las funciones de la carga diaria y también las banderas de acceso de sí o no, como Party, Subir
// mazos o el catálogo de mazos (B8 del plan del cambio). Una función cerrada puede mostrar su propia
// vista previa con candado en lugar del aviso corto (B6). Los dos llevan el botón de los candados.
// Mientras se sabe el plan, una vista previa deja su lugar en carga, así quien paga no ve el candado
// antes de que llegue su plan, por ejemplo en un dispositivo nuevo con la nube (useActivePlan).
import type { ReactNode } from 'react';
import {
  canUse,
  isGatedFeature,
  PLANS,
  type PlanDef,
  type PlanKey,
  type PlanLock,
} from '@/config/billing';
import { t } from '@/i18n/es-MX';
import { LockedLoading, LockedNote } from './LockedPreview';
import { useActivePlan } from './useActivePlan';

export function FeatureGate({
  userId,
  feature,
  children,
  locked,
  loading,
  plans = PLANS,
}: {
  userId: string;
  feature: PlanLock;
  children: ReactNode;
  /**
   * Lo que se ve en lugar de la función cuando el plan no la incluye, como una vista previa con su
   * candado y el botón de lockedCtaLabel (respuesta 20 del plan del cambio). Sin él sale el aviso corto
   */
  locked?: ReactNode;
  /**
   * Lo que se ve mientras se sabe el plan. Por omisión, una tarjeta en carga si hay vista previa y
   * nada si no, como en un ajuste chico que aparece al saberse el plan
   */
  loading?: ReactNode;
  /** Tabla de planes. Solo cambia en las pruebas */
  plans?: Record<PlanKey, Pick<PlanDef, 'features' | 'access'>>;
}) {
  const plan = useActivePlan(userId);
  if (plan === undefined) {
    return <>{loading ?? (locked === undefined ? null : <LockedLoading />)}</>;
  }
  if (canUse(plan, feature, plans)) return <>{children}</>;
  if (locked !== undefined) return <>{locked}</>;
  return (
    <LockedNote>
      {isGatedFeature(feature)
        ? t.billing.featureLocked(t.billing.featureNames[feature])
        : t.freePlan.accessLocked[feature]}
    </LockedNote>
  );
}
