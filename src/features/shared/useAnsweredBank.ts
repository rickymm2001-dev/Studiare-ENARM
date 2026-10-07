// El banco de las preguntas que el alumno ya contestó, con sus opciones y casos. Lo usan Progreso y
// los widgets de análisis de Inicio. Solo carga lo que hace falta para analizar sus respuestas.
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { AppEvent } from '@/data/schemas/events';
import type { BankLookup } from '../progress/insightFacts';

export function useAnsweredBank(events: readonly AppEvent[] | undefined): BankLookup | undefined {
  const api = useDataApi();
  const ids = [
    ...new Set(
      (events ?? []).flatMap((event) =>
        event.type === 'question_answered' ? [event.payload.questionVersionId] : [],
      ),
    ),
  ];
  return useLiveData(async () => {
    const found = (await Promise.all(ids.map((id) => api.repos.questions.get(id)))).filter(
      (question) => question !== undefined,
    );
    const options = (
      await Promise.all(
        found.map((question) => api.repos.options.listForQuestionVersion(question.id)),
      )
    ).flat();
    const caseIds = [
      ...new Set(found.flatMap((question) => (question.caseId ? [question.caseId] : []))),
    ];
    const cases = (await Promise.all(caseIds.map((id) => api.repos.cases.get(id)))).filter(
      (item) => item !== undefined,
    );
    return {
      questions: new Map(found.map((question) => [question.id, question])),
      options: new Map(options.map((option) => [option.id, option])),
      cases: new Map(cases.map((item) => [item.id, item])),
    };
  }, [api.repos, ids.join(',')]);
}
