// Progreso (pantalla 10). Primera versión (D-066). Resumen, dominio por rama troncal y por
// subespecialidad con el modelo beta-binomial del motor topics. Cada dato muestra calibrando hasta
// tener respuestas suficientes. Técnica de examen, sesgos y carga futura llegan en el bloque P7.
import { BookOpenCheck, Clock, ListChecks, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { topicTaxonomy } from '@/demo/content';
import { deckIds } from '@/demo/content/deckEntities';
import { analyzeCategories, analyzeTopics, type MasteryState } from '@/engines/topics';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { SimulatedDataLabel } from '@/ui/components/labels';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import { deckBranch } from '../decks/deckBranch';
import { useDeckCatalog } from '../decks/useDeckCatalog';
import { buildSnapshot } from '../home/snapshot';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';

export function ProgressScreen() {
  return (
    <RequireSession screen="progress">{(session) => <Progress session={session} />}</RequireSession>
  );
}

function Progress({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const catalog = useDeckCatalog();
  const cardNote = useLiveData(
    async () => new Map((await api.repos.cards.list()).map((card) => [card.id, card.noteId])),
    [api.repos],
  );
  const answeredIds = (events ?? []).flatMap((event) =>
    event.type === 'question_answered' ? [event.payload.questionVersionId] : [],
  );
  const questions = useLiveData(async () => {
    const ids = [...new Set(answeredIds)];
    const found = await Promise.all(ids.map((id) => api.repos.questions.get(id)));
    return new Map(
      found
        .filter((question) => question !== undefined)
        .map((question) => [question.id, { branch: question.branch, topic: question.topic }]),
    );
  }, [api.repos, answeredIds.join(',')]);

  const header = (
    <ScreenHeader
      title={t.screens.progress.title}
      description={t.progress.description}
      badges={session.isDemo ? <SimulatedDataLabel /> : undefined}
    />
  );
  if (
    events === undefined ||
    questions === undefined ||
    catalog === undefined ||
    cardNote === undefined
  ) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }

  // Respuestas con su rama y subespecialidad
  const responses = events.flatMap((event) => {
    if (event.type !== 'question_answered') return [];
    const info = questions.get(event.payload.questionVersionId);
    return info ? [{ ...info, correct: event.payload.correct }] : [];
  });
  // Tarjetas repasadas por rama y subespecialidad, con lo que dicen las notas de cada mazo
  const noteInfo = new Map<string, { branch: string; topic: string | null }>();
  for (const file of catalog) {
    const branch = deckBranch(file);
    for (const note of file.notes)
      noteInfo.set(deckIds.note(note.key), { branch: note.branch ?? branch, topic: note.topic });
  }
  const cardsByBranch = new Map<string, number>();
  const cardsByTopic = new Map<string, number>();
  for (const event of events) {
    if (event.type !== 'card_reviewed') continue;
    const noteId = cardNote.get(event.payload.cardId);
    const info = noteId ? noteInfo.get(noteId) : undefined;
    if (!info) continue;
    cardsByBranch.set(info.branch, (cardsByBranch.get(info.branch) ?? 0) + 1);
    if (info.topic) cardsByTopic.set(info.topic, (cardsByTopic.get(info.topic) ?? 0) + 1);
  }

  const snapshot = buildSnapshot({ events, user, settings, now: new Date() });
  const totals = Object.values(snapshot.activity).reduce(
    (sum, day) => ({
      cards: sum.cards + day.cards,
      questions: sum.questions + day.questions,
      minutes: sum.minutes + day.focusMinutes,
    }),
    { cards: 0, questions: 0, minutes: 0 },
  );
  const correct = responses.filter((response) => response.correct).length;

  const byBranch = new Map(
    analyzeCategories({
      responses: responses.map((response) => ({
        category: response.branch,
        correct: response.correct,
      })),
      thresholds: DEFAULT_THRESHOLDS.topics,
      minResponsesPerCategory: DEFAULT_THRESHOLDS.structure.minResponsesPerCategory,
    }).map((entry) => [entry.category, entry]),
  );
  const byTopic = new Map(
    analyzeTopics({
      responses,
      taxonomy: topicTaxonomy,
      averageRetrievability: {},
      thresholds: DEFAULT_THRESHOLDS.topics,
    }).topics.map((entry) => [entry.topic, entry]),
  );

  return (
    <>
      {header}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<ListChecks />} label={t.progress.questions} value={totals.questions} />
        <Stat
          icon={<Target />}
          label={t.progress.accuracy}
          value={responses.length > 0 ? `${Math.round((correct / responses.length) * 100)}%` : '—'}
        />
        <Stat icon={<BookOpenCheck />} label={t.progress.cards} value={totals.cards} />
        <Stat icon={<Clock />} label={t.progress.minutes} value={totals.minutes} />
      </div>

      <Card aria-labelledby="troncales-titulo">
        <CardHeader>
          <CardTitle id="troncales-titulo">{t.topicPicker.trunks}</CardTitle>
          <CardDescription>{t.progress.trunksHint}</CardDescription>
        </CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {topicTaxonomy.branches.map((branch) => {
            const entry = byBranch.get(branch.key);
            return (
              <div
                key={branch.key}
                className="flex flex-col gap-2 rounded-lg border border-line p-3"
              >
                <span
                  className={cn(
                    'self-start rounded-full px-2.5 py-0.5 text-sm font-bold',
                    toneClasses(branch.key).chip,
                  )}
                >
                  {branch.name}
                </span>
                <MasteryLine state={entry?.state ?? null} needed={20} />
                <p className="text-xs text-fg-muted">
                  {t.progress.branchCounts(
                    entry?.tally.trials ?? 0,
                    cardsByBranch.get(branch.key) ?? 0,
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      <Card aria-labelledby="subesp-titulo">
        <CardHeader>
          <CardTitle id="subesp-titulo">{t.topicPicker.subspecialties}</CardTitle>
          <CardDescription>{t.progress.topicsHint}</CardDescription>
        </CardHeader>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {topicTaxonomy.branches.map((branch) => (
            <div key={branch.key} className="flex flex-col gap-1">
              <p
                className={cn(
                  'text-xs font-bold tracking-wide uppercase',
                  toneClasses(branch.key).chip.split(' ')[1],
                )}
              >
                {branch.name}
              </p>
              {branch.topics.map((topic) => {
                const entry = byTopic.get(topic.key);
                const state = entry?.state ?? null;
                return (
                  <div key={topic.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{topic.name}</span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {state?.kind === 'ready' ? (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-bold',
                            state.mastery >= 0.75
                              ? 'bg-success-soft text-success'
                              : state.mastery >= 0.6
                                ? 'bg-warning-soft text-warning'
                                : 'bg-danger-soft text-danger',
                          )}
                        >
                          {Math.round(state.mastery * 100)}%
                        </span>
                      ) : (
                        <span className="text-fg-muted">
                          {t.progress.topicCounts(
                            entry?.tally.trials ?? 0,
                            cardsByTopic.get(topic.key) ?? 0,
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span aria-hidden className="text-primary [&_svg]:size-5">
        {icon}
      </span>
      <span className="font-display text-2xl font-extrabold tabular-nums">{value}</span>
      <span className="text-sm text-fg-muted">{label}</span>
    </Card>
  );
}

function MasteryLine({ state, needed }: { state: MasteryState | null; needed: number }) {
  if (state?.kind === 'ready') {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-display text-2xl font-extrabold">
          {Math.round(state.mastery * 100)}%
        </span>
        <ProgressBar
          value={state.mastery * 100}
          max={100}
          label={t.progress.mastery(Math.round(state.mastery * 100))}
        />
      </div>
    );
  }
  const responses = state?.responses ?? 0;
  const missing = state?.kind === 'calibrating' ? state.responsesNeeded : needed;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-fg-muted">{t.progress.calibrating(missing)}</span>
      <ProgressBar
        value={responses}
        max={responses + missing}
        label={t.progress.calibrating(missing)}
      />
    </div>
  );
}
