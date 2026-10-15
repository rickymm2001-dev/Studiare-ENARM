// El texto y el destino del botón de los candados para el alumno de la sesión (B10). Lee si todavía le
// toca la prueba gratis en la suscripción que reflejó la nube, con la misma regla de Suscripción
// (trialOffered), y lockedCta.ts decide el resto.
import { useCloud } from '@/app/cloudState';
import { useSession } from '@/app/session';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { trialOffered } from '@/features/billing/planState';
import { lockedCtaLabel, lockedCtaPath } from './lockedCta';

export function useLockedCta(): { label: string; path: string } {
  const api = useDataApi();
  const session = useSession();
  const userId = session.status === 'ready' ? session.user.id : null;
  const linked = useCloud((store) => store.state.status === 'linked');
  const subscription = useLiveData(
    () =>
      userId
        ? api.repos.subscriptions.get(userId).then((value) => value ?? null)
        : Promise.resolve(null),
    [api.repos, userId],
  );
  const trialAvailable = trialOffered(subscription, linked);
  return { label: lockedCtaLabel(trialAvailable), path: lockedCtaPath(trialAvailable) };
}
