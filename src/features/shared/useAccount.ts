// Datos de cuenta del alumno, reactivos. null si el perfil no tiene cuenta (perfiles viejos o demo)
import { useRepositories } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Account } from '@/data/schemas/people';

export function useAccount(userId: string): Account | null | undefined {
  const repos = useRepositories();
  return useLiveData(
    () => repos.accounts.get(userId).then((account) => account ?? null),
    [repos, userId],
  );
}
