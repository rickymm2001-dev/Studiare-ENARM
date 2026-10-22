// El anfitrión del recorrido guiado (B15, 4.1 y 4.3 del plan de B15). Decide cuándo empieza el recorrido y lo
// monta. TourLauncher, que es lo único que viaja en el JavaScript inicial, lo baja con lazy solo cuando hay
// algo que ofrecer, o sea cuando el registro dejó marcado a un alumno en este navegador o cuando alguien
// pidió Ver el recorrido. Así casi nadie lo descarga.
//
// Empieza solo cuando la bandera guidedTour está prendida, el alumno lo dejó marcado al terminar su registro
// en este navegador y no lo ha terminado ni saltado, llega a Inicio y no hay otro diálogo abierto. O cuando
// pide Ver el recorrido en Configuración. Médicos, admins y dueño no lo ven (8.18).
import { useCallback, useEffect, useState } from 'react';
import { usePreferences } from '@/app/preferences';
import { screenPath } from '@/app/screens';
import { readTourState, TOUR_SCREEN_ATTRIBUTE } from './steps';
import { Tour, type TourNavigate } from './Tour';
import type { TourTrigger } from './tourMachine';
import { useTourRequest } from './tourRequest';
import { shouldAutoStart, tourAvailable } from './tourState';

/** Cada cuánto revisa si ya puede empezar solo, en milisegundos */
const AUTO_START_POLL_MS = 600;

/** Inicio ya pintó su encabezado y ningún otro diálogo está abierto */
function readyForAutoStart(): boolean {
  return (
    document.querySelector(`[${TOUR_SCREEN_ATTRIBUTE}="home"]`) !== null &&
    document.querySelector('[role="dialog"], [role="alertdialog"]') === null
  );
}

export function TourHost({
  userId,
  pathname,
  navigate,
}: {
  userId: string;
  /** La ruta de ahora y cómo navegar, que le pasa TourLauncher (ver TourNavigate) */
  pathname: string;
  navigate: TourNavigate;
}) {
  const role = usePreferences((state) => state.role);
  const requested = useTourRequest((state) => state.trigger);
  const clearRequest = useTourRequest((state) => state.clear);
  const [auto, setAuto] = useState(false);
  const offerable = tourAvailable(role);
  const onHome = pathname === screenPath('home');

  // Revisa cada tanto si Inicio ya está listo para empezar el recorrido solo. Sin marca del registro no
  // revisa nada, que es lo que pasa con casi todos
  useEffect(() => {
    if (!tourAvailable(role) || !onHome || auto || requested !== null) return;
    if (!shouldAutoStart(readTourState(), userId)) return;
    const timer = window.setInterval(() => {
      if (!shouldAutoStart(readTourState(), userId)) {
        window.clearInterval(timer);
      } else if (readyForAutoStart()) {
        window.clearInterval(timer);
        setAuto(true);
      }
    }, AUTO_START_POLL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [userId, role, onHome, auto, requested]);

  const onDone = useCallback(() => {
    setAuto(false);
    clearRequest();
  }, [clearRequest]);

  const trigger: TourTrigger | null = auto ? 'auto' : offerable ? requested : null;
  return trigger === null ? null : (
    <Tour
      trigger={trigger}
      userId={userId}
      onDone={onDone}
      pathname={pathname}
      navigate={navigate}
    />
  );
}
