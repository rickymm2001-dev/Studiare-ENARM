// Cuadrícula para ir a cualquier pregunta del examen. Muestra cuáles ya contestó, cuáles marcó para
// revisar y cuáles siguen en blanco. Va plegada para no ocupar lugar y se abre cuando hace falta. Los
// reactivos de la parte en inglés llevan un ícono y la palabra Inglés en su etiqueta accesible (B13, 3.5).
import { Flag, Languages } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { englishText } from '@/i18n/english';
import { cn } from '@/ui/cn';
import { Disclosure } from '@/ui/components/disclosure';
import { answeredCount, answerOf, markedCount, type ExamState } from './examState';

export function ExamNavigator({
  state,
  onGo,
  englishIds,
}: {
  state: ExamState;
  onGo: (index: number) => void;
  /** Los reactivos de la parte en inglés. Sin ellos no se marca ninguno */
  englishIds?: ReadonlySet<string>;
}) {
  return (
    <Disclosure
      title={t.exam.navigatorTitle}
      summary={t.exam.navigatorSummary(answeredCount(state), markedCount(state))}
    >
      <ol className="grid max-h-64 grid-cols-7 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-10 lg:grid-cols-14">
        {state.questionIds.map((id, index) => {
          const answer = answerOf(state, id);
          const isCurrent = index === state.current;
          const status = [
            isCurrent ? t.exam.status.current : null,
            answer.optionId !== null ? t.exam.status.answered : t.exam.status.blank,
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
                  'relative flex size-9 w-full items-center justify-center rounded-md border text-sm font-semibold',
                  answer.optionId !== null
                    ? 'border-indicator bg-primary-soft text-primary-ink'
                    : 'border-line bg-surface text-fg-muted hover:bg-muted',
                  isCurrent && 'ring-2 ring-indicator ring-offset-1 ring-offset-surface',
                )}
              >
                {index + 1}
                {answer.marked ? (
                  <Flag
                    aria-hidden
                    className="absolute -top-1 -right-1 size-3.5 fill-warning text-warning"
                  />
                ) : null}
                {englishIds?.has(id) ? (
                  <Languages
                    aria-hidden
                    className="absolute -right-1 -bottom-1 size-3.5 rounded-full bg-surface text-primary-ink"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3.5 rounded-sm border border-indicator bg-primary-soft"
          />
          {t.exam.legend.answered}
        </li>
        <li className="flex items-center gap-1.5">
          <Flag aria-hidden className="size-3.5 fill-warning text-warning" />
          {t.exam.legend.marked}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-3.5 rounded-sm border border-line bg-surface" />
          {t.exam.legend.blank}
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-3.5 rounded-sm border border-line bg-surface ring-2 ring-indicator"
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
    </Disclosure>
  );
}
