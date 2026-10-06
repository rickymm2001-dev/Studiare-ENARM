// Carga una versión de pregunta con sus opciones y la viñeta de su caso, si es seriada.
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { ClinicalCase, Option, Question } from '@/data/schemas/bank';

export interface QuestionBundle {
  question: Question;
  options: Option[];
  /** Viñeta del caso y la propia, en ese orden */
  vignette: string;
}

/** Arma el paquete de una pregunta. La viñeta del caso va antes que la propia */
export function buildBundle(
  question: Question,
  options: Option[],
  clinicalCase?: Pick<ClinicalCase, 'vignette'>,
): QuestionBundle {
  const vignette = [clinicalCase?.vignette, question.vignette]
    .filter((text): text is string => Boolean(text))
    .join('\n\n');
  return { question, options, vignette };
}

export function useQuestion(
  questionVersionId: string | undefined,
): QuestionBundle | null | undefined {
  const api = useDataApi();
  return useLiveData(async () => {
    if (!questionVersionId) return null;
    const question = await api.repos.questions.get(questionVersionId);
    if (!question) return null;
    const options = await api.repos.options.listForQuestionVersion(question.id);
    const clinicalCase = question.caseId ? await api.repos.cases.get(question.caseId) : undefined;
    return buildBundle(question, options, clinicalCase);
  }, [api.repos, questionVersionId]);
}
