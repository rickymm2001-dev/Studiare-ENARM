// Retroalimentación (pantalla 5). Correcto o incorrecto, por qué atrae la opción elegida y su sesgo
// probable, explicación, referencias por verificar, causa del error y reporte para revisión médica.
import { CheckCircle2, Flag, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SessionHeader } from '@/app/layout/SessionHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import type { ContentReport } from '@/data/schemas/bank';
import { biasTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { ActionDock } from '@/ui/components/action-dock';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { DiscardReviewCard } from './DiscardReviewCard';
import { usePractice, type PracticeAnswer } from './practice';
import { NoActivePractice } from './QuestionScreen';
import { useQuestion, type QuestionBundle } from './useQuestion';

type Cause = keyof typeof t.review.causes;
type ReportReason = ContentReport['reason'];

const biasName = new Map(biasTaxonomy.biases.map((bias) => [bias.key, bias.name]));

export function FeedbackScreen() {
  return (
    <RequireSession screen="feedback">{(session) => <Feedback session={session} />}</RequireSession>
  );
}

function Feedback({ session }: { session: ReadySession }) {
  const practice = usePractice();
  const answer = practice.userId === session.user.id ? practice.answers.at(-1) : undefined;
  const bundle = useQuestion(answer?.questionVersionId);
  const header = (
    <SessionHeader
      title={t.screens.feedback.title}
      meta={
        answer ? (
          <span>{t.simulator.progress(practice.answers.length, practice.questionIds.length)}</span>
        ) : undefined
      }
      badges={<DemoContentLabel />}
    />
  );
  if (!answer) return <NoActivePractice header={header} />;
  if (bundle === undefined) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }
  if (bundle === null) return <NoActivePractice header={header} />;
  return (
    <>
      {header}
      <FeedbackBody
        key={answer.questionVersionId}
        bundle={bundle}
        answer={answer}
        session={session}
      />
    </>
  );
}

function FeedbackBody({
  bundle,
  answer,
  session,
}: {
  bundle: QuestionBundle;
  answer: PracticeAnswer;
  session: ReadySession;
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const practice = usePractice();
  const { question, options } = bundle;
  const [cause, setCause] = useState<Cause | null>(null);
  const [reason, setReason] = useState<ReportReason>('clinical_error');
  const [reported, setReported] = useState(false);
  const ctx = {
    userId: session.user.id,
    tz: session.user.timeZone,
    sessionId: practice.sessionId,
  };
  const chosen = options.find((option) => option.id === answer.optionVersionId);
  const correctOption = options.find((option) => option.isCorrect);
  const shown = answer.shownOptionIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option): option is NonNullable<typeof option> => option !== undefined);
  const isLast = practice.answers.length >= practice.questionIds.length;

  const reportCause = async (value: Cause) => {
    setCause(value);
    await api.recordEvent(
      createEvent(
        'cause_reported',
        { targetKind: 'question', targetId: question.id, cause: value },
        ctx,
      ),
    );
  };

  const submitReport = async () => {
    const report = await api.repos.contentReports.put({
      id: newId(),
      reporterId: session.user.id,
      targetKind: 'question',
      targetId: question.id,
      reason,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    });
    await api.recordEvent(
      createEvent(
        'report_submitted',
        { reportId: report.id, targetKind: 'question', targetId: question.id, reason },
        ctx,
      ),
    );
    setReported(true);
  };

  const next = () => {
    if (isLast) {
      void navigate(screenPath('sessionSummary'));
      return;
    }
    practice.set({ index: practice.answers.length });
    void navigate(screenPath('question'));
  };

  const causePicker = (
    <div className="mt-3 border-t border-line pt-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t.review.causeQuestion}</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(t.review.causes) as Cause[]).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={cause === value ? 'primary' : 'secondary'}
              aria-pressed={cause === value}
              disabled={cause !== null}
              onClick={() => {
                void reportCause(value);
              }}
            >
              {t.review.causes[value]}
            </Button>
          ))}
        </div>
      </fieldset>
    </div>
  );

  // En computadora el resultado va a la izquierda y la explicación a la derecha (D-078)
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        <Card aria-labelledby="resultado">
          <CardHeader>
            <CardTitle id="resultado" className="flex items-center gap-2">
              {answer.correct ? (
                <CheckCircle2 aria-hidden className="size-6 text-success" />
              ) : (
                <XCircle aria-hidden className="size-6 text-danger" />
              )}
              {answer.correct ? t.simulator.correct : t.simulator.incorrect}
              {answer.xp > 0 ? (
                <span className="text-sm font-normal text-fg-muted">
                  {t.review.xpGained(answer.xp)}
                </span>
              ) : null}
            </CardTitle>
            <CardDescription>{question.prompt}</CardDescription>
            {answer.sentToReview ? (
              <p className="mt-1 text-sm font-medium text-primary">{t.simulator.sentToReview}</p>
            ) : null}
          </CardHeader>
          <ul className="flex flex-col gap-2">
            {shown.map((option, position) => {
              const isChosen = option.id === answer.optionVersionId;
              const reveal = isChosen || option.isCorrect;
              return (
                <li
                  key={option.id}
                  className={cn(
                    'rounded-md border border-line p-3',
                    option.isCorrect && 'border-success bg-success-soft',
                    isChosen && !option.isCorrect && 'border-danger bg-danger-soft',
                  )}
                >
                  <p>
                    <span className="mr-1 font-semibold">
                      {String.fromCharCode(65 + position)}.
                    </span>
                    {option.text}
                    {isChosen ? (
                      <span className="ml-2 text-sm font-medium">({t.simulator.yourAnswer})</span>
                    ) : null}
                    {option.isCorrect ? (
                      <span className="ml-2 text-sm font-medium">
                        ({t.simulator.correctAnswer})
                      </span>
                    ) : null}
                  </p>
                  {reveal ? <p className="mt-1 text-sm text-fg-muted">{option.rationale}</p> : null}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="flex flex-col gap-3">
          {!answer.correct && chosen ? (
            <Card aria-labelledby="por-que-atrae">
              <CardHeader>
                <CardTitle id="por-que-atrae">{t.simulator.whyAttracts}</CardTitle>
                {chosen.biasTag ? (
                  <CardDescription>
                    {t.simulator.biasLabel(biasName.get(chosen.biasTag) ?? chosen.biasTag)}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <p>{chosen.rationale}</p>
              {causePicker}
            </Card>
          ) : null}

          <DiscardReviewCard
            shown={shown}
            eliminated={answer.eliminatedOptionIds}
            chosenId={answer.optionVersionId}
          />

          <Card aria-labelledby="explicacion">
            <CardHeader>
              <CardTitle id="explicacion">{t.simulator.explanation}</CardTitle>
            </CardHeader>
            <p className="whitespace-pre-line">
              {question.explanation || correctOption?.rationale}
            </p>
            {question.gpcRefs.length > 0 ? (
              <div className="mt-3">
                <p className="text-sm font-medium">{t.simulator.references}</p>
                <ul className="list-disc pl-5 text-sm text-fg-muted">
                  {question.gpcRefs.map((ref) => (
                    <li key={ref.title}>{ref.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!answer.correct && !chosen ? causePicker : null}
            {/* El reporte para revisión médica queda plegado para no ocupar una tarjeta entera */}
            <details className="mt-3 border-t border-line pt-3">
              <summary className="flex min-h-touch cursor-pointer items-center gap-2 text-sm font-medium text-fg-muted">
                <Flag aria-hidden className="size-4" />
                {t.simulator.report}
              </summary>
              {reported ? (
                <p role="status" className="text-sm">
                  {t.simulator.reported}
                </p>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <SelectField
                    label={t.simulator.report}
                    value={reason}
                    options={(Object.keys(t.simulator.reportReasons) as ReportReason[]).map(
                      (value) => ({
                        value,
                        label: t.simulator.reportReasons[value],
                      }),
                    )}
                    onChange={(event) => {
                      setReason(event.target.value as ReportReason);
                    }}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => {
                      void submitReport();
                    }}
                  >
                    <Flag aria-hidden />
                    {t.simulator.sendReport}
                  </Button>
                </div>
              )}
            </details>
          </Card>
        </div>
      </div>

      <ActionDock>
        <Button className="sm:self-start" onClick={next}>
          {isLast ? t.simulator.finish : t.simulator.next}
        </Button>
      </ActionDock>
    </div>
  );
}
