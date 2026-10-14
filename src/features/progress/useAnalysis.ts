// El análisis de respuestas del alumno listo para pintar. Carga el banco de lo que contestó y las
// tarjetas de una materia libre, que Conócete deja fuera (B6), y lo recalcula solo cuando cambian.
// undefined mientras carga.
import { useMemo } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';
import { freeSubjectCardIds } from '@/data/usecases/outlines';
import { studyDayOf } from '@/engines/studyDay';
import type { ReadySession } from '../shared/RequireSession';
import { useAnsweredBank } from '../shared/useAnsweredBank';
import { buildAnalysis, type Analysis } from './analysis';

export function useAnalysis(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): Analysis | undefined {
  const api = useDataApi();
  const bank = useAnsweredBank(events);
  const freeSubjectCards = useLiveData(() => freeSubjectCardIds(api), [api.repos]);
  const { user, settings } = session;
  return useMemo(() => {
    if (events === undefined || bank === undefined || freeSubjectCards === undefined) {
      return undefined;
    }
    return buildAnalysis({
      events,
      bank,
      timeZone: user.timeZone,
      today: studyDayOf(new Date(), user.timeZone),
      desiredRetention: settings.desiredRetention,
      thresholds: DEFAULT_THRESHOLDS,
      freeSubjectCards,
    });
  }, [events, bank, freeSubjectCards, user.timeZone, settings.desiredRetention]);
}
