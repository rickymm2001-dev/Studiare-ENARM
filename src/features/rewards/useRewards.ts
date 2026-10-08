// Misiones, insignias y liga del alumno, armadas con su bitácora (Fase P bloque 6). La mejor racha
// sale del mismo cálculo que usa Inicio, para que las dos pantallas digan lo mismo.
import { useMemo } from 'react';
import { buildRewards, type Rewards } from '@/engines/rewards';
import { buildSnapshot } from '../home/snapshot';
import type { ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';

export function useRewards(session: ReadySession): Rewards | undefined {
  const events = useUserEvents(session.user.id);
  const { user, settings } = session;
  return useMemo(() => {
    if (!events) return undefined;
    const now = new Date();
    const snapshot = buildSnapshot({ events, user, settings, now });
    return buildRewards({
      events,
      now,
      timeZone: user.timeZone,
      streakBest: snapshot.streak.best,
    });
  }, [events, user, settings]);
}
