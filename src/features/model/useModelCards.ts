// Las tarjetas de los mazos que sigue el alumno, listas para el modelo (B14, 4.1 del plan de B14). Cada una
// lleva el tema de su nota y su último estado de repaso, y quedan fuera las suspendidas, igual que en la
// carga futura. El tema sale de la etiqueta topic: de la nota (Mis errores, apuntes y tarjetas propias) o, en
// las notas de los mazos precargados, del catálogo de mazos. El catálogo pesa unos 2 MB, así que solo se
// baja si el alumno tiene tarjetas precargadas y sin frenar el modelo: mientras llega, esas tarjetas no
// tienen tema y el modelo se vuelve a calcular cuando llega.
import { useEffect, useMemo, useState } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';
import { deckIds } from '@/demo/content/deckEntities';
import type { ModelCard } from '@/engines/studentModel';
import { suspendedCardIds } from '@/engines/suspension';
import { followedDeckIds } from '../decks/followed';
import { loadCatalog } from '../decks/useDeckCatalog';
import { latestCardStates, topicFromTags } from '../review/study';
import type { ReadySession } from '../shared/RequireSession';

/** El tema de cada nota de los mazos precargados, por el ID de la nota. undefined mientras llega */
function useCatalogTopics(needed: boolean): ReadonlyMap<string, string> | undefined {
  const [topics, setTopics] = useState<ReadonlyMap<string, string>>();
  useEffect(() => {
    if (!needed) return;
    let alive = true;
    void loadCatalog().then((catalog) => {
      if (!alive) return;
      setTopics(
        new Map(
          catalog.flatMap((file) =>
            file.notes.flatMap((note) =>
              note.topic === null ? [] : [[deckIds.note(note.key), note.topic] as const],
            ),
          ),
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [needed]);
  return topics;
}

/** undefined mientras carga. Sin mazos que seguir, una lista vacía */
export function useModelCards(
  session: ReadySession,
  events: readonly AppEvent[] | undefined,
): ModelCard[] | undefined {
  const api = useDataApi();
  const content = useLiveData(async () => {
    const [decks, cards, notes] = await Promise.all([
      api.repos.decks.list(),
      api.repos.cards.list(),
      api.repos.notes.list(),
    ]);
    return { decks, cards, notes };
  }, [api.repos]);
  const preloaded = content?.notes.some((note) => note.origin === 'preloaded') ?? false;
  const catalogTopics = useCatalogTopics(preloaded);
  return useMemo(() => {
    if (content === undefined || events === undefined) return undefined;
    const followed = followedDeckIds(session, content.decks);
    const suspended = suspendedCardIds(events);
    const states = latestCardStates(events);
    const noteById = new Map(content.notes.map((note) => [note.id, note]));
    return content.cards
      .filter((card) => followed.has(card.deckId) && !suspended.has(card.id))
      .map((card) => ({
        topic: catalogTopics?.get(card.noteId) ?? topicFromTags(noteById.get(card.noteId)?.tags),
        state: states.get(card.id) ?? null,
      }));
  }, [content, events, session, catalogTopics]);
}
