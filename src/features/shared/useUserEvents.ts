// Bitácora del alumno en orden de tiempo, reactiva. Las pantallas derivan todo de aquí.
import { useRepositories } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';

export function useUserEvents(userId: string): AppEvent[] | undefined {
  const repos = useRepositories();
  return useLiveData(() => repos.events.query({ userId }), [repos, userId]);
}
