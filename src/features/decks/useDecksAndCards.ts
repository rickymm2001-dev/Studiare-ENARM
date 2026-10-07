// Los mazos y las tarjetas guardados, reactivos. Los usan Progreso y el widget de carga futura.
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';

export function useDecksAndCards() {
  const api = useDataApi();
  return useLiveData(async () => {
    const [decks, cards] = await Promise.all([api.repos.decks.list(), api.repos.cards.list()]);
    return { decks, cards };
  }, [api.repos]);
}
