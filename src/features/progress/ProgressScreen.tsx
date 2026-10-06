// Progreso (pantalla 10). Cifras en una fila, tus focos de la semana con atajo a practicar, Conócete
// con las lecturas del motor de autoconocimiento (D-074) y el dominio por rama troncal y por
// subespecialidad con el modelo beta-binomial del motor topics (D-066). Todo en una sola página con
// filas que se abren al tocarlas (D-078). Cada dato muestra calibrando hasta tener datos suficientes.
import { BookOpenCheck, ChevronDown, Clock, Hourglass, ListChecks, Target } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { topicTaxonomy } from '@/demo/content';
import { deckIds } from '@/demo/content/deckEntities';
import { analyzeCategories, type TopicMastery } from '@/engines/topics';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { LoadingState } from '@/ui/states/states';
import { deckBranch } from '../decks/deckBranch';
import { useDeckCatalog } from '../decks/useDeckCatalog';
import { useDecksAndCards } from '../decks/useDecksAndCards';
import { buildSnapshot } from '../home/snapshot';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { DifficultyCard } from './DifficultyCard';
import { difficultyRows } from './difficultyView';
import { FutureLoadSection } from './FutureLoadSection';
import { InsightsPanel, WeeklyFocus } from './InsightsPanel';
import { masteryChip } from './masteryChip';
import { useAnalysis } from './useAnalysis';

export function ProgressScreen() {
  return (
    <RequireSession screen="progress">{(session) => <Progress session={session} />}</RequireSession>
  );
}

function Progress({ session }: { session: ReadySession }) {
  const { user, settings } = session;
  const events = useUserEvents(user.id);
  const catalog = useDeckCatalog();
  const content = useDecksAndCards();
  const analysis = useAnalysis(session, events);

  const header = (
    <ScreenHeader title={t.screens.progress.title} description={t.progress.description} />
  );
  if (
    events === undefined ||
    analysis === undefined ||
    catalog === undefined ||
    content === undefined
  ) {
    return (
      <>
        {header}
        <LoadingState />
      </>
    );
  }

  const { responses, byTopic, report, weakTopics } = analysis;
  const cardNote = new Map(content.cards.map((card) => [card.id, card.noteId]));
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

  return (
    <>
      {header}
      <Card
        aria-label={t.progress.statsLabel}
        className="grid grid-cols-4 divide-x divide-line p-0"
      >
        <Stat icon={<ListChecks />} label={t.progress.questions} value={totals.questions} />
        <Stat
          icon={<Target />}
          label={t.progress.accuracy}
          value={responses.length > 0 ? `${Math.round((correct / responses.length) * 100)}%` : '—'}
        />
        <Stat icon={<BookOpenCheck />} label={t.progress.cards} value={totals.cards} />
        <Stat icon={<Clock />} label={t.progress.minutes} value={totals.minutes} />
      </Card>

      <WeeklyFocus report={report} weakTopics={weakTopics} />

      <InsightsPanel report={report} />

      <TopicsCard
        byBranch={byBranch}
        byTopic={byTopic}
        cardsByBranch={cardsByBranch}
        cardsByTopic={cardsByTopic}
      />

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <DifficultyCard
          rows={difficultyRows({
            responses,
            minResponses: DEFAULT_THRESHOLDS.structure.minResponsesPerCategory,
          })}
        />
        <FutureLoadSection session={session} events={events} content={content} />
      </div>
    </>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2 py-3 sm:px-4">
      <span aria-hidden className="text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="font-display text-lg font-extrabold tabular-nums sm:text-2xl">
        {typeof value === 'number' ? value.toLocaleString('es-MX') : value}
      </span>
      <span className="text-xs leading-tight text-fg-muted sm:text-sm">{label}</span>
    </div>
  );
}

type TopicEntry = TopicMastery;
type BranchEntry = ReturnType<typeof analyzeCategories>[number];

/**
 * Dominio por rama troncal en filas que se abren para ver sus subespecialidades (D-078). Las
 * subespecialidades sin preguntas ni tarjetas quedan ocultas hasta que el alumno pida verlas
 */
function TopicsCard({
  byBranch,
  byTopic,
  cardsByBranch,
  cardsByTopic,
}: {
  byBranch: ReadonlyMap<string, BranchEntry>;
  byTopic: ReadonlyMap<string, TopicEntry>;
  cardsByBranch: ReadonlyMap<string, number>;
  cardsByTopic: ReadonlyMap<string, number>;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const hasData = (key: string) =>
    (byTopic.get(key)?.tally.trials ?? 0) > 0 || (cardsByTopic.get(key) ?? 0) > 0;
  const emptyCount = topicTaxonomy.branches
    .flatMap((branch) => branch.topics)
    .filter((topic) => !hasData(topic.key)).length;
  return (
    <Card aria-labelledby="temas-titulo">
      <CardHeader className="mb-3">
        <CardTitle id="temas-titulo">{t.topicPicker.title}</CardTitle>
        <CardDescription>{t.progress.topicsHint}</CardDescription>
      </CardHeader>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {topicTaxonomy.branches.map((branch) => {
          const entry = byBranch.get(branch.key);
          const state = entry?.state ?? null;
          const visible = branch.topics.filter((topic) => showEmpty || hasData(topic.key));
          const hidden = branch.topics.length - visible.length;
          return (
            <li key={branch.key}>
              <details className="group">
                <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-3 py-1.5 hover:bg-muted [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden
                    className={cn('h-7 w-1 shrink-0 rounded-full', toneClasses(branch.key).bar)}
                  />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-sm font-semibold">{branch.name}</span>
                    <span className="text-xs text-fg-muted">
                      {t.progress.branchCounts(
                        entry?.tally.trials ?? 0,
                        cardsByBranch.get(branch.key) ?? 0,
                      )}
                    </span>
                  </span>
                  {state?.kind === 'ready' ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-sm font-bold tabular-nums',
                        masteryChip(state.mastery),
                      )}
                    >
                      <span className="sr-only">{t.progress.masteryLabel} </span>
                      {Math.round(state.mastery * 100)}%
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-fg-muted [&_svg]:size-3.5">
                      <Hourglass aria-hidden />
                      {t.insights.calibratingLabel}
                    </span>
                  )}
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="flex flex-col gap-1 border-t border-line bg-muted/40 px-3 py-2">
                  {state?.kind === 'ready' ? null : (
                    <p className="text-xs text-fg-muted">
                      {t.progress.calibrating(
                        state?.kind === 'calibrating' ? state.responsesNeeded : 20,
                      )}
                    </p>
                  )}
                  {visible.length > 0 ? (
                    <ul className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                      {visible.map((topic) => (
                        <TopicRow
                          key={topic.key}
                          name={topic.name}
                          entry={byTopic.get(topic.key)}
                          cards={cardsByTopic.get(topic.key) ?? 0}
                        />
                      ))}
                    </ul>
                  ) : null}
                  {hidden > 0 ? (
                    <p className="text-xs text-fg-muted">{t.progress.emptyHidden(hidden)}</p>
                  ) : null}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {emptyCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 self-start"
          aria-pressed={showEmpty}
          onClick={() => {
            setShowEmpty((value) => !value);
          }}
        >
          {showEmpty ? t.progress.hideEmpty : t.progress.showEmpty(emptyCount)}
        </Button>
      ) : null}
    </Card>
  );
}

function TopicRow({
  name,
  entry,
  cards,
}: {
  name: string;
  entry: TopicEntry | undefined;
  cards: number;
}) {
  const state = entry?.state ?? null;
  return (
    <li className="flex min-h-8 items-center justify-between gap-2 text-sm">
      <span className="truncate">{name}</span>
      <span className="shrink-0 text-xs tabular-nums">
        {state?.kind === 'ready' ? (
          <span className={cn('rounded-full px-2 py-0.5 font-bold', masteryChip(state.mastery))}>
            {Math.round(state.mastery * 100)}%
          </span>
        ) : (
          <span className="text-fg-muted">
            {t.progress.topicCounts(entry?.tally.trials ?? 0, cards)}
          </span>
        )}
      </span>
    </li>
  );
}
