// Plan y sesión de la pantalla Perfil de antes (D-065). En B3 del plan del cambio Perfil pasó a
// Configuración y esta pantalla se quita con la navegación nueva. Mientras exista, muestra las
// mismas tarjetas que la sección Perfil de Configuración. Se borra junto con ProfileScreen.
import type { ReadySession } from '../shared/RequireSession';
import { PlanCard } from './PlanCard';
import { SessionCard } from './SessionCard';
import { useSubscription } from './useSubscription';

export function AccountSection({ session }: { session: ReadySession }) {
  const subscription = useSubscription(session.user.id);
  return (
    <>
      {subscription === undefined ? null : <PlanCard subscription={subscription} />}
      <SessionCard session={session} />
    </>
  );
}
