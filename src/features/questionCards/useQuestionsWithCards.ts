// Las preguntas con las que el alumno ya creó una tarjeta (B5, comentario 1). Junto a Crear
// tarjeta se avisa que ya hizo una, sin bloquear el botón, porque puede querer otra en otro mazo.
// Se lee de los eventos question_card_created, que solo se agregan, así que el aviso sobrevive a
// recargar. Sale de la base activa, la de demostración o la real, sin mezclarlas. Cuenta el ID
// estable de la pregunta, así una tarjeta hecha con una versión anterior también cuenta.
import { useRepositories } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';

/** Los IDs estables de las preguntas con las que el alumno ya creó una tarjeta */
export function questionsWithCards(events: readonly AppEvent[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'question_card_created') ids.add(event.payload.questionId);
  }
  return ids;
}

/** Reactivo, undefined mientras carga. Solo lee ese tipo de evento del alumno, que es poco */
export function useQuestionsWithCards(userId: string): ReadonlySet<string> | undefined {
  const repos = useRepositories();
  return useLiveData(
    async () =>
      questionsWithCards(await repos.events.query({ userId, types: ['question_card_created'] })),
    [repos, userId],
  );
}
