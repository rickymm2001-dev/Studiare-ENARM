// El plan que el alumno tiene activo. Sin suscripción vigente es Gratis. undefined mientras carga.
import { canUse, type PlanKey, type PlanLock } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';

export function useActivePlan(userId: string): PlanKey | undefined {
  const api = useDataApi();
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(userId).then((value) => value ?? null),
    [api.repos, userId],
  );
  if (subscription === undefined) return undefined;
  return subscription?.status === 'active' ? subscription.plan : 'free';
}

/**
 * Si el plan del alumno abre lo que pide el candado, para una pantalla que no puede envolver la función
 * con FeatureGate, como un botón dentro de una lista (B8). undefined mientras carga
 */
export function usePlanAllows(userId: string, lock: PlanLock): boolean | undefined {
  const plan = useActivePlan(userId);
  return plan === undefined ? undefined : canUse(plan, lock);
}
