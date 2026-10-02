// Resumen de sesión (pantalla 6). Exactitud, XP, tiempo, exactitud por confianza y la lista de
// respuestas. Registra el fin de la sesión una sola vez.
import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { useLiveData } from '@/data/hooks';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { clock, formatDuration, usePractice, type McqConfidence } from './practice';
import { NoActivePractice } from './QuestionScreen';

export function SessionSummaryScreen() {
  return (
    <RequireSession screen="sessionSummary">
      {(session) => <Summary session={session} />}
    </RequireSession>
  );
}

function Summary({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const practice = usePractice();
  const mine = practice.userId === session.user.id && practice.answers.length > 0;
  const { answers } = practice;
  const prompts = useLiveData(
    async () =>
      new Map(
        (
          await Promise.all(
            answers.map((answer) => api.repos.questions.get(answer.questionVersionId)),
          )
        )
          .filter((question) => question !== undefined)
          .map((question) => [question.id, question.prompt]),
      ),
    [api.repos, answers],
  );

  useEffect(() => {
    const state = usePractice.getState();
    if (state.ended || state.userId !== session.user.id || state.answers.length === 0) return;
    const durationMs = Math.max(0, clock() - state.startedAt);
    state.set({ ended: true, startedAt: state.startedAt, index: state.answers.length });
    void api.recordEvent(
      createEvent(
        'session_ended',
        {
          kind: 'practice',
          reason: state.answers.length >= state.questionIds.length ? 'completed' : 'abandoned',
          items: state.answers.length,
          correct: state.answers.filter((answer) => answer.correct).length,
          durationMs,
          xp: state.answers.reduce((sum, answer) => sum + answer.xp, 0),
        },
        { userId: session.user.id, tz: session.user.timeZone, sessionId: state.sessionId },
      ),
    );
  }, [api, session.user.id, session.user.timeZone]);

  const header = (
    <ScreenHeader
      title={t.screens.sessionSummary.title}
      description={t.screens.sessionSummary.description}
      badges={<DemoContentLabel />}
    />
  );
  if (!mine) return <NoActivePractice header={header} />;

  const correct = answers.filter((answer) => answer.correct).length;
  const xp = answers.reduce((sum, answer) => sum + answer.xp, 0);
  const totalMs = answers.reduce((sum, answer) => sum + answer.msToAnswer, 0);
  const byConfidence = (['sure', 'unsure', 'guessed'] as McqConfidence[]).map((level) => {
    const group = answers.filter((answer) => answer.confidence === level);
    return { level, total: group.length, correct: group.filter((a) => a.correct).length };
  });

  return (
    <>
      {header}
      <Card aria-labelledby="resumen-titulo">
        <CardHeader>
          <CardTitle id="resumen-titulo">{t.simulator.summaryTitle}</CardTitle>
        </CardHeader>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat label={t.simulator.summaryAccuracy(correct, answers.length)}>
            {Math.round((correct / answers.length) * 100)}%
          </Stat>
          <Stat label={t.simulator.summaryXp(xp)}>+{xp}</Stat>
          <Stat label={t.simulator.summaryTime(formatDuration(totalMs))}>
            {formatDuration(totalMs)}
          </Stat>
        </dl>
        <h3 className="mt-4 font-medium">{t.simulator.byConfidence}</h3>
        <ul className="mt-1 flex flex-col gap-1 text-sm">
          {byConfidence
            .filter((row) => row.total > 0)
            .map((row) => (
              <li key={row.level}>
                {t.simulator.confidence[row.level]} ·{' '}
                {t.simulator.summaryAccuracy(row.correct, row.total)}
              </li>
            ))}
        </ul>
      </Card>

      <Card aria-labelledby="respuestas-titulo">
        <CardHeader>
          <CardTitle id="respuestas-titulo">{t.simulator.review}</CardTitle>
        </CardHeader>
        <ol className="flex flex-col gap-2">
          {answers.map((answer, index) => (
            <li key={answer.questionVersionId} className="flex items-start gap-2 text-sm">
              {answer.correct ? (
                <CheckCircle2
                  aria-label={t.simulator.correct}
                  className="size-5 shrink-0 text-success"
                />
              ) : (
                <XCircle
                  aria-label={t.simulator.incorrect}
                  className="size-5 shrink-0 text-danger"
                />
              )}
              <span>
                {index + 1}. {prompts?.get(answer.questionVersionId) ?? ''}{' '}
                <span className="text-fg-muted">({formatDuration(answer.msToAnswer)})</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to={screenPath('simulatorSetup')}>{t.simulator.again}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={screenPath('home')}>{t.screens.home.title}</Link>
        </Button>
      </div>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <dd className="text-2xl font-semibold">{children}</dd>
      <dt className="text-sm text-fg-muted">{label}</dt>
    </div>
  );
}
