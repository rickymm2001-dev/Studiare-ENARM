// Catálogo de mazos de la nube en Mazos (B11, 4.8 y 5.8 del plan de B11, respuestas 46 y 47, 4.21 y
// 4.25 del plan del cambio). Sale de Supabase con la bandera deckCatalogCloud. Cada mazo muestra su
// autor, sus cifras y sus materias (submazos) con su tamaño. Los planes de pago bajan las materias que
// quieran, una por una o todas con el aviso del tamaño, y las repasan sin conexión. Una versión nueva se
// avisa y solo se baja lo que cambió. Gratis ve los mazos, sus materias y unas notas de muestra sin
// imágenes, con el candado y la prueba gratis de B8.
import { Download, Layers, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type {
  DeckCatalogEntry,
  DeckCatalogList,
  DeckCatalogSubjectInfo,
} from '@/data/bank/contracts';
import { getCloud } from '@/data/cloud/client';
import { downloadDeckFile, fetchDeckCatalog, recordDeckDownload } from '@/data/cloud/deckCatalog';
import { useDataApi } from '@/data/context';
import { useLiveData } from '@/data/hooks';
import {
  askPersistentStorage,
  CatalogDeckError,
  downloadCatalogSubject,
  refollowCatalogDeck,
  removeCatalogDownloads,
  subjectStates,
  type CatalogDeckFailure,
  type CatalogFiles,
} from '@/data/usecases/catalogDecks';
import { unfollowDeck } from '@/data/usecases/decks';
import { deckCatalogText as text, fileSize } from '@/i18n/cloudDecks';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { ErrorState, LoadingState } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';
import { CatalogLockNotice, CatalogRowLock } from './CatalogLock';

type CatalogState =
  | { status: 'loading' }
  | { status: 'offline' }
  | { status: 'failed' }
  | { status: 'ready'; list: DeckCatalogList };

/** La lista del catálogo, con su estado. reload la vuelve a pedir */
function useCloudDeckCatalog(): { state: CatalogState; reload: () => void } {
  const [state, setState] = useState<CatalogState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = async (): Promise<CatalogState> => {
      const cloud = getCloud();
      if (!cloud) return { status: 'offline' };
      const reply = await fetchDeckCatalog(cloud);
      if (reply.ok) return { status: 'ready', list: reply.value };
      return { status: reply.reason === 'network' ? 'offline' : 'failed' };
    };
    void load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [attempt]);
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  }, []);
  return { state, reload };
}

export function CloudDeckCatalog({ session }: { session: ReadySession }) {
  const { state, reload } = useCloudDeckCatalog();
  const api = useDataApi();
  const downloads = useLiveData(
    () => api.repos.bankState.get('decks').then((value) => value?.downloads ?? []),
    [api.repos],
  );
  return (
    <Card aria-labelledby="catalogo-nube-titulo">
      <CardHeader>
        <CardTitle id="catalogo-nube-titulo">{text.title}</CardTitle>
        <CardDescription>{text.description}</CardDescription>
      </CardHeader>
      {state.status === 'ready' && !state.list.canDownload ? <CatalogLockNotice /> : null}
      {state.status === 'loading' || downloads === undefined ? (
        <LoadingState label={text.loading} />
      ) : state.status === 'offline' ? (
        <p role="status" className="text-sm text-fg-muted">
          {text.offline}
        </p>
      ) : state.status === 'failed' ? (
        <ErrorState description={text.failed} onRetry={reload} />
      ) : state.list.decks.length === 0 ? (
        <p className="text-sm text-fg-muted">{text.empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {state.list.decks.map((deck) => (
            <CatalogDeckCard
              key={deck.deckKey}
              deck={deck}
              canDownload={state.list.canDownload}
              downloads={downloads}
              session={session}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function CatalogDeckCard({
  deck,
  canDownload,
  downloads,
  session,
}: {
  deck: DeckCatalogEntry;
  canDownload: boolean;
  downloads: Parameters<typeof subjectStates>[1];
  session: ReadySession;
}) {
  const api = useDataApi();
  const states = subjectStates(deck, downloads);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);
  const followed = session.user.settings.followedDecks.includes(deck.deckKey);
  const pending = deck.subjects.filter((subject) => states.get(subject.subjectKey) !== 'current');
  const downloadedCount = deck.subjects.length - pending.length;
  const hasUpdate = deck.subjects.some((subject) => states.get(subject.subjectKey) === 'update');
  const pendingBytes = pending.reduce((sum, subject) => sum + subject.bytes, 0);
  const branch = deck.subjects.find((subject) => subject.branch)?.branch ?? deck.deckKey;

  const download = async (subjects: readonly DeckCatalogSubjectInfo[], label: string) => {
    const cloud = getCloud();
    setMessage(null);
    if (!cloud) {
      setMessage({ kind: 'error', text: text.failures.network });
      return;
    }
    setBusy(label);
    const files: CatalogFiles = {
      download: (path) => downloadDeckFile(cloud, path),
      record: (input) => recordDeckDownload(cloud, input),
    };
    try {
      // Que el teléfono no borre las imágenes cuando le falte espacio (8.32)
      await askPersistentStorage();
      let notes = 0;
      for (const subject of subjects) {
        // El perfil cambia al seguir el mazo, así que se lee el más reciente en cada materia
        const user = (await api.repos.users.get(session.user.id)) ?? session.user;
        notes += (await downloadCatalogSubject({ api, user, deck, subject, files })).notes;
      }
      setMessage({ kind: 'done', text: text.done(notes) });
    } catch (error) {
      const reason: CatalogDeckFailure =
        error instanceof CatalogDeckError ? error.reason : 'network';
      setMessage({ kind: 'error', text: text.failures[reason] });
    } finally {
      setBusy(null);
    }
  };

  // Quitar descargas libera el espacio de las imágenes y deja las notas con sus repasos (8.32)
  const remove = async () => {
    setMessage(null);
    setBusy('remove');
    try {
      const user = (await api.repos.users.get(session.user.id)) ?? session.user;
      await removeCatalogDownloads(api, user, deck.deckKey);
      setMessage({ kind: 'done', text: text.removed });
    } catch {
      setMessage({ kind: 'error', text: text.removeFailed });
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 py-3">
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneClasses(branch).icon}`}
      >
        <Layers className="size-5" />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="font-semibold">{deck.name}</h3>
          <span className="text-xs text-fg-muted sm:text-sm">{t.decks.author(deck.author)}</span>
          <span className="text-sm text-fg-muted">
            {text.totals(deck.notes, fileSize(deck.bytes))}
          </span>
        </div>
        {canDownload && hasUpdate ? (
          <p className="text-sm font-medium">{text.updateAvailable}</p>
        ) : null}
        {canDownload && pending.length > 0 ? (
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              className="self-start"
              disabled={busy !== null}
              onClick={() => {
                void download(pending, 'all');
              }}
            >
              {hasUpdate ? <RefreshCw aria-hidden /> : <Download aria-hidden />}
              {busy === 'all'
                ? text.downloading
                : hasUpdate && downloadedCount > 0
                  ? text.updateAll(fileSize(pendingBytes))
                  : text.downloadAll(fileSize(pendingBytes))}
            </Button>
            <span className="text-xs text-fg-muted sm:text-sm">
              {text.sizeWarning(fileSize(pendingBytes))}
            </span>
          </div>
        ) : null}
        {message ? (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={message.kind === 'error' ? 'text-sm font-medium text-danger' : 'text-sm'}
          >
            {message.text}
          </p>
        ) : null}
        <Disclosure
          title={text.subjects(deck.subjects.length)}
          summary={text.subjectsSummary(downloadedCount, deck.subjects.length)}
        >
          <ul className="flex flex-col divide-y divide-line">
            {deck.subjects.map((subject) => {
              const state = states.get(subject.subjectKey) ?? 'none';
              return (
                <li
                  key={subject.subjectKey}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{subject.name}</span>
                    <span className="text-xs text-fg-muted sm:text-sm">
                      {text.subjectStats(subject.notes, fileSize(subject.bytes))}
                    </span>
                  </span>
                  {!canDownload ? (
                    <CatalogRowLock />
                  ) : state === 'current' ? (
                    <span className="text-sm font-medium text-fg-muted">{text.downloaded}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy !== null}
                      aria-label={
                        state === 'update'
                          ? text.updateLabel(subject.name)
                          : text.downloadLabel(subject.name)
                      }
                      onClick={() => {
                        void download([subject], subject.subjectKey);
                      }}
                    >
                      {busy === subject.subjectKey
                        ? text.downloading
                        : state === 'update'
                          ? text.update
                          : text.download}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Disclosure>
        {!canDownload && deck.preview.length > 0 ? (
          <Disclosure title={text.preview} summary={text.previewHint}>
            <ul className="flex flex-col gap-2">
              {deck.preview.map((note, index) => (
                <li key={index} className="rounded-md border border-line p-3 text-sm">
                  {note.kind === 'basic' ? (
                    <>
                      <p className="font-medium">{plainText(note.front)}</p>
                      <p className="mt-1 text-fg-muted">{plainText(note.back)}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">{plainText(note.text)}</p>
                      {note.extra ? (
                        <p className="mt-1 text-fg-muted">{plainText(note.extra)}</p>
                      ) : null}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
        {downloadedCount > 0 ? (
          <div className="flex flex-wrap gap-2">
            {followed ? (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link to={screenPath('review')}>{text.review}</Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void unfollowDeck(api, session.user, deck.deckKey);
                  }}
                >
                  {t.decks.unfollow}
                </Button>
              </>
            ) : (
              // Lo bajado sigue en el dispositivo, así que se vuelve a seguir sin bajarlo otra vez
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  void refollowCatalogDeck(api, session.user, deck.deckKey);
                }}
              >
                {t.decks.follow}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              aria-label={text.removeDownloadsLabel(deck.name)}
              onClick={() => {
                void remove();
              }}
            >
              {text.removeDownloads}
            </Button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

/** El texto de una nota de muestra, sin etiquetas HTML ni huecos de cloze */
function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent
    .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
