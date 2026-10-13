// Pasa al árbol de mazos a quien ya seguía mazos precargados antes de que existiera (D-085) y les da
// a sus materias su nombre legible (B4 del plan del cambio). Corre una vez al abrir la sesión, no
// pinta nada y no hace nada si no hay mazos que reacomodar. El caso de uso, con los mazos y la tabla
// de nombres, se baja aparte solo cuando hay mazos seguidos, así no pesa en el JavaScript inicial.
import { useEffect } from 'react';
import { useDataApi } from '@/data/context';
import { loadCatalog } from '@/features/decks/useDeckCatalog';
import { useSession } from '../session';

export function OrganizationSync() {
  const api = useDataApi();
  const session = useSession();
  const userId = session.status === 'ready' && !session.isDemo ? session.user.id : null;
  const followed = session.status === 'ready' ? session.settings.followedDecks.join('|') : '';
  useEffect(() => {
    if (!userId || followed === '') return;
    // Un fallo aquí no debe tumbar la app. Se reintenta al abrirla otra vez
    void import('@/data/usecases/decks')
      .then(({ ensurePreloadedTree }) => ensurePreloadedTree(api, followed.split('|'), loadCatalog))
      .then(() => undefined)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api cambia en cada pintura y lo que importa es el alumno y qué mazos sigue
  }, [userId, followed]);
  return null;
}
