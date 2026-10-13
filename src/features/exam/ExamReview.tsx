// Revisión del examen pregunta por pregunta. Ya terminó, así que cada pregunta muestra su
// retroalimentación completa. Por qué atrae cada opción y qué se podía descartar, qué eligió el
// alumno y qué descartó, y la explicación. Cada pregunta va plegada y se filtra por desenlace. Las
// preguntas son filas de una lista y no cajas dentro de la tarjeta (H06 de la revisión de B2). Cada
// pregunta se puede volver tarjeta y en cada fallada se marca por qué falló, con los siete motivos
// de Ricardo, opcional y cambiable (B5, comentarios 1 y 2).
import { CheckCircle2, ChevronDown, Flag, MinusCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useDataApi } from '@/data/context';
import type { AppEvent } from '@/data/schemas/events';
import { latestMotive } from '@/engines/errorCauses';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { SegmentedControl } from '@/ui/components/segmented';
import { CreateCardButton } from '../questionCards/CreateCardDialog';
import { MotivePicker } from '../shared/MotivePicker';
import { reportMotive, useMotiveReports } from '../shared/motives';
import type { ReadySession } from '../shared/RequireSession';
import { TOPIC_NAMES } from '../shared/topics';
import type { QuestionBundle } from '../simulator/useQuestion';
import { examOutcome, type ExamBundles, type ExamOutcome } from './examResults';
import { answerOf, type ExamState } from './examState';

type Filter = 'all' | 'missed' | 'blank' | 'marked';

const FILTERS: readonly Filter[] = ['all', 'missed', 'blank', 'marked'];

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

export function ExamReview({
  state,
  bundles,
  session,
}: {
  state: ExamState;
  bundles: ExamBundles;
  session: ReadySession;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  // Los motivos se leen una vez para toda la lista, no una vez por pregunta
  const reports = useMotiveReports(session.user.id);
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
        <SegmentedControl
          label={text.filterLabel}
          options={FILTERS.map((value) => ({ value, label: text.filter[value] }))}
          value={filter}
          onChange={setFilter}
          itemClassName="grow"
        />
        {visible.length === 0 ? (
          <p className="text-sm text-fg-muted">{text.noMatches}</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {visible.map((row) => (
              <ReviewItem
                key={row.id}
                row={row}
                state={state}
                session={session}
                reports={reports}
              />
            ))}
          </ol>
        )}
      </div>
    </Card>
  );
}

function ReviewItem({
  row,
  state,
  session,
  reports,
}: {
  row: Row;
  state: ExamState;
  session: ReadySession;
  reports: readonly AppEvent[] | undefined;
}) {
  const api = useDataApi();
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
      <details className="group">
        {/* Toda la fila abre la pregunta. El fondo al pasar el ratón sale un poco del texto. En el
            teléfono el texto va en renglones y el tiempo siempre queda a la derecha */}
        <summary className="-mx-2 flex min-h-touch cursor-pointer list-none items-center gap-3 rounded-md px-2 py-2 hover:bg-muted [&::-webkit-details-marker]:hidden">
          {OUTCOME_ICON[row.outcome]}
          <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
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
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm text-fg-muted">
            {text.timeOn(seconds)}
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="flex flex-col gap-3 pt-1 pb-4">
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
          <div className="flex flex-col gap-3 border-t border-line pt-3">
            {row.outcome === 'missed' ? (
              <MotivePicker
                // Vale el último motivo que marcó desde que empezó este examen
                value={latestMotive(
                  reports ?? [],
                  { kind: 'question', ids: [question.id, question.questionId] },
                  new Date(state.startedAtMs).toISOString(),
                )}
                onChange={(motive) =>
                  reportMotive(api, session.user, { kind: 'question', id: question.id }, motive)
                }
              />
            ) : null}
            <CreateCardButton
              session={session}
              bundle={bundle}
              from="exam_review"
              label={t.examReview.createCard.buttonLabel(String(row.index + 1))}
            />
          </div>
        </div>
      </details>
    </li>
  );
}
