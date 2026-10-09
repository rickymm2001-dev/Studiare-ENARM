// Vista de lectura de una pregunta del banco, con sus opciones, la etiqueta de cada distractor y la
// explicación. La usan el banco (17) y la bandeja de reportes (21). Editar se hace en la pantalla 18.
import { Link } from 'react-router';
import { Pencil } from 'lucide-react';
import { SCREENS } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import type { Question } from '@/data/schemas/bank';
import { biasTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

const biasName = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias.name]));

export function QuestionPreview({
  question,
  hideEdit = false,
}: {
  question: Question;
  /** Sin el enlace al editor, para pantallas que ya lo ofrecen */
  hideEdit?: boolean;
}) {
  const api = useDataApi();
  const options = useLiveData(
    () => api.repos.options.listForQuestionVersion(question.id),
    [api.repos, question.id],
  );
  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md bg-muted p-3 text-sm">
      {question.vignette ? <p>{question.vignette}</p> : null}
      <ol className="flex flex-col gap-1">
        {(options ?? []).map((option) => (
          <li key={option.id} className={option.isCorrect ? 'font-semibold' : undefined}>
            {option.text}
            {option.isCorrect ? ` · ${t.questionEditor.options.key}` : ''}
            {option.biasTag ? (
              <span className="ml-2 text-xs text-fg-muted">
                ({biasName.get(option.biasTag) ?? option.biasTag})
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-fg-muted">{question.explanation}</p>
      {hideEdit ? null : (
        <div>
          <Button asChild variant="secondary" size="sm">
            <Link to={`${SCREENS.questionEditor.path}?pregunta=${question.questionId}`}>
              <Pencil aria-hidden />
              {t.questionEditor.edit}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
