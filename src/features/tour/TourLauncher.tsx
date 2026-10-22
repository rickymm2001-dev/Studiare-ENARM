// Lo único del recorrido guiado que viaja en el JavaScript inicial (B15, 4.1 y 4.3 del plan de B15). Vive en el
// marco de la app y solo baja el resto, con lazy, cuando hay algo que ofrecer, o sea cuando el registro dejó
// marcado a un alumno en este navegador (markTourPending) o cuando alguien pidió Ver el recorrido en
// Configuración. Casi nadie descarga el recorrido, y quien lo necesita lo recibe al llegar a Inicio.
// Qué cuenta como algo que ofrecer se revisa sin leer el estado completo, con el texto crudo de la clave.
// Si debe empezar, y cuándo, lo decide TourHost.
import { lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { TOUR_STORAGE_KEY } from './steps';
import { useTourRequest } from './tourRequest';

// Si su archivo no llega, como sin red antes de que el service worker lo guarde, no se ve, pero la app sigue
const LazyTourHost = lazy(() =>
  import('./TourHost').then(
    (module) => ({ default: module.TourHost }),
    () => ({ default: () => null }),
  ),
);

/** Si este navegador tiene a algún alumno marcado por el registro y sin terminar el recorrido */
function hasPendingMark(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY)?.includes('"pending":[') ?? false;
  } catch {
    // Almacenamiento bloqueado. Sin marca no hay recorrido que ofrecer solo
    return false;
  }
}

export function TourLauncher({ userId }: { userId: string | null }) {
  // El recorrido diferido recibe la ruta y la navegación de aquí, para no importar react-router (TourNavigate)
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const requested = useTourRequest((state) => state.trigger !== null);
  if (userId === null || !(requested || hasPendingMark())) return null;
  return (
    <Suspense fallback={null}>
      <LazyTourHost userId={userId} pathname={pathname} navigate={navigate} />
    </Suspense>
  );
}
