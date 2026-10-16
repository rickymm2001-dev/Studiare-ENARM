// El modelo del alumno listo para pintar (B14, 4.2 del plan de B14). Junta lo que el motor necesita (la bitácora, el
// banco que contestó, sus tarjetas, la dificultad que usa la app, la población y el vocabulario de sesgos) y
// lo calcula una sola vez por cambio, así Inicio, Progreso, Simular y el Tutor leen lo mismo. useAnalysis y
// useTutorView son envolturas de este hook para no tocar a todos los que ya los usan.
//
// useStudentModel(session) es el contrato con el modo adaptativo (paquete B): devuelve el modelo del
// contrato, o undefined mientras carga. useStudentModelState suma lo que las pantallas necesitan para
// pintar, que el contrato no trae.
import { useMemo } from 'react';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { StudentModel } from '@/data/model/contracts';
import type { AppEvent } from '@/data/schemas/events';
import { freeSubjectCardIds } from '@/data/usecases/outlines';
import { topicTaxonomy } from '@/demo/content';
import type { BankLookup } from '@/engines/insightFacts';
import { buildStudentModel, type StudentModelBuild } from '@/engines/studentModel';
import type { ReadySession } from '../shared/RequireSession';
import { useAnsweredBank } from '../shared/useAnsweredBank';
import { useBiasVocabulary } from '../shared/useBiasVocabulary';
import { useUserEvents } from '../shared/useUserEvents';
import { usePopulation } from './modelSnapshots';
import { useDifficultyOf } from './useDifficultyOf';
import { useModelCards } from './useModelCards';

export interface StudentModelState {
  build: StudentModelBuild;
  /** El banco de lo que contestó, con el que se calculó */
  bank: BankLookup;
}

/** El modelo con lo que hace falta para pintarlo. undefined mientras carga */
export function useStudentModelState(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): StudentModelState | undefined {
  const api = useDataApi();
  const bank = useAnsweredBank(events);
  const freeSubjectCards = useLiveData(() => freeSubjectCardIds(api), [api.repos]);
  const cards = useModelCards(session, events);
  const difficultyOf = useDifficultyOf(bank);
  const population = usePopulation();
  const vocabulary = useBiasVocabulary();
  const { user, settings } = session;
  return useMemo(() => {
    if (
      events === undefined ||
      bank === undefined ||
      freeSubjectCards === undefined ||
      cards === undefined ||
      difficultyOf === undefined
    ) {
      return undefined;
    }
    return {
      bank,
      build: buildStudentModel({
        now: new Date(),
        timeZone: user.timeZone,
        desiredRetention: settings.desiredRetention,
        events,
        bank,
        taxonomy: topicTaxonomy,
        thresholds: DEFAULT_THRESHOLDS,
        freeSubjectCards,
        cards,
        difficultyOf,
        population,
        vocabulary,
      }),
    };
  }, [
    events,
    bank,
    freeSubjectCards,
    cards,
    difficultyOf,
    population,
    vocabulary,
    user.timeZone,
    settings.desiredRetention,
  ]);
}

/** El modelo de una bitácora que la pantalla ya cargó */
export function useStudentModelBuild(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): StudentModelBuild | undefined {
  return useStudentModelState(session, events)?.build;
}

/** El modelo del contrato de B14. undefined mientras carga. Lo lee el modo adaptativo de Simular */
export function useStudentModel(session: ReadySession): StudentModel | undefined {
  const events = useUserEvents(session.user.id);
  return useStudentModelBuild(session, events)?.model;
}
