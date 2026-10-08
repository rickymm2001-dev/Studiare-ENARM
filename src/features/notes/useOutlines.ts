// Los apuntes del alumno, del más reciente al más viejo, y se actualizan solos al guardar (D-092).
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { OutlinePage } from '@/data/schemas/outlines';

export function useOutlines(userId: string): OutlinePage[] | undefined {
  const api = useDataApi();
  return useLiveData(async () => {
    const pages = await api.repos.outlines.list();
    return pages
      .filter((page) => page.ownerId === userId)
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }, [api.repos, userId]);
}
