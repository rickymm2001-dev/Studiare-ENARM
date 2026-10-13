// Misiones de hoy del alumno armadas con su bitácora (Fase P bloque 6). Se recalculan cuando llega un
// evento nuevo, así Inicio muestra el avance al momento.
import { useMemo } from 'react';
import { buildMissions, type Mission } from '@/engines/rewards';
import type { ReadySession } from '../../shared/RequireSession';
import { useUserEvents } from '../../shared/useUserEvents';

export function useMissions(session: ReadySession): Mission[] | undefined {
  const events = useUserEvents(session.user.id);
  const timeZone = session.user.timeZone;
  return useMemo(() => {
    if (!events) return undefined;
    return buildMissions({ events, now: new Date(), timeZone });
  }, [events, timeZone]);
}
