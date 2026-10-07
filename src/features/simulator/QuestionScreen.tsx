// Pregunta (pantalla 4). Caso clínico, opciones muestreadas, resaltado de negaciones en la frase de
// la pregunta (7.5), confianza antes de ver la respuesta, temporizador y registro de cada cambio.
import { Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { SessionHeader } from '@/app/layout/SessionHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent } from '@/data/schemas/events';
import { structureDictionary, topicTaxonomy } from '@/demo/content';
import { findNegations } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { ActionDock } from '@/ui/components/action-dock';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { sendErrorsToReview } from '../review/sendErrors';
import { recordAnswerWithXp } from './answerXp';
import { HighlightedPrompt } from './HighlightedPrompt';
import { sampleForQuestion } from './optionSampling';
import { clock, formatDuration, usePractice, type McqConfidence } from './practice';
import { useQuestion, type QuestionBundle } from './useQuestion';

const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);

export function QuestionScreen() {
  return (
    <RequireSession screen="question">{(session) => <Practice session={session} />}</RequireSession>
  );
}

function Practice({ session }: { session: ReadySession }) {
  const practice = usePractice();
  const active =
    practice.sessionId !== null &&
    practice.userId === session.user.id &&
    practice.index < practice.questionIds.length;
  const bundle = useQuestion(active ? practice.questionIds[practice.index] : undefined);
  const events = useUserEvents(session.user.id);
  // Si el alumno regresa desde la retroalimentación, esta pregunta ya tiene respuesta y no se
  // contesta otra vez. Con el gesto de atrás se contaba doble y un duelo se cerraba sin la última
  if (
    practice.sessionId !== null &&
    practice.userId === session.user.id &&
    practice.answers.length > practice.index
  ) {
    return <Navigate to={screenPath('feedback')} replace />;
  }

  const header = (
    <SessionHeader
      title={t.screens.question.title}
      meta={
        active ? (
          <span>{t.simulator.progress(practice.index + 1, practice.questionIds.length)}</span>
        ) : undefined
      }
      badges={<DemoContentLabel />}
    />
  );
  if (!active) return <NoActivePractice header={header} />;
  if (bundle === undefined || events === undefined) {
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
      <QuestionCard key={bundle.question.id} bundle={bundle} session={session} events={events} />
    </>
  );
}

export function NoActivePractice({ header }: { header: React.ReactNode }) {
  return (
    <>
      {header}
      <Card>
        <CardHeader>
          <CardTitle>{t.simulator.noActive}</CardTitle>
        </CardHeader>
        <Button asChild className="self-start">
          <Link to={screenPath('simulatorSetup')}>{t.simulator.goSetup}</Link>
        </Button>
      </Card>
    </>
  );
}

function QuestionCard({
  bundle,
  session,
  events,
}: {
  bundle: QuestionBundle;
  session: ReadySession;
  events: AppEvent[];
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const practice = usePractice();
  const { question, options, vignette } = bundle;
  const { user, settings } = session;
  const sessionId = practice.sessionId as string;
  const highlightEnabled = settings.negationHighlightPractice;

  const sample = useMemo(
    () =>
      sampleForQuestion({
        options: options.map((option) => ({
          id: option.id,
          isCorrect: option.isCorrect,
          biasTag: option.biasTag,
        })),
        canonicalOptionIds: question.canonicalOptionIds,
        questionId: question.id,
        sessionId,
        duelId: practice.duelId,
        optionsShown: settings.optionsShown,
      }),
    [options, question, settings.optionsShown, sessionId, practice.duelId],
  );
  const shown = sample.shown.map(
    (entry) => options.find((option) => option.id === entry.optionId) as (typeof options)[number],
  );
  const ranges = highlightEnabled ? findNegations(question.prompt, structureDictionary) : [];

  const [selected, setSelected] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<McqConfidence | null>(null);
  const [changes, setChanges] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(0);
  const logged = useRef(false);

  const ctx = { userId: user.id, tz: user.timeZone, sessionId };

  useEffect(() => {
    shownAt.current = clock();
    const timer = window.setInterval(() => {
      setElapsed(clock() - shownAt.current);
    }, 1000);
    if (!logged.current) {
      logged.current = true;
      void api.recordEvent(
        createEvent(
          'question_shown',
          {
            questionVersionId: question.id,
            shownOptions: sample.shown.map((entry) => ({
              optionVersionId: entry.optionId,
              position: entry.position,
            })),
            seed: sample.seed,
            samplingMode: sample.mode,
            highlightEnabled,
            positionInSession: practice.index,
          },
          { userId: user.id, tz: user.timeZone, sessionId },
        ),
      );
    }
    return () => {
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se registra una vez por pregunta montada
  }, []);

  const choose = (optionId: string) => {
    if (optionId === selected) return;
    if (selected !== null) setChanges((value) => value + 1);
    void api.recordEvent(
      createEvent(
        'answer_changed',
        {
          questionVersionId: question.id,
          fromOptionVersionId: selected,
          toOptionVersionId: optionId,
          msSinceShown: Math.max(0, clock() - shownAt.current),
        },
        ctx,
      ),
    );
    setSelected(optionId);
  };

  const answer = async () => {
    if (!selected || !confidence || busy) return;
    setBusy(true);
    const msToAnswer = Math.max(0, clock() - shownAt.current);
    const chosen = options.find((option) => option.id === selected);
    const correct = chosen?.isCorrect === true;
    const { xp } = await recordAnswerWithXp({
      api,
      user,
      settings,
      ctx,
      payload: {
        questionVersionId: question.id,
        optionVersionId: selected,
        correct,
        confidence,
        msToAnswer,
        changeCount: changes,
        highlightEnabled,
      },
      physicianDifficulty: question.physicianDifficulty,
      events,
    });
    // Un fallo pasa al repaso al momento. Si la tarjeta no se puede guardar la práctica sigue,
    // porque la respuesta ya quedó en la bitácora
    const sentToReview =
      !correct &&
      settings.errorsToReview &&
      (await sendErrorsToReview(api, user, settings, [{ bundle, chosenOptionId: selected }]).then(
        () => true,
        () => false,
      ));
    practice.set({
      answers: [
        ...practice.answers,
        {
          questionVersionId: question.id,
          optionVersionId: selected,
          correct,
          confidence,
          msToAnswer,
          xp,
          shownOptionIds: shown.map((option) => option.id),
          sentToReview,
        },
      ],
    });
    void navigate(screenPath('feedback'));
  };

  const ready = selected !== null && confidence !== null;
  // Con caso clínico, en computadora el caso va a la izquierda y las opciones a la derecha, así
  // ninguna línea pasa de unos 75 caracteres. Sin caso, la pregunta va en una columna de lectura
  const twoColumns = Boolean(vignette);
  return (
    <Card
      aria-labelledby="pregunta-frase"
      className={cn(
        'w-full',
        twoColumns ? 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-6' : 'lg:max-w-reading',
      )}
    >
      <CardHeader className={twoColumns ? 'lg:sticky lg:top-4 lg:mb-0' : undefined}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
          <span
            className={`rounded-full px-2.5 py-0.5 font-semibold ${toneClasses(question.branch).chip}`}
          >
            {t.branchNames[question.branch] ?? question.branch} ·{' '}
            {topicName.get(question.topic) ?? question.topic}
          </span>
          <span className="flex items-center gap-1" aria-live="off">
            <Timer aria-hidden className="size-4" />
            {t.simulator.elapsed(formatDuration(elapsed))}
          </span>
        </div>
        {vignette ? (
          <div className="mt-2 rounded-md bg-muted p-3">
            <p className="mb-1 text-xs font-semibold uppercase text-fg-muted">
              {t.simulator.caseLabel}
            </p>
            <p className="whitespace-pre-line">{vignette}</p>
          </div>
        ) : null}
        <CardTitle id="pregunta-frase" className="mt-3 text-lg leading-snug">
          <HighlightedPrompt text={question.prompt} ranges={ranges} />
        </CardTitle>
      </CardHeader>

      <div className="flex flex-col">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t.simulator.options}</legend>
          {shown.map((option, position) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 hover:bg-muted',
                selected === option.id && 'border-primary bg-primary-soft',
              )}
            >
              <input
                type="radio"
                name="opcion"
                className="mt-1"
                checked={selected === option.id}
                onChange={() => {
                  choose(option.id);
                }}
              />
              <span>
                <span className="mr-1 font-semibold">{String.fromCharCode(65 + position)}.</span>
                {option.text}
              </span>
            </label>
          ))}
        </fieldset>

        {/* Confianza y responder, siempre a la mano en el teléfono (D-078) */}
        <ActionDock className="mt-3 -mb-4 rounded-b-xl lg:mt-4 lg:mb-0 lg:rounded-none">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">
              {t.simulator.confidenceQuestion}
              {ready ? null : (
                <span className="hidden font-normal text-fg-muted sm:inline">
                  {' '}
                  · {t.simulator.chooseFirst}
                </span>
              )}
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              {(['guessed', 'unsure', 'sure'] as const).map((level) => (
                <Button
                  key={level}
                  className="flex-1 px-3 sm:flex-none"
                  variant={confidence === level ? 'primary' : 'secondary'}
                  aria-pressed={confidence === level}
                  onClick={() => {
                    setConfidence(level);
                  }}
                >
                  {t.simulator.confidence[level]}
                </Button>
              ))}
              <Button
                className="basis-full sm:ml-auto sm:basis-auto lg:ml-0"
                disabled={!ready || busy}
                onClick={() => {
                  void answer();
                }}
              >
                {t.simulator.answer}
              </Button>
            </div>
          </fieldset>
        </ActionDock>
      </div>
    </Card>
  );
}
