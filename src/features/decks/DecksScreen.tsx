// Mazos (pantalla 12). Precargados que el alumno sigue o deja, con su avance. El importador de .apkg
// y la creación manual llegan después (Fases C y E).
import { BookPlus, Check, FileUp, Layers, PencilLine } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import { followDeck, unfollowDeck } from '@/data/usecases/decks';
import { deckIds } from '@/demo/content/deckEntities';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { DemoContentLabel } from '@/ui/components/labels';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { latestCardStates } from '../review/study';
import { followedDeckIds } from './followed';
import { useDeckCatalog } from './useDeckCatalog';

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
          <ul className="flex flex-col gap-3">
            {catalog.map((file) => {
              const id = deckIds.deck(file.key);
              const isFollowed = followed.has(id);
              const cardIds = stored.cardsByDeck.get(id) ?? [];
              const studied = cardIds.filter((cardId) => states.has(cardId)).length;
              return (
                <li
                  key={file.key}
                  className="flex flex-col gap-2 rounded-md border border-line p-3"
                >
                  <div className="flex items-start gap-3">
                    <Layers aria-hidden className="mt-1 size-5 text-primary" />
                    <div className="flex flex-1 flex-col">
                      <span className="font-semibold">{file.name}</span>
                      <span className="text-sm text-fg-muted">{t.decks.author(file.author)}</span>
                      <span className="text-sm text-fg-muted">
                        {t.decks.stats(file.notes.length, file.media.length)}
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
