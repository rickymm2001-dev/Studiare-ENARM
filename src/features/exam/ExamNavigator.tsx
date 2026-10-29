// Mapa del examen para ir a cualquier pregunta. Tarjeta crema con la rejilla de cinco columnas del
// diseño (D-150). Contestada en marino, marcada para revisar en durazno, pendiente en blanco con borde y
// la actual con borde cielo. En computadora va en el lateral de la pregunta y en el teléfono debajo. Con
// un examen largo la rejilla se desplaza dentro de la tarjeta. Los reactivos de la parte en inglés llevan
// un ícono y la palabra Inglés en su etiqueta accesible (B13, 3.5).
import { Flag, Languages } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { englishText } from '@/i18n/english';
import { cn } from '@/ui/cn';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { answeredCount, answerOf, markedCount, type ExamState } from './examState';

export function ExamNavigator({
  state,
  onGo,
  englishIds,
  className,
}: {
  state: ExamState;
  onGo: (index: number) => void;
  /** Los reactivos de la parte en inglés. Sin ellos no se marca ninguno */
  englishIds?: ReadonlySet<string>;
  className?: string;
}) {
  return (
    <Card
      tone="cream"
      lift={false}
      aria-labelledby="examen-mapa"
      className={cn('gap-3', className)}
    >
      <CardHeader className="mb-0 flex-row flex-wrap items-baseline justify-between gap-x-3">
        <CardTitle id="examen-mapa" className="text-lg">
          {t.exam.navigatorTitle}
        </CardTitle>
        <p className="text-sm text-fg-muted">
          {t.exam.navigatorSummary(answeredCount(state), markedCount(state))}
        </p>
      </CardHeader>
      <ol className="mt-3 grid max-h-72 grid-cols-5 gap-2 overflow-y-auto p-0.5 sm:grid-cols-10 xl:grid-cols-5">
        {state.questionIds.map((id, index) => {
          const answer = answerOf(state, id);
          const isCurrent = index === state.current;
          const answered = answer.optionId !== null;
          const status = [
            isCurrent ? t.exam.status.current : null,
            answered ? t.exam.status.answered : t.exam.status.blank,
            answer.marked ? t.exam.status.marked : null,
            englishIds?.has(id) ? englishText.exam.navigatorTag : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <li key={id}>
              <button
                type="button"
                aria-label={t.exam.goToQuestion(index + 1, status)}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={() => {
                  onGo(index);
                }}
                className={cn(
                  'relative flex min-h-11 w-full items-center justify-center rounded-md border-[1.5px] text-sm font-bold tabular-nums transition-colors',
                  answered
                    ? 'border-primary bg-primary text-primary-fg'
                    : 'border-line-strong bg-surface text-fg hover:bg-muted',
                  answer.marked && 'border-accent bg-accent-soft text-accent-ink',
                  isCurrent && 'border-2 border-indicator bg-primary-soft text-heading',
                )}
              >
                {index + 1}
                {answer.marked ? (
                  <Flag aria-hidden className="absolute top-1 right-1 size-3 fill-current" />
                ) : null}
                {englishIds?.has(id) ? (
                  <Languages
                    aria-hidden
                    className="absolute right-1 bottom-1 size-3.5 rounded-full bg-surface text-primary-ink"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm bg-primary" />
          {t.exam.legend.answered}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm border border-accent bg-accent-soft" />
          {t.exam.legend.marked}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-sm border border-line-strong bg-surface" />
          {t.exam.legend.blank}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3 rounded-sm border-2 border-indicator bg-primary-soft"
          />
          {t.exam.legend.current}
        </li>
        {englishIds && englishIds.size > 0 ? (
          <li className="flex items-center gap-1.5">
            <Languages aria-hidden className="size-3.5 text-primary-ink" />
            {englishText.exam.navigatorTag}
          </li>
        ) : null}
      </ul>
    </Card>
  );
}
