// Configurar simulador (pantalla 7). Práctica por rama, dificultad y estructura, con el límite
// diario del plan Gratis como bandera de acceso. Los filtros y el botón de empezar van arriba y las
// ramas quedan plegadas con un resumen (D-078). Debajo va la tarjeta del examen completo.
import { Gauge, Library, ListChecks, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { useLiveData } from '@/data/hooks';
import { ensureDemoBank } from '@/data/usecases/bank';
import { listStudentPool } from '@/data/usecases/studentBank';
import { updateProfile } from '@/data/usecases/profile';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { Disclosure } from '@/ui/components/disclosure';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { ALL_TOPICS } from '../shared/topics';
import { dailyQuestions } from '../shared/dailyLimit';
import { difficultyGroupOf } from '../shared/difficulty';
import { useUserEvents } from '../shared/useUserEvents';
import { ExamSetupCard } from '../exam/ExamSetupCard';
import { reservedByStoredExam } from '../exam/examStorage';
import { useAnalysis } from '../progress/useAnalysis';
import { targetBiasTags } from '../progress/focusItems';
import { clock, usePractice } from './practice';
import { pickQuestions } from './pickQuestions';
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
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void ensureDemoBank(api).then(() => {
      setReady(true);
    });
  }, [api]);
  const pool = useLiveData(() => listStudentPool(api), [api.repos, ready]);
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
    return new Set(preset && ALL_TOPICS.includes(preset) ? [preset] : ALL_TOPICS);
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('all');
  const [structure, setStructure] = useState<Structure>(() =>
    params.get('structure') === 'negative' ? 'negative' : 'all',
  );
  const [count, setCount] = useState('10');
  const [targeted, setTargeted] = useState(false);

  const header = (
    <ScreenHeader
      title={t.screens.simulatorSetup.title}
      description={t.screens.simulatorSetup.description}
    />
  );
  if (!ready || questions === undefined || events === undefined || subscription === undefined) {
    return (
      <>
        {header}
        <LoadingState label={t.simulator.preparing} />
      </>
    );
  }

  const { plan, left, reserved } = dailyQuestions({
    events,
    subscription,
    timeZone: session.user.timeZone,
    now: new Date(),
    reserved: reservedByStoredExam(session.user.id),
  });
  // Preguntas por subespecialidad con los filtros de dificultad y estructura, para el selector
  const matchesLevel = (question: (typeof questions)[number]) => {
    if (difficulty !== 'all' && difficultyGroupOf(question.physicianDifficulty) !== difficulty)
      return false;
    return structure === 'all' || question.structure.polarity === structure;
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
    // Los casos seriados se mantienen juntos y en orden
    const ordered = pickQuestions(filtered, `practice|${sessionId}`, wanted);
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
            count: wanted,
            sampling: targetTags.length > 0 ? 'targeted' : 'diverse',
            ...(targetTags.length > 0 ? { targetTags } : {}),
          },
        },
        { userId: session.user.id, tz: session.user.timeZone, sessionId },
      ),
    );
    practice.set({
      sessionId,
      userId: session.user.id,
      questionIds: ordered.map((question) => question.id),
      index: 0,
      answers: [],
      startedAt: clock(),
      ended: false,
      kind: 'practice',
      duelId: null,
      targetTags,
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
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="practica-titulo">{t.simulator.setupTitle}</CardTitle>
            <DemoContentLabel />
          </div>
          <CardDescription>{t.simulator.bankNote(questions.length)}</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SelectField
              label={t.simulator.difficulty}
              value={difficulty}
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
            {/* Se guarda en el perfil, así la próxima práctica ya lo trae (D-087) */}
            <SelectField
              label={t.settings.practiceFeedback}
              value={session.settings.practiceFeedback}
              options={(['end', 'each'] as const).map((value) => ({
                value,
                label: t.settings.practiceFeedbackOptions[value],
              }))}
              onChange={(event) => {
                void updateProfile(api, session.user, {
                  settings: { practiceFeedback: event.target.value as 'end' | 'each' },
                });
              }}
            />
          </div>
          <TargetedSamplingField
            report={analysis?.report}
            checked={targeted}
            onChange={setTargeted}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {left === 0 && reserved > 0 ? (
              // El límite del día lo tiene apartado un examen que todavía no termina
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link to={screenPath('exam')}>{t.simulator.goToOpenExam}</Link>
              </Button>
            ) : left === 0 ? (
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <Link to={screenPath('subscription')}>{t.simulator.seePlans}</Link>
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full sm:w-auto"
                disabled={wanted === 0}
                onClick={() => {
                  void start();
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
          {filtered.length === 0 ? (
            <p className="text-sm text-danger">{t.simulator.noQuestions}</p>
          ) : null}
          <Disclosure
            title={t.topicPicker.title}
            summary={t.topicPicker.selected(topics.size, ALL_TOPICS.length)}
          >
            <BranchTopicPicker
              selected={topics}
              onChange={setTopics}
              counts={countsByTopic}
              showCount={false}
            />
          </Disclosure>
        </div>
      </Card>
      <ExamSetupCard session={session} questions={pool?.exam ?? []} plan={plan} left={left} />
    </>
  );
}
