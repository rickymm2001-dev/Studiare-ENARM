// Configurar simulador (pantalla 7). Práctica por rama, dificultad y estructura, con el límite
// diario del plan Gratis como bandera de acceso. Los filtros y el botón de empezar van arriba y las
// ramas quedan plegadas con un resumen (D-078). Debajo va la tarjeta del examen completo.
import { Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { PLANS } from '@/config/billing';
import { useDataApi } from '@/data/context';
import { createEvent } from '@/data/events/createEvent';
import { newId } from '@/data/ids';
import { useLiveData } from '@/data/hooks';
import { ensureDemoBank } from '@/data/usecases/bank';
import { studyDayOf } from '@/engines/studyDay';
import { createRng } from '@/engines/random';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SelectField } from '@/ui/components/field';
import { Disclosure } from '@/ui/components/disclosure';
import { DemoContentLabel } from '@/ui/components/labels';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { BranchTopicPicker } from '../shared/BranchTopicPicker';
import { ALL_TOPICS } from '../shared/topics';
import { useUserEvents } from '../shared/useUserEvents';
import { ExamSetupCard } from '../exam/ExamSetupCard';
import { clock, usePractice } from './practice';

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
  const questions = useLiveData(() => api.repos.questions.listLatest(), [api.repos, ready]);
  const subscription = useLiveData(
    () => api.repos.subscriptions.get(session.user.id).then((value) => value ?? null),
    [api.repos, session.user.id],
  );
  const events = useUserEvents(session.user.id);
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

  const plan = subscription?.status === 'active' ? subscription.plan : 'free';
  const limit = PLANS[plan].access.dailyQuestions;
  const today = studyDayOf(new Date(), session.user.timeZone);
  const answeredToday = events.filter(
    (event) =>
      event.type === 'question_answered' && studyDayOf(new Date(event.at), event.tz) === today,
  ).length;
  const left = limit === null ? null : Math.max(0, limit - answeredToday);
  // Preguntas por subespecialidad con los filtros de dificultad y estructura, para el selector
  const matchesLevel = (question: (typeof questions)[number]) => {
    const level = question.physicianDifficulty;
    if (difficulty === 'easy' && level > 2) return false;
    if (difficulty === 'medium' && level !== 3) return false;
    if (difficulty === 'hard' && level < 4) return false;
    return structure === 'all' || question.structure.polarity === structure;
  };
  const countsByTopic = new Map<string, number>();
  for (const question of questions) {
    if (matchesLevel(question))
      countsByTopic.set(question.topic, (countsByTopic.get(question.topic) ?? 0) + 1);
  }
  const filtered = questions.filter((question) => {
    if (!topics.has(question.topic)) return false;
    const level = question.physicianDifficulty;
    if (difficulty === 'easy' && level > 2) return false;
    if (difficulty === 'medium' && level !== 3) return false;
    if (difficulty === 'hard' && level < 4) return false;
    if (structure !== 'all' && question.structure.polarity !== structure) return false;
    return true;
  });
  const wanted = Math.min(Number(count), filtered.length, left ?? Number.POSITIVE_INFINITY);

  const start = async () => {
    const sessionId = newId();
    const rng = createRng(`practice|${sessionId}`);
    // Los casos seriados se mantienen juntos y en orden
    const picked = rng.shuffle(filtered).slice(0, wanted);
    const ordered = [...picked].sort((a, b) =>
      a.caseId && a.caseId === b.caseId ? (a.caseOrder ?? 0) - (b.caseOrder ?? 0) : 0,
    );
    await api.recordEvent(
      createEvent(
        'session_started',
        {
          kind: 'practice',
          config: { topics: [...topics], difficulty, structure, count: wanted },
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
    });
    void navigate(screenPath('question'));
  };

  return (
    <>
      {header}
      <Card aria-labelledby="practica-titulo">
        <CardHeader className="mb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="practica-titulo">{t.simulator.setupTitle}</CardTitle>
            <DemoContentLabel />
          </div>
          <CardDescription>{t.simulator.bankNote(questions.length)}</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
              className="col-span-2 sm:col-span-1"
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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {left === 0 ? (
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
            <p className="text-sm text-fg-muted">
              {t.simulator.available(filtered.length)}
              {left !== null ? (
                <>
                  {' · '}
                  <span className={left === 0 ? 'font-semibold text-fg' : undefined}>
                    {left > 0 ? t.simulator.limit(left) : t.simulator.limitReached}
                  </span>
                </>
              ) : null}
            </p>
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
      <ExamSetupCard session={session} questions={questions} plan={plan} left={left} />
    </>
  );
}
