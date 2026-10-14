// La rama de cada pregunta o tarjeta con un motivo de error, para el reparto de Progreso (B5). Solo
// carga esos elementos, que son pocos. Una pregunta trae su rama. Una tarjeta la toma del tema de su
// nota, que llevan las de Mis errores y las creadas con una pregunta, o de su mazo precargado.
import { useMemo } from 'react';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { DemoDeckFile } from '@/data/schemas/content';
import type { AppEvent } from '@/data/schemas/events';
import { topicTaxonomy } from '@/demo/content';
import { deckIds } from '@/demo/content/deckEntities';
import { deckBranch } from '../decks/deckBranch';
import { topicFromTags } from '../review/study';
import { motiveTargets } from './motivesView';

/** La rama troncal de cada subespecialidad */
const TOPIC_BRANCH: ReadonlyMap<string, string> = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, branch.key] as const),
  ),
);

/** undefined mientras carga */
export function useMotiveBranches(
  events: readonly AppEvent[] | undefined,
  catalog: readonly DemoDeckFile[] | undefined,
): ReadonlyMap<string, string> | undefined {
  const api = useDataApi();
  const targets = useMemo(() => motiveTargets(events ?? []), [events]);
  // La rama de las notas de los mazos precargados, que la traen del archivo y no en una etiqueta
  const catalogBranch = useMemo(
    () =>
      new Map(
        (catalog ?? []).flatMap((file) =>
          file.notes.map((note) => [deckIds.note(note.key), note.branch ?? deckBranch(file)]),
        ),
      ),
    [catalog],
  );
  return useLiveData(async () => {
    const branches = new Map<string, string>();
    for (const key of targets) {
      const [kind, id = ''] = key.split('|');
      if (kind === 'question') {
        // El reporte nombra la versión. Si nombra la pregunta estable se toma su última versión
        const question =
          (await api.repos.questions.get(id)) ?? (await api.repos.questions.latest(id));
        if (question) branches.set(key, question.branch);
        continue;
      }
      // Una tarjeta borrada después de marcar su motivo conserva su rama
      const card = await api.repos.cards.getRaw(id);
      const note = card ? await api.repos.notes.getRaw(card.noteId) : undefined;
      if (!note) continue;
      const topic = topicFromTags(note.tags);
      const branch = (topic ? TOPIC_BRANCH.get(topic) : undefined) ?? catalogBranch.get(note.id);
      if (branch) branches.set(key, branch);
    }
    return branches;
  }, [api.repos, targets.join(','), catalogBranch]);
}
