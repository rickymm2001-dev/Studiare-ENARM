// Armar tu simulador (pantalla 7). Desde D-150 sigue el diseño de Simular. Un solo formulario con el
// modo en tres tarjetas (Práctica, Examen, Dirigido), las ramas en chips con el color de su rama, las
// preguntas y el tiempo en segmentados píldora, la nota real del plan Gratis y el botón grande con el
// resumen de lo que va a empezar. En el lateral, con qué entrena la configuración de ahora y las últimas
// sesiones reales de la bitácora. Lo que el diseño no trae (dificultad, nivel cognitivo, estructura,
// modo adaptativo, cuándo llega la retroalimentación) va debajo en una tarjeta de más ajustes, y el
// examen completo, con sus propios ajustes, es lo que el formulario muestra en el modo Examen.
// El modo Dirigido es la práctica con las opciones dirigidas a las trampas del alumno (D-080). Mientras
// no hay errores suficientes dice calibrando y cuántos faltan, y la práctica corre con opciones variadas.
// Las preguntas salen de la fuente del alumno (B11, 5.1). Con el banco de la nube se eligen del catálogo
// y antes de empezar se bajan sus cuerpos. Si llega menos de lo pedido, la práctica arranca con lo
// concedido y el marco de la app dice por qué. El tope de Gratis es el menor entre lo que cuenta la app
// y lo que cuenta el servidor, y en un plan de pago el freno del servidor se avisa con su hora.
// La práctica en español deja fuera el inglés siempre (B13, 2.8). Los casos de lectura en inglés tienen
// su tarjeta aparte, debajo, si la bandera medicalEnglish está prendida.
// Los filtros de dificultad usan la dificultad efectiva (B14, 4.4), la que calculó la noche con las
// respuestas de otros alumnos y, si no hay, la del médico. La casilla Adaptativo (B14, 4.5) elige
// preguntas cerca del nivel del alumno cuando lo que eligió tiene suficientes preguntas calibradas, y no
// cambia el tope de preguntas que da el plan.
import { Activity, Clock, Play, RefreshCw } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { isFeatureEnabled } from '@/config/featureFlags';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { useLiveData } from '@/data/hooks';
import { effectiveLevel, poolDifficulty } from '@/data/bank/calibration';
import { COGNITIVE_GROUPS, cognitiveGroupOf, type CognitiveGroup } from '@/engines/bloom';
import { brakeUntil, shortfallReason } from '@/data/bank/quota';
import { readStoredModel } from '@/data/usecases/modelCloud';
import { adaptiveAvailability } from '@/engines/adaptive';
import { EXAM_SECONDS_PER_QUESTION } from '@/engines/exam';
import { adaptiveTexts } from '@/i18n/adaptive';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { Disclosure } from '@/ui/components/disclosure';
import { RadioCards } from '@/ui/components/radio-cards';
import { SegmentedControl } from '@/ui/components/segmented';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { CLINICAL_TOPICS } from '../shared/topics';
import { useBankNotice } from '../shared/bankNotice';
import { chooseWithBodies } from '../shared/chooseWithBodies';
import { dailyQuestions } from '../shared/dailyLimit';
import { useLockedCta } from '../shared/useLockedCta';
import { useSourceReadiness } from '../shared/useBankReady';
import { useQuestionSource, useServerQuota } from '../shared/useQuestionSource';
import { difficultyGroupOf } from '../shared/difficulty';
import { useUserEvents } from '../shared/useUserEvents';
import { ExamSetupCard, type ExamPreviewInfo } from '../exam/ExamSetupCard';
import { reservedByStoredExam } from '../exam/examStorage';
import { useAnalysis } from '../progress/useAnalysis';
import { targetBiasTags } from '../progress/focusItems';
import { reviewSettingsLinkState, reviewSettingsPath } from '../review/settings/panelParam';
import { abilityFromEvents } from './adaptiveAbility';
import { AdaptiveField } from './AdaptiveField';
import { BranchChips } from './BranchChips';
import { selectedBranchCount } from './clinicalBranches';
import { EnglishPracticeCard } from './EnglishPracticeCard';
import { ExamGuideCard } from './ExamGuideCard';
import { clock, SPANISH_PRACTICE_DEFAULTS, usePractice } from './practice';
import { pickAdaptiveQuestions, pickQuestions } from './pickQuestions';
import { RecentSessionsCard, TrainingCard } from './SimulatorAside';
import { TargetedSamplingField } from './TargetedSamplingField';
import { targetedViewOf } from './targetedView';

type Difficulty = 'all' | 'easy' | 'medium' | 'hard';
type Structure = 'all' | 'negative' | 'affirmative';
type Mode = 'practice' | 'exam' | 'targeted';
type TimeMode = 'none' | 'enarm';

const PRACTICE_SIZES = [5, 10, 20, 40] as const;

export function SimulatorSetupScreen() {
  return (
    <RequireSession screen="simulatorSetup">
      {(session) => <Setup session={session} />}
    </RequireSession>
  );
}

/** El ícono de una tarjeta de modo. Círculo cielo, y marino con el ícono en blanco en la elegida */
function ModeIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary-ink [&_svg]:size-5 [[data-state=checked]_&]:bg-primary [[data-state=checked]_&]:text-primary-fg">
      {children}
    </span>
  );
}

function Setup({ session }: { session: ReadySession }) {
  const englishCards = isFeatureEnabled('medicalEnglish');
  const api = useDataApi();
  const navigate = useNavigate();
  const practice = usePractice();
  const source = useQuestionSource();
  const { readiness, retry } = useSourceReadiness(source);
  const pool = useLiveData(() => source.pool(), [source, readiness]);
  const serverQuota = useServerQuota(source);
  const showNotice = useBankNotice((state) => state.show);
  // El botón del candado de Gratis, con la prueba solo si a este alumno todavía le toca (B10)
  const lockedCta = useLockedCta();
  const [starting, setStarting] = useState(false);
  // La práctica no pudo empezar porque no llegó ninguna pregunta
  const [blocked, setBlocked] = useState<string | null>(null);
  const questions = pool?.practice;
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(session.user.id).then((value) => value ?? null),
    [api.repos, session.user.id],
  );
  const events = useUserEvents(session.user.id);
  const analysis = useAnalysis(session, events);
  // Los focos de Progreso llegan con un tema o una estructura ya elegidos (D-078)
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(() =>
    params.get('mode') === 'exam' ? 'exam' : 'practice',
  );
  const [topics, setTopics] = useState<Set<string>>(() => {
    const preset = params.get('topic');
    return new Set(preset && CLINICAL_TOPICS.includes(preset) ? [preset] : CLINICAL_TOPICS);
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [cognitive, setCognitive] = useState<'all' | CognitiveGroup>('all');
  const [structure, setStructure] = useState<Structure>(() =>
    params.get('structure') === 'negative' ? 'negative' : 'all',
  );
  const [count, setCount] = useState<number>(10);
  const [adaptive, setAdaptive] = useState(false);
  // Lo que el examen armó con sus opciones, para el lateral
  const [examPreview, setExamPreview] = useState<ExamPreviewInfo | null>(null);
  // Los ajustes del modelo que bajó la noche, de fábrica mientras no hayan bajado (B14, 1.12)
  const modelStored = useLiveData(() => readStoredModel(api), [api.repos]);
  // El modelo del alumno es el que ya calculó el análisis de arriba, el mismo que lee Progreso, así las dos
  // pantallas dicen lo mismo y no se calcula dos veces
  const studentModel = analysis?.model.model;
  // La habilidad. La del modelo del alumno si ya está lista y, si no, la que sale de sus respuestas a las
  // preguntas ya medidas con el mismo estimador, que con pocas respuestas queda cerca de 0 y funciona
  // desde el primer día
  const ability = useMemo(() => {
    if (studentModel?.ability.state === 'ready') return studentModel.ability.value;
    if (questions === undefined || events === undefined) return undefined;
    const estimate = abilityFromEvents(events, questions);
    return { theta: estimate.theta, se: estimate.se };
  }, [studentModel, questions, events]);

  const header = (
    <ScreenHeader
      title={t.simulator.hero.title}
      documentTitle={t.screens.simulatorSetup.title}
      description={t.simulator.hero.lead}
    />
  );
  if (
    readiness === undefined ||
    questions === undefined ||
    events === undefined ||
    subscription === undefined ||
    serverQuota === undefined
  ) {
    return (
      <>
        {header}
        <LoadingState label={t.simulator.preparing} />
      </>
    );
  }
  if (readiness !== 'ready') {
    const notice = readiness === 'closed' ? bankText.closed : bankText.neverDownloaded;
    return (
      <>
        {header}
        <Card aria-labelledby="banco-aviso">
          <CardHeader>
            <CardTitle id="banco-aviso">{notice.title}</CardTitle>
            <CardDescription>{notice.body}</CardDescription>
          </CardHeader>
          {/* Con la red de vuelta se prepara solo, y el botón sirve si la red ya estaba */}
          {readiness === 'never_downloaded' ? (
            <Button variant="secondary" className="mt-2" onClick={retry}>
              <RefreshCw aria-hidden />
              {bankText.retry}
            </Button>
          ) : null}
        </Card>
      </>
    );
  }

  const now = new Date();
  const { plan, limit, left, reserved } = dailyQuestions({
    events,
    subscription,
    timeZone: session.user.timeZone,
    now,
    reserved: reservedByStoredExam(session.user.id),
    serverQuota,
  });
  const brake = brakeUntil(serverQuota, now);
  // Lo que el alumno eligió sin el nivel, que es lo que cuenta para ofrecer el modo adaptativo (B14, 4.5)
  const matchesStructure = (question: (typeof questions)[number]) =>
    structure === 'all' || question.structure.polarity === structure;
  const modelSettings = modelStored?.settings ?? FACTORY_MODEL_SETTINGS;
  const adaptiveFeature = modelSettings.features.adaptive;
  const availability =
    modelStored === undefined
      ? undefined
      : adaptiveAvailability(
          questions
            .filter((question) => topics.has(question.topic) && matchesStructure(question))
            .map((question) => poolDifficulty(question).source),
          modelSettings.thresholds.adaptiveMinItems,
        );
  const adaptiveOn =
    adaptive && adaptiveFeature && availability?.available === true && ability !== undefined;
  // Preguntas por subespecialidad con los filtros de dificultad y estructura, para el selector. Con el
  // modo adaptativo prendido el nivel lo elige la app y el filtro de dificultad no cuenta
  const matchesLevel = (question: (typeof questions)[number]) => {
    if (
      !adaptiveOn &&
      difficulty !== 'all' &&
      difficultyGroupOf(effectiveLevel(poolDifficulty(question))) !== difficulty
    )
      return false;
    // El nivel cognitivo solo filtra a las preguntas que ya lo traen. Las demás no entran si se elige uno
    if (
      cognitive !== 'all' &&
      (!question.cognitiveLevel || cognitiveGroupOf(question.cognitiveLevel) !== cognitive)
    )
      return false;
    return matchesStructure(question);
  };
  const withLevel = questions.filter((question) => question.cognitiveLevel !== undefined).length;
  const countsByTopic = new Map<string, number>();
  for (const question of questions) {
    if (matchesLevel(question))
      countsByTopic.set(question.topic, (countsByTopic.get(question.topic) ?? 0) + 1);
  }
  const filtered = questions.filter(
    (question) => topics.has(question.topic) && matchesLevel(question),
  );
  const wanted = Math.min(count, filtered.length, left ?? Number.POSITIVE_INFINITY);
  // El modo Dirigido enciende las opciones dirigidas solo cuando el perfil ya tiene trampas que dirigir.
  // Mientras calibra, la práctica corre con opciones variadas y el lateral lo dice
  const targetedView = targetedViewOf(studentModel, analysis?.report);
  const targeted = mode === 'targeted' && targetedView?.kind === 'ready';
  const branchesSelected = selectedBranchCount(topics);

  const start = async () => {
    const sessionId = newId();
    // Con la nube se bajan los cuerpos antes de empezar. Lo ya bajado no gasta del tope. Sin conexión
    // se elige solo de lo ya bajado (M2)
    const { ids, result, fromStored } = await chooseWithBodies({
      source,
      candidates: filtered,
      purpose: 'practice',
      // Los casos seriados se mantienen juntos y en orden
      choose: (from) =>
        (adaptiveOn
          ? pickAdaptiveQuestions(from, {
              ability: ability.theta,
              targetOffset: modelSettings.thresholds.adaptiveTargetOffset,
              exploreShare: modelSettings.thresholds.adaptiveExploreShare,
              count: Math.min(wanted, from.length),
              seed: `practice|${sessionId}`,
            })
          : pickQuestions(from, `practice|${sessionId}`, Math.min(wanted, from.length))
        ).map((question) => question.id),
    });
    const ready = new Set(result.ready);
    const ordered = ids.filter((id) => ready.has(id));
    const reason = fromStored
      ? 'offline'
      : shortfallReason({
          denied: result.denied,
          offline: result.offline,
          missing: ids.length - ordered.length,
        });
    // Sin conexión se compara con lo que pidió, no con lo que alcanzó a elegirse de lo bajado
    const requested = fromStored ? wanted : ids.length;
    const retryAt = result.quota?.brake.retryAt ?? null;
    if (ordered.length === 0) {
      setBlocked(
        reason === 'brake' && retryAt
          ? bankText.brake(retryAt)
          : reason
            ? bankText.shortfall.reasons[reason]
            : bankText.shortfall.none,
      );
      return;
    }
    if (reason && (fromStored || ordered.length < requested)) {
      showNotice({ reason, granted: ordered.length, requested, retryAt });
    }
    // Solo se dirige si el modo lo pide y el perfil ya tiene trampas que dirigir
    const targetTags = targeted && analysis ? targetBiasTags(analysis.report) : [];
    await api.recordEvent(
      createEvent(
        'session_started',
        {
          kind: 'practice',
          config: {
            topics: [...topics],
            difficulty,
            structure,
            ...(cognitive !== 'all' ? { cognitive } : {}),
            count: ordered.length,
            sampling: targetTags.length > 0 ? 'targeted' : 'diverse',
            ...(targetTags.length > 0 ? { targetTags } : {}),
            // El modo adaptativo y el nivel con el que empezó, sin un evento nuevo (B14, 4.5)
            ...(adaptiveOn
              ? {
                  adaptive: true,
                  ability: Math.round(ability.theta * 100) / 100,
                  abilitySe: Math.round(ability.se * 100) / 100,
                }
              : {}),
          },
        },
        { userId: session.user.id, tz: session.user.timeZone, sessionId },
      ),
    );
    practice.set({
      sessionId,
      userId: session.user.id,
      questionIds: ordered,
      index: 0,
      answers: [],
      startedAt: clock(),
      ended: false,
      kind: 'practice',
      duelId: null,
      targetTags,
      ...SPANISH_PRACTICE_DEFAULTS,
    });
    void navigate(screenPath('question'));
  };

  // El reloj va con el examen. Elegir Ritmo ENARM es elegir el modo Examen, y Sin reloj vuelve a la
  // práctica. Un ritmo más apretado no existe todavía, así que no se ofrece
  const timeControl = (
    <SegmentedControl<TimeMode>
      label={t.simulator.time.legend}
      options={[
        { value: 'none', label: t.simulator.time.none },
        { value: 'enarm', label: t.simulator.time.enarm },
      ]}
      value={mode === 'exam' ? 'enarm' : 'none'}
      onChange={(value) => {
        if (value === 'enarm') setMode('exam');
        else if (mode === 'exam') setMode('practice');
      }}
      className="flex w-full"
      itemClassName="flex-1"
    />
  );

  // Con qué entrena lo elegido ahora. Solo lo que de verdad va a pasar en la sesión
  const feedbackEach = session.settings.practiceFeedback === 'each';
  const trains: string[] = [];
  if (mode === 'exam') {
    trains.push(t.simulator.trains.clock(EXAM_SECONDS_PER_QUESTION));
    trains.push(
      examPreview?.alerts === false ? t.simulator.trains.noAlerts : t.simulator.trains.alerts,
    );
  } else {
    if (mode === 'targeted' && targetedView) {
      if (targetedView.kind === 'ready') {
        trains.push(t.simulator.trains.targeted(targetedView.names[0] ?? ''));
      } else if (targetedView.kind === 'calibrating') {
        trains.push(t.simulator.trains.targetedCalibrating(targetedView.have, targetedView.need));
      } else {
        trains.push(t.simulator.trains.targetedNone);
      }
    }
    trains.push(feedbackEach ? t.simulator.trains.feedbackEach : t.simulator.trains.feedbackEnd);
    trains.push(adaptiveOn ? t.simulator.trains.adaptive : t.simulator.trains.discard);
  }
  trains.push(t.simulator.trains.imperfect);

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <section
          aria-label={mode === 'exam' ? t.exam.cardTitle : t.simulator.setupTitle}
          className="flex min-w-0 flex-col gap-6 lg:col-span-8"
        >
          <RadioCards<Mode>
            legend={t.simulator.mode.legend}
            layout="row"
            value={mode}
            onValueChange={setMode}
            options={[
              {
                value: 'practice',
                label: t.simulator.mode.practice,
                description: feedbackEach
                  ? t.simulator.mode.practiceEach
                  : t.simulator.mode.practiceEnd,
                icon: (
                  <ModeIcon>
                    <Play />
                  </ModeIcon>
                ),
              },
              {
                value: 'exam',
                label: t.simulator.mode.exam,
                description: t.simulator.mode.examDescription,
                icon: (
                  <ModeIcon>
                    <Clock />
                  </ModeIcon>
                ),
              },
              {
                value: 'targeted',
                label: t.simulator.mode.targeted,
                description: t.simulator.mode.targetedDescription,
                icon: (
                  <ModeIcon>
                    <Activity />
                  </ModeIcon>
                ),
              },
            ]}
          />
          {mode === 'targeted' ? (
            <TargetedSamplingField
              variant="status"
              model={studentModel}
              report={analysis?.report}
              checked={targeted}
              onChange={() => undefined}
            />
          ) : null}

          <fieldset className="flex min-w-0 flex-col gap-3">
            <legend className="group-title mb-3">{t.simulator.branches}</legend>
            {mode === 'exam' ? (
              <p className="text-sm text-fg-muted">{t.simulator.branchesExam}</p>
            ) : (
              <>
                <BranchChips selected={topics} onChange={setTopics} />
                <p className="text-sm text-fg-muted">
                  <span>{t.simulator.available(filtered.length)}</span>
                  {' · '}
                  <span>
                    {source.kind === 'cloud'
                      ? bankText.bankNote(questions.length)
                      : t.simulator.bankNote(questions.length)}
                  </span>
                </p>
                <Disclosure
                  title={t.simulator.moreFilters}
                  summary={t.topicPicker.selected(topics.size, CLINICAL_TOPICS.length)}
                >
                  <BranchTopicPicker
                    selected={topics}
                    onChange={setTopics}
                    counts={countsByTopic}
                    showCount={false}
                    scope="clinical"
                  />
                </Disclosure>
              </>
            )}
          </fieldset>

          {mode === 'exam' ? (
            <ExamSetupCard
              session={session}
              questions={pool?.exam ?? []}
              englishQuestions={pool?.english.exam ?? []}
              plan={plan}
              left={left}
              timeControl={timeControl}
              onPreview={setExamPreview}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-3">
                  <p className="group-title mb-3">{t.simulator.count}</p>
                  <SegmentedControl<number>
                    label={t.simulator.count}
                    options={PRACTICE_SIZES.map((n) => ({ value: n, label: String(n) }))}
                    value={count}
                    onChange={setCount}
                    className="flex w-full"
                    itemClassName="flex-1"
                  />
                  {limit !== null && left !== null ? (
                    <p className="text-sm text-fg-muted">{t.simulator.freeNote(limit, left)}</p>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-col gap-3">
                  <p className="group-title mb-3">{t.simulator.time.legend}</p>
                  {timeControl}
                  <p className="text-sm text-fg-muted">{t.simulator.time.noneNote}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-2">
                {left === 0 && reserved > 0 ? (
                  // El límite del día lo tiene apartado un examen que todavía no termina
                  <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                    <Link to={screenPath('exam')}>{t.simulator.goToOpenExam}</Link>
                  </Button>
                ) : left === 0 ? (
                  // El aviso de los candados de Gratis, con la prueba gratis si está prendida (B8)
                  <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                    <Link to={lockedCta.path}>{lockedCta.label}</Link>
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={wanted === 0 || starting}
                    onClick={() => {
                      setStarting(true);
                      setBlocked(null);
                      void start()
                        .catch(() => {
                          setBlocked(bankText.shortfall.none);
                        })
                        .finally(() => {
                          setStarting(false);
                        });
                    }}
                  >
                    <Play aria-hidden />
                    {t.simulator.start}
                  </Button>
                )}
                {left === 0 ? (
                  <p className="text-sm font-semibold text-fg">
                    {reserved > 0 ? t.simulator.limitUsedByExam : t.simulator.limitReached}
                  </p>
                ) : wanted > 0 ? (
                  <p className="text-sm text-fg-muted">
                    {t.simulator.summary(wanted, branchesSelected, null)}
                  </p>
                ) : null}
              </div>
              {brake ? (
                <p role="status" className="text-sm font-medium text-fg">
                  {bankText.brake(brake.toISOString())}
                </p>
              ) : null}
              {blocked ? (
                <p role="alert" className="text-sm font-medium text-danger">
                  {blocked}
                </p>
              ) : null}
              {filtered.length === 0 ? (
                <p className="text-sm text-danger">{t.simulator.noQuestions}</p>
              ) : null}

              {/* Lo que no está en el diseño del formulario va debajo, en su tarjeta (D-150) */}
              <Card lift={false} aria-labelledby="practica-ajustes" className="flex flex-col gap-3">
                <CardHeader className="mb-0">
                  <CardTitle id="practica-ajustes" as="h3" className="text-lg">
                    {t.simulator.moreSettings}
                  </CardTitle>
                </CardHeader>
                {/* Una columna en el teléfono para que ninguna opción se corte (H09 de la revisión de B2) */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <SelectField
                    label={t.simulator.difficulty}
                    value={difficulty}
                    disabled={adaptiveOn}
                    {...(adaptiveOn ? { hint: adaptiveTexts.difficultyLocked } : {})}
                    options={(['all', 'easy', 'medium', 'hard'] as Difficulty[]).map((value) => ({
                      value,
                      label: t.simulator.difficulties[value],
                    }))}
                    onChange={(event) => {
                      setDifficulty(event.target.value as Difficulty);
                    }}
                  />
                  <SelectField
                    label={t.cognitive.label}
                    value={cognitive}
                    disabled={withLevel === 0}
                    hint={
                      withLevel === 0
                        ? t.cognitive.none
                        : t.cognitive.some(withLevel, questions.length)
                    }
                    options={(['all', ...COGNITIVE_GROUPS] as const).map((value) => ({
                      value,
                      label: t.cognitive.options[value],
                    }))}
                    onChange={(event) => {
                      setCognitive(event.target.value as 'all' | CognitiveGroup);
                    }}
                  />
                  <SelectField
                    label={t.simulator.structure}
                    value={structure}
                    options={(['all', 'negative', 'affirmative'] as Structure[]).map((value) => ({
                      value,
                      label: t.simulator.structures[value],
                    }))}
                    onChange={(event) => {
                      setStructure(event.target.value as Structure);
                    }}
                  />
                </div>
                {adaptiveFeature ? (
                  <AdaptiveField
                    availability={availability}
                    checked={adaptive}
                    onChange={setAdaptive}
                  />
                ) : null}
                {/* Cuándo llega la retroalimentación se guarda en el perfil (D-087). Aquí solo se lee y se
                    cambia en Ajustes del repaso, su único lugar, como los límites en Repasar (B3 del plan) */}
                <p className="text-sm text-fg-muted">
                  {t.settingsPage.reviewSettings.practiceFeedback(feedbackEach)}{' '}
                  <Link
                    to={reviewSettingsPath()}
                    state={reviewSettingsLinkState}
                    className="font-semibold text-primary-ink underline underline-offset-2"
                  >
                    {t.settingsPage.reviewSettings.change}
                  </Link>
                </p>
              </Card>
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <TrainingCard items={trains} />
          <RecentSessionsCard events={events} timeZone={session.user.timeZone} now={now} />
        </aside>
      </div>

      <ExamGuideCard />
      {englishCards ? (
        <EnglishPracticeCard
          session={session}
          pool={pool?.english ?? { practice: [], exam: [] }}
          left={left}
          reserved={reserved}
          report={analysis?.report}
          model={studentModel}
        />
      ) : null}
    </>
  );
}
