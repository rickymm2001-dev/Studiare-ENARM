// Retroalimentación (pantalla 5). La ve quien eligió verla después de cada pregunta. Por defecto la
// retroalimentación llega al final de la sesión, en el resumen (D-087).
import { useNavigate } from 'react-router';
import { SessionHeader } from '@/app/layout/SessionHeader';
import { screenPath } from '@/app/screens';
import { t } from '@/i18n/es-MX';
import { ActionDock } from '@/ui/components/action-dock';
import { Button } from '@/ui/components/button';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useShortcuts } from '../shared/useShortcuts';
import { AnswerReview } from './AnswerReview';
import { usePractice, type PracticeAnswer } from './practice';
import { NoActivePractice } from './QuestionScreen';
import { useQuestion, type QuestionBundle } from './useQuestion';

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
  const navigate = useNavigate();
  const practice = usePractice();
  const isLast = practice.answers.length >= practice.questionIds.length;

  const next = () => {
    if (isLast) {
      void navigate(screenPath('sessionSummary'));
      return;
    }
    practice.set({ index: practice.answers.length });
    void navigate(screenPath('question'));
  };
  // Enter sigue a la siguiente pregunta sin buscar el botón (D-087)
  useShortcuts({ enter: next, space: next, n: next });

  return (
    <div className="flex w-full flex-col gap-3">
      <AnswerReview bundle={bundle} answer={answer} session={session} idPrefix="feedback" />
      <ActionDock>
        <Button className="sm:self-start" size="lg" aria-keyshortcuts="Enter Space" onClick={next}>
          {isLast ? t.simulator.finish : t.simulator.next}
        </Button>
        <KeyHint>
          <Kbd>Enter</Kbd> {t.simulator.keys.next}
        </KeyHint>
      </ActionDock>
    </div>
  );
}
