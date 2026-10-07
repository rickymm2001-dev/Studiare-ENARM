// Qué podía descartar el alumno en la pregunta que acaba de contestar y qué descartó (D-080). Enseña
// a contestar el examen sin saber la respuesta de memoria, que es manejar la frustración con lógica.
import { t } from '@/i18n/es-MX';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { discardReview } from './discard';
import type { QuestionBundle } from './useQuestion';

export function DiscardReviewCard({
  shown,
  eliminated,
  chosenId,
}: {
  /** Opciones en el orden en que se le mostraron */
  shown: QuestionBundle['options'];
  eliminated: readonly string[];
  chosenId: string | null;
}) {
  const review = discardReview({ shown, eliminated, chosenId });
  if (review.couldDiscard.length === 0 && !review.discardedCorrect) return null;
  const text = t.simulator.discardReview;
  const summary = review.discardedCorrect
    ? text.discardedCorrect
    : review.discardedWrong === review.wrongShown
      ? text.allDiscarded
      : review.discardedWrong > 0
        ? text.someDiscarded(review.discardedWrong, review.wrongShown)
        : text.noneDiscarded;
  const dropped = new Set(eliminated);

  return (
    <Card aria-labelledby="descarte">
      <CardHeader>
        <CardTitle id="descarte">{text.title}</CardTitle>
        <CardDescription
          className={review.discardedCorrect ? 'font-medium text-danger' : undefined}
        >
          {summary}
        </CardDescription>
      </CardHeader>
      <ul className="flex flex-col gap-2">
        {review.couldDiscard.map((id) => {
          const position = shown.findIndex((option) => option.id === id);
          const option = shown[position];
          if (!option) return null;
          return (
            <li key={id} className="rounded-md border border-line p-3">
              <p>
                <span className="mr-1 font-semibold">{String.fromCharCode(65 + position)}.</span>
                {option.text}
                {dropped.has(id) ? (
                  <span className="ml-2 text-sm font-medium text-fg-muted">
                    ({text.youDiscarded})
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-sm text-fg-muted">{option.rationale}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-fg-muted">{text.hint}</p>
    </Card>
  );
}
