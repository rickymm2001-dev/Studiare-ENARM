// El plan que el alumno tiene activo. Sin suscripción vigente es Gratis. undefined mientras carga.
import type { PlanKey } from '@/config/billing';
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
