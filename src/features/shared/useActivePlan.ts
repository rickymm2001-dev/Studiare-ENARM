// El plan que el alumno tiene activo. Sin suscripción vigente es Gratis (planOf). undefined mientras
// carga, y también con la nube conectada mientras my_plan no contesta en un navegador que no guarda el
// plan de la nube, como un dispositivo nuevo o uno con el pago simulado de antes. Así quien paga no ve
// los candados de Gratis antes de que llegue su plan (B8).
import { useCloud } from '@/app/cloudState';
import { usePlanCheck } from '@/app/planCheck';
import { canUse, planOf, type PlanKey, type PlanLock } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';

export function useActivePlan(userId: string): PlanKey | undefined {
  const api = useDataApi();
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(userId).then((value) => value ?? null),
    [api.repos, userId],
  );
  const linkedAuthId = useCloud((store) =>
    store.state.status === 'linked' ? store.state.identity.authId : null,
  );
  const checkedFor = usePlanCheck((store) => store.checkedFor);
  if (subscription === undefined) return undefined;
  const fromCloud = subscription !== null && !subscription.isSimulated;
  if (linkedAuthId !== null && checkedFor !== linkedAuthId && !fromCloud) return undefined;
  return planOf(subscription);
}

/**
 * Si el plan del alumno abre lo que pide el candado, para una pantalla que no puede envolver la función
 * con FeatureGate, como un botón dentro de una lista (B8). undefined mientras carga
 */
export function usePlanAllows(userId: string, lock: PlanLock): boolean | undefined {
  const plan = useActivePlan(userId);
  return plan === undefined ? undefined : canUse(plan, lock);
}

/**
 * El texto que toca según si el plan abre el candado, como sugerir seguir un mazo del catálogo solo a
 * quien lo tiene abierto (4.25, B8). undefined mientras carga, para no sugerir lo que el plan no abre
 */
export function usePlanText(
  userId: string,
  lock: PlanLock,
  texts: { open: string; closed: string },
): string | undefined {
  const allowed = usePlanAllows(userId, lock);
  return allowed === undefined ? undefined : allowed ? texts.open : texts.closed;
}
