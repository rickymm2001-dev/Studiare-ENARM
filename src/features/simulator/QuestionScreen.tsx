// Pregunta (pantalla 4). Caso clínico, opciones muestreadas, resaltado de negaciones en la frase de
// la pregunta (7.5), confianza antes de ver la respuesta, temporizador y registro de cada cambio.
import { Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent } from '@/data/schemas/events';
import { structureDictionary, topicTaxonomy } from '@/demo/content';
import { sampleOptions } from '@/engines/sampler';
import { findNegations, type HighlightRange } from '@/engines/structure';
import { awardXp } from '@/engines/xp';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { buildSnapshot } from '../home/snapshot';
import { volumeXpToday } from '../review/study';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
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

  const header = (
    <ScreenHeader
      title={t.screens.question.title}
      description={
        active ? t.simulator.progress(practice.index + 1, practice.questionIds.length) : undefined
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

/** Parte la frase en tramos normales y resaltados */
function HighlightedPrompt({ text, ranges }: { text: string; ranges: HighlightRange[] }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={index} className="rounded bg-warning-soft px-0.5 font-semibold text-fg">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
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
      sampleOptions({
        options: options.map((option) => ({
          id: option.id,
          isCorrect: option.isCorrect,
          biasTag: option.biasTag,
        })),
        canonicalOptionIds: question.canonicalOptionIds,
        mode: 'diverse',
        count: settings.optionsShown,
        seed: `${sessionId}|${question.id}`.slice(0, 64),
      }),
    [options, question, settings.optionsShown, sessionId],
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
    const answered = await api.recordEvent(
      createEvent(
        'question_answered',
        {
          questionVersionId: question.id,
          optionVersionId: selected,
          correct,
          confidence,
          msToAnswer,
          changeCount: changes,
          highlightEnabled,
        },
        ctx,
      ),
    );
    const allEvents = [...events, answered];
    const snapshot = buildSnapshot({ events: allEvents, user, settings, now: new Date() });
    const awards = awardXp({
      activity: {
        kind: 'mcq',
        correct,
        physicianDifficulty: question.physicianDifficulty,
        eventId: answered.id,
      },
      streakDays: snapshot.streak.current,
      volumeXpToday: volumeXpToday(allEvents, snapshot.today),
    });
    let xp = 0;
    for (const award of awards) {
      await api.recordEvent(createEvent('xp_awarded', award, ctx));
      xp += award.amount;
    }
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
        },
      ],
    });
    void navigate(screenPath('feedback'));
  };

  return (
    <Card aria-labelledby="pregunta-frase" className="w-full max-w-reading">
      <CardHeader>
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

      <fieldset className="mt-4 flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t.simulator.confidenceQuestion}</legend>
        <div className="flex flex-wrap gap-2">
          {(['guessed', 'unsure', 'sure'] as const).map((level) => (
            <Button
              key={level}
              variant={confidence === level ? 'primary' : 'secondary'}
              aria-pressed={confidence === level}
              onClick={() => {
                setConfidence(level);
              }}
            >
              {t.simulator.confidence[level]}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          className="self-start"
          disabled={!selected || !confidence || busy}
          onClick={() => {
            void answer();
          }}
        >
          {t.simulator.answer}
        </Button>
        {!selected || !confidence ? (
          <CardDescription>{t.simulator.chooseFirst}</CardDescription>
        ) : null}
      </div>
    </Card>
  );
}
