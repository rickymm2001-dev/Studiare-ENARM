// Configurar simulador (pantalla 7). Práctica por rama, dificultad y estructura, con el límite
// diario del plan Gratis como bandera de acceso. Los filtros y el botón de empezar van arriba y las
// ramas quedan plegadas con un resumen (D-078). Debajo va la tarjeta del examen completo.
// Las preguntas salen de la fuente del alumno (B11, 5.1). Con el banco de la nube se eligen del catálogo
// y antes de empezar se bajan sus cuerpos. Si llega menos de lo pedido, la práctica arranca con lo
// concedido y el marco de la app dice por qué. El tope de Gratis es el menor entre lo que cuenta la app
// y lo que cuenta el servidor, y en un plan de pago el freno del servidor se avisa con su hora.
// La práctica en español deja fuera el inglés siempre (B13, 2.8). Los casos de lectura en inglés tienen
// su tarjeta aparte, entre esta práctica y el examen completo, si la bandera medicalEnglish está prendida.
// Los filtros de dificultad usan la dificultad efectiva (B14, 4.4), la que calculó la noche con las
// respuestas de otros alumnos y, si no hay, la del médico. La casilla Adaptativo (B14, 4.5) elige
// preguntas cerca del nivel del alumno cuando lo que eligió tiene suficientes preguntas calibradas, y no
// cambia el tope de preguntas que da el plan.
import { Gauge, Library, ListChecks, Play, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { brakeUntil, shortfallReason } from '@/data/bank/quota';
import { readStoredModel } from '@/data/usecases/modelCloud';
import { adaptiveAvailability } from '@/engines/adaptive';
import { adaptiveTexts } from '@/i18n/adaptive';
import { cloudBankScreensText as bankText } from '@/i18n/cloudBankScreens';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { Disclosure } from '@/ui/components/disclosure';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
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
import { ExamSetupCard } from '../exam/ExamSetupCard';
import { reservedByStoredExam } from '../exam/examStorage';
import { useAnalysis } from '../progress/useAnalysis';
import { targetBiasTags } from '../progress/focusItems';
import { reviewSettingsLinkState, reviewSettingsPath } from '../review/settings/panelParam';
import { EnglishPracticeCard } from './EnglishPracticeCard';
import { abilityFromEvents } from './adaptiveAbility';
import { AdaptiveField } from './AdaptiveField';
import { clock, SPANISH_PRACTICE_DEFAULTS, usePractice } from './practice';
import { pickAdaptiveQuestions, pickQuestions } from './pickQuestions';
import { TargetedSamplingField } from './TargetedSamplingField';

type Difficulty = 'all' | 'easy' | 'medium' | 'hard';
type Structure = 'all' | 'negative' | 'affirmative';

export function SimulatorSetupScreen() {
  return (
    <RequireSession screen="simulatorSetup">
      {(session) => <Setup session={session} />}
    </RequireSession>
  );
}

function Setup({ session }: { session: ReadySession }) {
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
  const [topics, setTopics] = useState<Set<string>>(() => {
    const preset = params.get('topic');
    return new Set(preset && CLINICAL_TOPICS.includes(preset) ? [preset] : CLINICAL_TOPICS);
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [structure, setStructure] = useState<Structure>(() =>
    params.get('structure') === 'negative' ? 'negative' : 'all',
  );
  const [count, setCount] = useState('10');
  const [targeted, setTargeted] = useState(false);
  const [adaptive, setAdaptive] = useState(false);
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
      title={t.screens.simulatorSetup.title}
      description={t.screens.simulatorSetup.description}
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
  const { plan, left, reserved } = dailyQuestions({
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
    return matchesStructure(question);
  };
  const countsByTopic = new Map<string, number>();
  for (const question of questions) {
    if (matchesLevel(question))
      countsByTopic.set(question.topic, (countsByTopic.get(question.topic) ?? 0) + 1);
  }
  const filtered = questions.filter(
    (question) => topics.has(question.topic) && matchesLevel(question),
  );
  const wanted = Math.min(Number(count), filtered.length, left ?? Number.POSITIVE_INFINITY);

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
    // Solo se dirige si la opción está encendida y el perfil ya tiene trampas que dirigir
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

  return (
    <>
      {header}
      <StatPanel label={t.simulator.stats.label}>
        <StatCell
          icon={<ListChecks />}
          label={t.simulator.stats.available}
          value={filtered.length.toLocaleString('es-MX')}
          caption={t.simulator.stats.availableCaption}
        />
        <StatCell
          icon={<Gauge />}
          label={t.simulator.stats.today}
          value={left === null ? '∞' : left.toLocaleString('es-MX')}
          srLabel={left === null ? t.simulator.stats.unlimited : undefined}
          caption={left === null ? t.simulator.stats.unlimited : t.simulator.stats.todayCaption}
        />
        <StatCell
          icon={<Library />}
          label={t.simulator.stats.bank}
          value={questions.length.toLocaleString('es-MX')}
          caption={t.simulator.stats.bankCaption}
        />
      </StatPanel>
      <Card aria-labelledby="practica-titulo">
        <CardHeader className="mb-3">
          <CardTitle id="practica-titulo">{t.simulator.setupTitle}</CardTitle>
          <CardDescription>
            {source.kind === 'cloud'
              ? bankText.bankNote(questions.length)
              : t.simulator.bankNote(questions.length)}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3">
          {/* Una columna en el teléfono para que ninguna opción se corte (H09 de la revisión de B2) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
              label={t.simulator.count}
              value={count}
              options={[5, 10, 20, 40].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(event) => {
                setCount(event.target.value);
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
          {/* Cuándo llega la retroalimentación se guarda en el perfil (D-087). Aquí solo se lee y se
              cambia en Ajustes del repaso, su único lugar, como los límites en Repasar (B3 del plan) */}
          <p className="text-sm text-fg-muted">
            {t.settingsPage.reviewSettings.practiceFeedback(
              session.settings.practiceFeedback === 'each',
            )}{' '}
            <Link
              to={reviewSettingsPath()}
              state={reviewSettingsLinkState}
              className="font-semibold text-primary-ink underline underline-offset-2"
            >
              {t.settingsPage.reviewSettings.change}
            </Link>
          </p>
          <TargetedSamplingField
            model={studentModel}
            report={analysis?.report}
            checked={targeted}
            onChange={setTargeted}
          />
          {adaptiveFeature ? (
            <AdaptiveField availability={availability} checked={adaptive} onChange={setAdaptive} />
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
          <Disclosure
            title={t.topicPicker.title}
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
        </div>
      </Card>
      {isFeatureEnabled('medicalEnglish') ? (
        <EnglishPracticeCard
          session={session}
          pool={pool?.english ?? { practice: [], exam: [] }}
          left={left}
          reserved={reserved}
          report={analysis?.report}
          model={studentModel}
        />
      ) : null}
      <ExamSetupCard
        session={session}
        questions={pool?.exam ?? []}
        englishQuestions={pool?.english.exam ?? []}
        plan={plan}
        left={left}
      />
    </>
  );
}
