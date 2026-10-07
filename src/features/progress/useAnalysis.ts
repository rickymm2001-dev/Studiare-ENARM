// El análisis de respuestas del alumno listo para pintar. Carga el banco de lo que contestó y lo
// recalcula solo cuando cambian sus respuestas. undefined mientras carga.
import { useMemo } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { AppEvent } from '@/data/schemas/events';
import { studyDayOf } from '@/engines/studyDay';
import type { ReadySession } from '../shared/RequireSession';
import { useAnsweredBank } from '../shared/useAnsweredBank';
import { buildAnalysis, type Analysis } from './analysis';

export function useAnalysis(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): Analysis | undefined {
  const bank = useAnsweredBank(events);
  const { user, settings } = session;
  return useMemo(() => {
    if (events === undefined || bank === undefined) return undefined;
    return buildAnalysis({
      events,
      bank,
      timeZone: user.timeZone,
      today: studyDayOf(new Date(), user.timeZone),
      desiredRetention: settings.desiredRetention,
      thresholds: DEFAULT_THRESHOLDS,
    });
  }, [events, bank, user.timeZone, settings.desiredRetention]);
}
