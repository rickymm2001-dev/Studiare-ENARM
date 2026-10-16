// Cómo vas frente a otros con sus datos (B14, 5.4 del plan de B14). Pone junto a la foto que publicó la noche
// lo que el alumno ya hizo, que se arma aquí, en su navegador. ProgressScreen lo carga en diferido, así lo
// de la comparación no pesa hasta que llega a esta tarjeta.
import { useMemo } from 'react';
import type { AppEvent } from '@/data/schemas/events';
import type { Question } from '@/data/schemas/bank';
import { useComparisonSnapshot } from '../model/modelSnapshots';
import type { ReadySession } from '../shared/RequireSession';
import { ComparisonCard } from './ComparisonCard';
import { comparisonFactsFrom } from './comparisonView';

export default function ComparisonSection({
  session,
  events,
  questions,
}: {
  session: ReadySession;
  events: readonly AppEvent[];
  /** Las preguntas que contestó, con su rama */
  questions: ReadonlyMap<string, Pick<Question, 'branch'>>;
}) {
  const state = useComparisonSnapshot(session.user.id);
  const facts = useMemo(() => comparisonFactsFrom(events, questions), [events, questions]);
  return <ComparisonCard state={state} facts={facts} />;
}
