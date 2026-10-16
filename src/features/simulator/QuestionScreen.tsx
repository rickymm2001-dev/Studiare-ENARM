// Pregunta (pantalla 4). Caso clínico, opciones muestreadas, resaltado de negaciones en la frase de
// la pregunta (7.5), temporizador y registro de cada cambio. Se contesta con el teclado o con el
// ratón sin recorrer la pantalla, y la confianza previa es opcional y viene apagada (D-087).
// Una pregunta de Inglés médico (B13, 2.3) usa siempre el diseño de lectura. El texto fijo a la izquierda
// en computadora y arriba, plegable desde la segunda pregunta del caso, en el teléfono. El texto, la
// pregunta y las opciones van en inglés (lang="en") con su fuente bajo el texto, y la interfaz sigue en
// español. Además del reloj se ve el tiempo sugerido del texto y, si el alumno se pasa, una línea de
// aviso. No detiene nada.
import { Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { SessionHeader } from '@/app/layout/SessionHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent } from '@/data/schemas/events';
import { structureDictionary, topicTaxonomy } from '@/demo/content';
import { findNegations } from '@/engines/structure';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { ActionDock } from '@/ui/components/action-dock';
import { BranchBadge } from '@/ui/components/branch-tag';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useShortcuts } from '../shared/useShortcuts';
import { useUserEvents } from '../shared/useUserEvents';
import { useVisibilityLog } from '../shared/useVisibilityLog';
import { sendErrorsToReview } from '../review/sendErrors';
import { recordAnswerWithXp } from './answerXp';
import { HighlightedPrompt } from './HighlightedPrompt';
import { OptionChoice } from './OptionChoice';
import { correctPositionCounts, sampleForQuestion } from './optionSampling';
import { secondsOnText, secondsOverSuggested, suggestedMsForText } from './passageTiming';
import { clock, formatDuration, usePractice, type McqConfidence } from './practice';
import { PassageTimeAdvice, ReadingPassage } from './ReadingPassage';
import { useQuestion, type QuestionBundle } from './useQuestion';
import { usePassageGroup, type PassageGroup } from './usePassageGroup';

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
  const currentId = active ? practice.questionIds[practice.index] : undefined;
  const bundle = useQuestion(currentId);
  const events = useUserEvents(session.user.id);
  // Una pregunta de lectura en inglés necesita saber en qué lugar de su texto va (B13, 2.3)
  const reading = bundle?.question.language === 'en';
  const group = usePassageGroup(
    practice.questionIds,
    practice.index,
    reading ? bundle.question.caseId : null,
  );
  useVisibilityLog({
    userId: session.user.id,
    timeZone: session.user.timeZone,
    sessionId: active ? practice.sessionId : null,
  });
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
    />
  );
  // Con la retroalimentación al final, contestar la última lleva directo al resumen
  if (
    !active &&
    practice.sessionId !== null &&
    practice.userId === session.user.id &&
    practice.answers.length > 0 &&
    practice.index >= practice.questionIds.length
  ) {
    return <Navigate to={screenPath('sessionSummary')} replace />;
  }
  if (!active) return <NoActivePractice header={header} />;
  // Mientras carga la siguiente, useLiveData conserva la pregunta que ya se contestó. Sin esto se
  // quedaba un momento bajo el número de la siguiente, con su botón apagado
  const stale = bundle != null && bundle.question.id !== currentId;
  const groupPending = reading && group?.index !== practice.index;
  if (bundle === undefined || events === undefined || stale || groupPending) {
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
      <QuestionCard
        key={bundle.question.id}
        bundle={bundle}
        session={session}
        events={events}
        group={reading ? (group ?? null) : null}
      />
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
  group,
}: {
  bundle: QuestionBundle;
  session: ReadySession;
  events: AppEvent[];
  /** En qué lugar de su texto va. Solo en las preguntas de lectura en inglés (B13) */
  group: PassageGroup | null;
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
        targetTags: practice.targetTags,
        // La correcta se reparte parejo entre las posiciones de las preguntas de esta práctica
        correctPositionCounts: correctPositionCounts(
          practice.answers.map((previous) => previous.correctPosition),
          Math.min(settings.optionsShown, options.length),
        ),
      }),
    [
      options,
      question,
      settings.optionsShown,
      sessionId,
      practice.duelId,
      practice.targetTags,
      practice.answers,
    ],
  );
  const shown = sample.shown.map(
    (entry) => options.find((option) => option.id === entry.optionId) as (typeof options)[number],
  );
  // El texto, la pregunta y las opciones de Inglés médico van en inglés. El resaltado usa sus negaciones
  const english = question.language === 'en';
  const ranges = highlightEnabled
    ? findNegations(question.prompt, structureDictionary, english ? 'en' : 'es')
    : [];
  const lang = english ? 'en' : undefined;
  // Tiempo sugerido del texto. Cuándo se mostró su primera pregunta lo guarda la práctica, y esa misma
  // pregunta lo fija ahora. Si el alumno recarga a la mitad del texto se conserva
  const secondsPerItem =
    practice.secondsPerItem > 0
      ? practice.secondsPerItem
      : DEFAULT_THRESHOLDS.english.secondsPerItem;
  const [textStartedAt] = useState(() =>
    english && (group === null || group.position === 0) ? clock() : practice.caseStartedAt,
  );
  const [now, setNow] = useState(() => clock());
  const textSize = group?.size ?? 1;
  const suggestedMs = suggestedMsForText(textSize, secondsPerItem);

  const [selected, setSelected] = useState<string | null>(null);
  // Opciones que tachó. Descartar no cambia la respuesta, solo ayuda a pensar (D-080)
  const [eliminated, setEliminated] = useState<string[]>([]);
  // Solo se pregunta si la persona lo encendió. Contestar no lo exige
  const [confidence, setConfidence] = useState<McqConfidence | null>(null);
  const [changes, setChanges] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(0);
  const logged = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // La región del texto de una pregunta de lectura, que va antes del enunciado
  const passageRef = useRef<HTMLDivElement>(null);
  const feedbackAtEnd = settings.practiceFeedback === 'end';
  const isLast = practice.index + 1 >= practice.questionIds.length;

  const ctx = { userId: user.id, tz: user.timeZone, sessionId };

  useEffect(() => {
    shownAt.current = clock();
    // Al pasar a la siguiente pregunta el foco va al enunciado, para que el lector de pantalla lo
    // lea y el teclado siga desde ahí. Al empezar un texto nuevo de inglés, que va antes del enunciado,
    // va al texto, y el enunciado se lee después. En las demás preguntas del texto, al enunciado
    if (practice.index > 0) {
      const newText = english && (group === null || group.position === 0);
      (newText ? (passageRef.current ?? titleRef.current) : titleRef.current)?.focus();
    }
    // La primera pregunta de un texto abre su tiempo sugerido. Las demás siguen el mismo reloj
    if (english && (group === null || group.position === 0)) {
      usePractice.getState().set({ caseStartedAt: textStartedAt });
    }
    const timer = window.setInterval(() => {
      setElapsed(clock() - shownAt.current);
      setNow(clock());
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
    // Elegir una opción tachada la vuelve a incluir
    setEliminated((current) => current.filter((id) => id !== optionId));
  };

  const toggleDiscard = (optionId: string) => {
    if (optionId === selected) return;
    setEliminated((current) =>
      current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
    );
  };

  const answer = async (picked: string | null = selected) => {
    if (!picked || busy) return;
    setBusy(true);
    const msToAnswer = Math.max(0, clock() - shownAt.current);
    const chosen = options.find((option) => option.id === picked);
    const correct = chosen?.isCorrect === true;
    const { xp } = await recordAnswerWithXp({
      api,
      user,
      settings,
      ctx,
      payload: {
        questionVersionId: question.id,
        optionVersionId: picked,
        correct,
        confidence,
        msToAnswer,
        changeCount: changes,
        highlightEnabled,
        ...(eliminated.length > 0 ? { eliminatedOptionVersionIds: eliminated } : {}),
      },
      physicianDifficulty: question.physicianDifficulty,
      events,
    });
    // Un fallo pasa al repaso en segundo plano, para no frenar la siguiente pregunta mientras se
    // arma la tarjeta. Si no se puede guardar la práctica sigue, porque la respuesta ya quedó en la
    // bitácora. Cuando termina se marca la respuesta para que el resumen lo diga
    if (!correct && settings.errorsToReview) {
      void sendErrorsToReview(api, user, settings, [{ bundle, chosenOptionId: picked }]).then(
        () => {
          usePractice.setState((state) => ({
            answers: state.answers.map((entry) =>
              entry.questionVersionId === question.id ? { ...entry, sentToReview: true } : entry,
            ),
          }));
        },
        () => undefined,
      );
    }
    practice.set({
      answers: [
        ...practice.answers,
        {
          questionVersionId: question.id,
          optionVersionId: picked,
          correct,
          confidence,
          msToAnswer,
          xp,
          shownOptionIds: shown.map((option) => option.id),
          eliminatedOptionIds: eliminated,
          correctPosition: sample.correctPosition,
          sentToReview: false,
        },
      ],
      // Con la retroalimentación al final se pasa directo a la siguiente pregunta
      ...(feedbackAtEnd ? { index: practice.index + 1 } : {}),
    });
    void navigate(
      screenPath(feedbackAtEnd ? (isLast ? 'sessionSummary' : 'question') : 'feedback'),
    );
  };

  // Teclado. Letras o números eligen, Mayús con la letra descarta y Enter responde
  const keys: Record<string, () => void> = {
    enter: () => {
      void answer();
    },
  };
  shown.forEach((option, position) => {
    const letter = String.fromCharCode(97 + position);
    keys[letter] = () => {
      choose(option.id);
    };
    keys[`shift+${letter}`] = () => {
      toggleDiscard(option.id);
    };
    if (position < 9) {
      keys[String(position + 1)] = () => {
        choose(option.id);
      };
    }
  });
  useShortcuts(keys, !busy);

  const ready = selected !== null;
  const answerLabel = !feedbackAtEnd
    ? t.simulator.answer
    : isLast
      ? t.simulator.answerAndFinish
      : t.simulator.answerAndNext;
  // Con caso clínico, en computadora el caso va a la izquierda y las opciones a la derecha, así
  // ninguna línea pasa de unos 75 caracteres. Sin caso, la pregunta va en una columna de lectura. Una
  // pregunta de lectura en inglés usa siempre las dos columnas, con el texto fijo a la izquierda y la
  // pregunta y las opciones a la derecha
  const twoColumns = Boolean(vignette) || english;
  const prompt = (
    <CardTitle
      id="pregunta-frase"
      ref={titleRef}
      tabIndex={-1}
      lang={lang}
      className={cn(
        'text-lg leading-snug focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus',
        english ? 'mb-3' : 'mt-3',
      )}
    >
      <HighlightedPrompt text={question.prompt} ranges={ranges} />
    </CardTitle>
  );
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
          {/* Rama y tema pueden ser largos, así que la etiqueta sí parte en renglones. Va en el
              color de la rama (D-128) */}
          <BranchBadge branch={question.branch} className="whitespace-normal">
            {t.branchNames[question.branch] ?? question.branch} ·{' '}
            {topicName.get(question.topic) ?? question.topic}
          </BranchBadge>
          <span className="flex items-center gap-1" aria-live="off">
            <Timer aria-hidden className="size-4" />
            {t.simulator.elapsed(formatDuration(elapsed))}
          </span>
        </div>
        {english ? (
          <div className="mt-2 flex flex-col gap-2">
            <PassageTimeAdvice
              position={group?.position ?? 0}
              size={textSize}
              suggestedSeconds={suggestedMs / 1000}
              onTextSeconds={secondsOnText({ startedAt: textStartedAt, now })}
              overSeconds={secondsOverSuggested({ startedAt: textStartedAt, now, suggestedMs })}
            />
            <ReadingPassage
              text={vignette}
              refs={question.gpcRefs}
              fold={(group?.position ?? 0) > 0 ? 'phone' : 'never'}
              scrollable
              regionRef={passageRef}
            />
          </div>
        ) : vignette ? (
          <div className="mt-2 rounded-md bg-muted p-3">
            <p className="eyebrow mb-1 text-fg-muted">{t.simulator.caseLabel}</p>
            <p className="whitespace-pre-line">{vignette}</p>
          </div>
        ) : null}
        {english ? null : prompt}
      </CardHeader>

      <div className="flex flex-col">
        {english ? prompt : null}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-fg-muted">
            <span className="sr-only">{t.simulator.options}. </span>
            {t.choice.optionsHint}
          </legend>
          <ul className="flex flex-col gap-2">
            {shown.map((option, position) => (
              <OptionChoice
                key={option.id}
                name="opcion"
                letter={String.fromCharCode(65 + position)}
                text={option.text}
                lang={lang}
                selected={selected === option.id}
                discarded={eliminated.includes(option.id)}
                onChoose={() => {
                  choose(option.id);
                }}
                onToggleDiscard={() => {
                  toggleDiscard(option.id);
                }}
                onActivate={() => {
                  void answer(option.id);
                }}
              />
            ))}
          </ul>
        </fieldset>

        {/* Responder queda pegado a las opciones y siempre en el mismo lugar. En el teléfono va fijo
            arriba de la navegación (D-078 y D-087) */}
        <ActionDock className="mt-3 -mx-4 -mb-4 rounded-b-xl px-4 lg:mt-4 lg:mb-0 lg:rounded-none">
          {settings.cardConfidenceStep ? (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">{t.simulator.confidenceQuestion}</legend>
              <div className="flex flex-wrap items-center gap-2">
                {(['guessed', 'unsure', 'sure'] as const).map((level) => (
                  <Button
                    key={level}
                    className="flex-1 px-3 sm:flex-none"
                    variant={confidence === level ? 'primary' : 'secondary'}
                    aria-pressed={confidence === level}
                    onClick={() => {
                      setConfidence(confidence === level ? null : level);
                    }}
                  >
                    {t.simulator.confidence[level]}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : null}
          <Button
            className="w-full lg:w-auto lg:self-start"
            size="lg"
            aria-keyshortcuts="Enter"
            disabled={!ready || busy}
            onClick={() => {
              void answer();
            }}
          >
            {answerLabel}
          </Button>
          <KeyHint>
            <Kbd>A</Kbd> a <Kbd>{String.fromCharCode(64 + shown.length)}</Kbd>{' '}
            {t.simulator.keys.choose} · <Kbd>{t.simulator.keys.shift}</Kbd> +{' '}
            {t.simulator.keys.letter} {t.simulator.keys.discard} · <Kbd>Enter</Kbd>{' '}
            {t.simulator.keys.answer} · {t.simulator.keys.doubleClick}
          </KeyHint>
        </ActionDock>
      </div>
    </Card>
  );
}
