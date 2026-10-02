// Mazos (pantalla 12). Precargados que el alumno sigue o deja, con su avance, agrupados por rama
// troncal con sus subespecialidades (D-066). Subir mazos y crearlos a mano llegan después.
import { BookPlus, Check, FileUp, Layers, PencilLine } from 'lucide-react';
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
import { followedDeckIds } from './followed';
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
    return { deckIds: decks.map((deck) => deck.id), cardsByDeck };
  }, [api.repos]);
  const [busy, setBusy] = useState<string | null>(null);

  const followed = followedDeckIds(session, stored?.deckIds ?? []);
  const states = latestCardStates(events ?? []);

  return (
    <>
      <ScreenHeader title={t.screens.decks.title} description={t.screens.decks.description} />
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
          <div className="flex flex-col gap-5">
            {topicTaxonomy.branches.map((branch) => {
              const files = catalog.filter((file) => deckBranch(file) === branch.key);
              return (
                <section key={branch.key} aria-labelledby={`rama-${branch.key}`}>
                  <h3
                    id={`rama-${branch.key}`}
                    className={`mb-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${toneClasses(branch.key).chip}`}
                  >
                    {branch.name}
                  </h3>
                  {files.length === 0 ? (
                    <p className="text-sm text-fg-muted">{t.decks.noDecksInBranch}</p>
                  ) : (
                    <ul className="grid gap-3 lg:grid-cols-2">
                      {files.map((file) => {
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
                                className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${toneClasses(file.key).icon}`}
                              >
                                <Layers className="size-5" />
                              </span>
                              <div className="flex flex-1 flex-col">
                                <span className="font-semibold">{file.name}</span>
                                <span className="text-sm text-fg-muted">
                                  {t.decks.author(file.author)}
                                </span>
                                <span className="text-sm text-fg-muted">
                                  {t.decks.stats(file.notes.length, file.media.length)}
                                </span>
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {topTopics(file).map(([topic, count]) => (
                                    <span
                                      key={topic}
                                      className="rounded-full bg-muted px-2 py-0.5 text-xs text-fg-muted"
                                    >
                                      {topicName.get(topic) ?? topic} · {count}
                                    </span>
                                  ))}
                                </span>
                              </div>
                            </div>
                            {isFollowed && cardIds.length > 0 ? (
                              <ProgressBar
                                value={studied}
                                max={cardIds.length}
                                label={t.decks.progress(studied, cardIds.length)}
                              />
                            ) : null}
                            {isFollowed && cardIds.length > 0 ? (
                              <span className="text-sm text-fg-muted">
                                {t.decks.progress(studied, cardIds.length)}
                              </span>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
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
                  )}
                </section>
              );
            })}
          </div>
        )}
      </Card>
      <Card aria-labelledby="importar-titulo">
        <CardHeader>
          <CardTitle id="importar-titulo" className="flex items-center gap-2">
            <FileUp aria-hidden className="size-5" />
            {t.decks.importTitle}
          </CardTitle>
          <CardDescription>{t.decks.importBody}</CardDescription>
        </CardHeader>
      </Card>
      <Card aria-labelledby="crear-mazo-titulo">
        <CardHeader>
          <CardTitle id="crear-mazo-titulo" className="flex items-center gap-2">
            <PencilLine aria-hidden className="size-5" />
            {t.decks.createTitle}
          </CardTitle>
          <CardDescription>{t.decks.createBody}</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
