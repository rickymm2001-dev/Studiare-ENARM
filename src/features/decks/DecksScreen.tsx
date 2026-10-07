// Mazos (pantalla 12). Precargados que el alumno sigue o deja, con su avance, agrupados por rama
// troncal con sus subespecialidades (D-066). Cada mazo es una tarjeta compacta con sus temas
// plegados (D-078). Abajo van los mazos del alumno, que crea y llena a mano. Subir mazos de otras
// apps llega con la Fase E.
import { BookPlus, Check, ChevronDown, Layers } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { followDeck, unfollowDeck } from '@/data/usecases/decks';
import { topicTaxonomy } from '@/demo/content';
import { deckIds } from '@/demo/content/deckEntities';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { latestCardStates } from '../review/study';
import { StudyTabs } from '../review/StudyTabs';
import { followedDeckIds } from './followed';
import { OwnDecksCard } from './OwnDecksCard';
import { deckBranch, topTopics } from './deckBranch';
import { useDeckCatalog } from './useDeckCatalog';

const topicName = new Map(
  topicTaxonomy.branches.flatMap((branch) =>
    branch.topics.map((topic) => [topic.key, topic.name] as const),
  ),
);

export function DecksScreen() {
  return <RequireSession screen="decks">{(session) => <Decks session={session} />}</RequireSession>;
}

function Decks({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const catalog = useDeckCatalog();
  const events = useUserEvents(session.user.id);
  const stored = useLiveData(async () => {
    const [decks, cards] = await Promise.all([api.repos.decks.list(), api.repos.cards.list()]);
    const cardsByDeck = new Map<string, string[]>();
    for (const card of cards)
      cardsByDeck.set(card.deckId, [...(cardsByDeck.get(card.deckId) ?? []), card.id]);
    return { decks, cardsByDeck };
  }, [api.repos]);
  const [busy, setBusy] = useState<string | null>(null);

  const followed = followedDeckIds(session, stored?.decks ?? []);
  // Mazos propios del alumno, como Mis errores, que se arma con sus preguntas falladas
  const ownDecks = (stored?.decks ?? []).filter((deck) => deck.ownerId === session.user.id);
  const states = latestCardStates(events ?? []);
  // Mazos en el orden de las ramas troncales y las ramas sin mazos juntas en una línea (D-076)
  const branchOrder = topicTaxonomy.branches.map((branch) => branch.key);
  const orderedFiles = [...(catalog ?? [])].sort(
    (a, b) => branchOrder.indexOf(deckBranch(a)) - branchOrder.indexOf(deckBranch(b)),
  );
  const emptyBranches = topicTaxonomy.branches.filter(
    (branch) => !(catalog ?? []).some((file) => deckBranch(file) === branch.key),
  );
  const branchName = (key: string) =>
    topicTaxonomy.branches.find((branch) => branch.key === key)?.name ?? key;

  return (
    <>
      <ScreenHeader title={t.screens.decks.title} description={t.screens.decks.description} />
      <StudyTabs />
      <Card aria-labelledby="precargados-titulo">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle id="precargados-titulo">{t.decks.preloadedTitle}</CardTitle>
            <DemoContentLabel />
          </div>
          <CardDescription>{t.decks.preloadedDescription}</CardDescription>
        </CardHeader>
        {catalog === undefined || stored === undefined ? (
          <LoadingState label={t.decks.loading} />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {orderedFiles.map((file) => {
                const id = deckIds.deck(file.key);
                const isFollowed = followed.has(id);
                const cardIds = stored.cardsByDeck.get(id) ?? [];
                const studied = cardIds.filter((cardId) => states.has(cardId)).length;
                return (
                  <li
                    key={file.key}
                    className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-card"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses(file.key).icon}`}
                      >
                        <Layers className="size-5" />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{file.name}</span>
                        <span className="text-xs text-fg-muted sm:text-sm">
                          {t.decks.author(file.author)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${toneClasses(deckBranch(file)).chip}`}
                      >
                        {branchName(deckBranch(file))}
                      </span>
                      <span>{t.decks.stats(file.notes.length, file.media.length)}</span>
                    </div>
                    {isFollowed && cardIds.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <ProgressBar
                          value={studied}
                          max={cardIds.length}
                          label={t.decks.progress(studied, cardIds.length)}
                          className="h-2"
                        />
                        <span className="text-xs text-fg-muted sm:text-sm">
                          {t.decks.progress(studied, cardIds.length)}
                        </span>
                      </div>
                    ) : null}
                    <details className="group">
                      <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                        {t.decks.topicsTitle}
                        <span className="font-normal text-fg-muted">
                          · {t.decks.topicsSummary(topTopics(file).length)}
                        </span>
                        <ChevronDown
                          aria-hidden
                          className="size-4 text-fg-muted transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {topTopics(file).map(([topic, count]) => (
                          <span
                            key={topic}
                            className="rounded-full bg-muted px-2 py-0.5 text-xs text-fg-muted"
                          >
                            {topicName.get(topic) ?? topic} · {count}
                          </span>
                        ))}
                      </div>
                    </details>
                    <div className="flex flex-wrap items-center gap-2">
                      {session.isDemo ? (
                        <span className="flex items-center gap-1 text-sm font-medium text-success">
                          <Check aria-hidden className="size-4" />
                          {t.decks.following}
                        </span>
                      ) : isFollowed ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            void unfollowDeck(api, session.user, file.key);
                          }}
                        >
                          {t.decks.unfollow}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={busy !== null}
                          onClick={() => {
                            setBusy(file.key);
                            void followDeck(api, session.user, file).finally(() => {
                              setBusy(null);
                            });
                          }}
                        >
                          <BookPlus aria-hidden />
                          {busy === file.key ? t.decks.adding : t.decks.follow}
                        </Button>
                      )}
                      {isFollowed ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={screenPath('review')}>{t.widgets.today.review}</Link>
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {emptyBranches.length > 0 ? (
              <p className="text-sm text-fg-muted">
                {t.decks.emptyBranches(emptyBranches.map((branch) => branch.name).join(', '))}
              </p>
            ) : null}
          </div>
        )}
      </Card>
      <OwnDecksCard
        session={session}
        decks={ownDecks}
        cardsByDeck={stored?.cardsByDeck ?? new Map()}
        states={states}
      />
    </>
  );
}
