// Mazos (pantalla 12). Precargados que el alumno sigue o deja, con su avance, agrupados por rama
// troncal con sus subespecialidades (D-066). Cada mazo es una fila de la lista, sin caja propia
// (H06 de la revisión de B2), con sus temas plegados (D-078). Abajo van los mazos del alumno, que
// crea y llena a mano. Subir mazos de otras apps llega con la Fase E.
import { BookOpenCheck, BookPlus, Check, ChevronDown, Layers, Library } from 'lucide-react';
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
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { ProgressBar } from '@/ui/components/progress-bar';
import { LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { useUserEvents } from '../shared/useUserEvents';
import { latestCardStates } from '../review/study';
import { StudyTabs } from '../review/StudyTabs';
import { descendantIds } from '@/engines/deckTree';
import { followedDeckIds } from './followed';
import { AiCardsCard } from './AiCardsCard';
import { ExportDecksCard } from './ExportDecksCard';
import { ImportDeckCard } from './ImportDeckCard';
import { OwnDecksCard } from './OwnDecksCard';
import { deckBranch } from './deckBranch';
import { deckTopicsGrouped } from './deckTopics';
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
  // Cifras de los mazos que se siguen, sin contar dos veces una tarjeta (D-091)
  const followedCards = new Set(
    stored === undefined
      ? []
      : [...followed].flatMap((id) =>
          [...descendantIds(stored.decks, id)].flatMap(
            (deckId) => stored.cardsByDeck.get(deckId) ?? [],
          ),
        ),
  );
  const seenCount = [...followedCards].filter((cardId) => states.has(cardId)).length;

  return (
    <>
      <ScreenHeader title={t.screens.decks.title} description={t.screens.decks.description} />
      <StudyTabs />
      {stored !== undefined ? (
        <StatPanel label={t.decks.summary.label}>
          <StatCell
            icon={<Layers />}
            label={t.decks.summary.followed}
            value={followed.size.toLocaleString('es-MX')}
            caption={t.decks.summary.followedCaption}
          />
          <StatCell
            icon={<BookOpenCheck />}
            label={t.decks.summary.seen}
            value={seenCount.toLocaleString('es-MX')}
            caption={t.decks.summary.seenCaption}
          />
          <StatCell
            icon={<Library />}
            label={t.decks.summary.total}
            value={followedCards.size.toLocaleString('es-MX')}
            caption={t.decks.summary.totalCaption}
          />
        </StatPanel>
      ) : null}
      <Card aria-labelledby="precargados-titulo">
        <CardHeader>
          <CardTitle id="precargados-titulo">{t.decks.preloadedTitle}</CardTitle>
          <CardDescription>{t.decks.preloadedDescription}</CardDescription>
        </CardHeader>
        {catalog === undefined || stored === undefined ? (
          <LoadingState label={t.decks.loading} />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col divide-y divide-line">
              {orderedFiles.map((file) => {
                const id = deckIds.deck(file.key);
                const isFollowed = followed.has(id);
                // Las tarjetas viven en las materias, que cuelgan del mazo (D-085)
                const cardIds = [...descendantIds(stored.decks, id)].flatMap(
                  (deckId) => stored.cardsByDeck.get(deckId) ?? [],
                );
                const studied = cardIds.filter((cardId) => states.has(cardId)).length;
                // En el teléfono el ícono va junto al nombre y lo demás a todo lo ancho. En
                // computadora lo demás queda bajo el nombre y las acciones a la derecha
                return (
                  <li
                    key={file.key}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <span
                      aria-hidden
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses(file.key).icon}`}
                    >
                      <Layers className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <span className="font-semibold">{file.name}</span>
                      <span className="text-xs text-fg-muted sm:text-sm">
                        {t.decks.author(file.author)}
                      </span>
                    </div>
                    <div className="col-span-2 flex min-w-0 flex-col gap-2 sm:col-span-1 sm:col-start-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg-muted">
                        <Badge variant="neutral">{branchName(deckBranch(file))}</Badge>
                        <span>{t.decks.stats(file.notes.length, file.media.length)}</span>
                      </div>
                      {isFollowed && cardIds.length > 0 ? (
                        <div className="flex max-w-md flex-col gap-1">
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
                      {(() => {
                        const topicGroups = deckTopicsGrouped(file);
                        const totalTopicCount = topicGroups.reduce(
                          (acc, g) => acc + g.topics.length,
                          0,
                        );
                        return (
                          <details className="group">
                            <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 text-sm font-semibold text-primary-ink [&::-webkit-details-marker]:hidden">
                              {t.decks.topicsTitle}
                              <span className="font-normal text-fg-muted">
                                · {t.decks.topicsSummary(totalTopicCount)}
                              </span>
                              <ChevronDown
                                aria-hidden
                                className="size-4 text-fg-muted transition-transform group-open:rotate-180"
                              />
                            </summary>
                            <div className="mt-2 flex flex-col gap-3">
                              {topicGroups.map((group) => (
                                <div key={group.branchKey} className="flex flex-col gap-1.5">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                                    {group.branchName}
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {group.topics.map((item) => (
                                      <Badge key={item.key} variant="neutral" className="whitespace-normal">
                                        {item.name} · {item.count}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        );
                      })()}
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:justify-end">
                      {session.isDemo ? (
                        <span className="flex items-center gap-1 text-sm font-medium text-fg-muted">
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
      <AiCardsCard session={session} />
      <ImportDeckCard session={session} />
      <ExportDecksCard session={session} decks={ownDecks} />
    </>
  );
}
