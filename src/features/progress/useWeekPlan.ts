// La semana de Progreso lista para mostrar. Lee la suscripción para el límite de preguntas del
// plan Gratis y solo recalcula cuando cambian sus datos, porque proyectar mazos grandes cuesta.
// undefined mientras carga.
import { useMemo } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Card, Deck } from '@/data/schemas/decks';
import type { AppEvent } from '@/data/schemas/events';
import { reservedByStoredExam } from '../exam/examStorage';
import type { ReadySession } from '../shared/RequireSession';
import { useQuestionSource, useServerQuota } from '../shared/useQuestionSource';
import { buildWeekPlan, type WeekPlan } from './weekPlan';

export function useWeekPlan(
  session: ReadySession,
  events: readonly AppEvent[],
  content: { decks: readonly Deck[]; cards: readonly Card[] },
): WeekPlan | undefined {
  const api = useDataApi();
  const userId = session.user.id;
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(userId).then((value) => value ?? null),
    [api.repos, userId],
  );
  // Con el banco de la nube el tope de hoy cuenta también lo que dice el servidor (B11, 5.5)
  const serverQuota = useServerQuota(useQuestionSource());
  return useMemo(() => {
    if (subscription === undefined || serverQuota === undefined) return undefined;
    return buildWeekPlan({
      now: new Date(),
      session,
      events,
      decks: content.decks,
      cards: content.cards,
      subscription,
      reservedQuestions: reservedByStoredExam(userId),
      serverQuota,
    });
    // session cambia con el perfil, así que sus ajustes y sus minutos ya están cubiertos
  }, [subscription, serverQuota, session, events, content, userId]);
}
