// El análisis de respuestas del alumno listo para pintar. Sale del modelo del alumno (useStudentModelState), el
// mismo que lee el Tutor, y se recalcula solo cuando cambian sus datos. Es la envoltura que usan Progreso y los
// widgets de Inicio desde antes de B14. undefined mientras carga.
import { useMemo } from 'react';
import type { AppEvent } from '@/data/schemas/events';
import { useStudentModelState } from '../model/useStudentModel';
import type { ReadySession } from '../shared/RequireSession';
import { analysisFrom, type Analysis } from './analysis';

export function useAnalysis(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): Analysis | undefined {
  const state = useStudentModelState(session, events);
  return useMemo(
    () =>
      state === undefined || events === undefined
        ? undefined
        : analysisFrom(state.build, events, state.bank),
    [state, events],
  );
}
