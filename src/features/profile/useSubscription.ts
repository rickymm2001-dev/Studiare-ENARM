// La suscripción del alumno, reactiva. null si nunca contrató nada. undefined mientras carga.
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Subscription } from '@/data/schemas/people';

export function useSubscription(userId: string): Subscription | null | undefined {
  const api = useDataApi();
  return useLiveData(
    () => api.repos.subscriptions.get(userId).then((value) => value ?? null),
    [api.repos, userId],
  );
}
