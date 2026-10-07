// Revisión del examen pregunta por pregunta. Ya terminó, así que cada pregunta muestra su
// retroalimentación completa. Por qué atrae cada opción y qué se podía descartar, qué eligió el
// alumno y qué descartó, y la explicación. Cada pregunta va plegada y se filtra por desenlace.
import { CheckCircle2, Flag, MinusCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { TOPIC_NAMES } from '../shared/topics';
import type { QuestionBundle } from '../simulator/useQuestion';
import { examOutcome, type ExamBundles, type ExamOutcome } from './examResults';
import { answerOf, type ExamState } from './examState';

type Filter = 'all' | 'missed' | 'blank' | 'marked';

interface Row {
  id: string;
  index: number;
  bundle: QuestionBundle;
  outcome: ExamOutcome;
  marked: boolean;
}

function rowsOf(state: ExamState, bundles: ExamBundles): Row[] {
  return state.questionIds.flatMap((id, index) => {
    const bundle = bundles.get(id);
    if (!bundle) return [];
    const answer = answerOf(state, id);
    const chosen = bundle.options.find((option) => option.id === answer.optionId);
    return [
      {
        id,
        index,
        bundle,
        outcome: examOutcome({ optionId: chosen?.id ?? null, correct: chosen?.isCorrect === true }),
        marked: answer.marked,
      },
    ];
  });
}

const OUTCOME_ICON = {
  correct: <CheckCircle2 aria-hidden className="size-5 shrink-0 text-success" />,
  missed: <XCircle aria-hidden className="size-5 shrink-0 text-danger" />,
  blank: <MinusCircle aria-hidden className="size-5 shrink-0 text-fg-muted" />,
} as const;

export function ExamReview({ state, bundles }: { state: ExamState; bundles: ExamBundles }) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = rowsOf(state, bundles);
  const visible = rows.filter((row) => {
    if (filter === 'missed') return row.outcome === 'missed';
    if (filter === 'blank') return row.outcome === 'blank';
    if (filter === 'marked') return row.marked;
    return true;
  });
  const text = t.examResults;

  return (
    <Card aria-labelledby="examen-revision">
      <CardHeader className="mb-3">
        <CardTitle id="examen-revision">{text.reviewTitle}</CardTitle>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <fieldset>
          <legend className="sr-only">{text.filterLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {(['all', 'missed', 'blank', 'marked'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                }}
                className={cn(
                  'min-h-9 rounded-full border-2 px-3 text-sm font-semibold transition-all',
                  filter === value
                    ? 'border-primary bg-primary-soft text-primary'
                    : 'border-line bg-surface hover:border-line-strong',
                )}
              >
                {text.filter[value]}
              </button>
            ))}
          </div>
        </fieldset>
        {visible.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.noMatches}</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {visible.map((row) => (
              <ReviewItem key={row.id} row={row} state={state} />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function ReviewItem({ row, state }: { row: Row; state: ExamState }) {
  const { bundle } = row;
  const { question, options, vignette } = bundle;
  const answer = answerOf(state, row.id);
  const text = t.examResults;
  // Las opciones en el orden que vio. Si no la vio, el set canónico
  const shownIds = state.shownOptions[row.id] ?? question.canonicalOptionIds;
  const shown = shownIds.flatMap((id) => {
    const option = options.find((candidate) => candidate.id === id);
    return option ? [option] : [];
  });
  const seconds = Math.round(answer.msSpent / 1000);

  return (
    <li>
      <details className="group rounded-lg border border-line">
        <summary className="flex min-h-touch cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
          {OUTCOME_ICON[row.outcome]}
          <span className="font-semibold">{text.questionN(row.index + 1)}</span>
          <span className="text-sm text-fg-muted">
            {text.outcome[row.outcome]} · {TOPIC_NAMES.get(question.topic) ?? question.topic}
          </span>
          {row.marked ? (
            <span className="flex items-center gap-1 text-sm text-warning">
              <Flag aria-hidden className="size-3.5 fill-warning" />
              {text.markedForReview}
            </span>
          ) : null}
          <span className="ml-auto text-sm text-fg-muted">{text.timeOn(seconds)}</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-line p-3">
          {vignette ? <p className="whitespace-pre-line text-sm">{vignette}</p> : null}
          <p className="font-medium">{question.prompt}</p>
          <ul className="flex flex-col gap-2">
            {shown.map((option, position) => {
              const chosen = answer.optionId === option.id;
              const discarded = answer.eliminated.includes(option.id);
              return (
                <li
                  key={option.id}
                  className={cn(
                    'rounded-md border border-line p-3',
                    option.isCorrect && 'border-success bg-success-soft',
                    chosen && !option.isCorrect && 'border-danger bg-danger-soft',
                  )}
                >
                  <p>
                    <span className="mr-1 font-semibold">
                      {String.fromCharCode(65 + position)}.
                    </span>
                    {option.text}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-3 text-sm font-medium">
                    {chosen ? <span>({text.yourAnswer})</span> : null}
                    {option.isCorrect ? <span>({text.correctAnswer})</span> : null}
                    {discarded ? (
                      <span className={option.isCorrect ? 'text-danger' : 'text-fg-muted'}>
                        ({option.isCorrect ? text.discardedCorrect : text.discarded})
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-sm text-fg-muted">{option.rationale}</p>
                </li>
              );
            })}
          </ul>
          {question.explanation ? (
            <div>
              <p className="text-sm font-semibold">{text.explanation}</p>
              <p className="text-sm whitespace-pre-line">{question.explanation}</p>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}
