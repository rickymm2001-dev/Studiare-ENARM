// Apuntes (D-092, fila 2 de la guía de Anki). Escribes en esquema y una marca en una línea la vuelve
// tarjeta, con la idea de RemNote pero guardada en el mismo modelo de notas y tarjetas, así FSRS, el
// tutor y la bitácora siguen funcionando igual. La cuarta pestaña de Repasar y Mazos.
import { BookText, FilePlus2, Layers3, Link2, ListTree } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { OutlinePage } from '@/data/schemas/outlines';
import {
  OutlineError,
  createOutline,
  deleteOutline,
  renameOutline,
} from '@/data/usecases/outlines';
import { analyzeOutline, backlinks } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { TextField } from '@/ui/components/field';
import { StatCell, StatPanel } from '@/ui/components/stat-panel';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { StudyTabs } from '../review/StudyTabs';
import { FeatureGate } from '../shared/FeatureGate';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { OutlineEditor } from './OutlineEditor';
import { useOutlines } from './useOutlines';

export function NotesScreen() {
  return (
    <RequireSession screen="notes">
      {(session) => (
        <FeatureGate userId={session.user.id} feature="outlines">
          <Notes session={session} />
        </FeatureGate>
      )}
    </RequireSession>
  );
}

const countOf = (page: OutlinePage) => {
  const plan = analyzeOutline(page.lines, page.tags);
  return {
    lines: page.lines.filter((line) => line.text.trim() !== '').length,
    cards: plan.cards.reduce((sum, card) => sum + card.cards, 0),
    links: plan.links.length,
  };
};

function Notes({ session }: { session: ReadySession }) {
  const pages = useOutlines(session.user.id);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('apunte');

  const header = (
    <>
      <ScreenHeader title={t.screens.notes.title} description={t.screens.notes.description} />
      <StudyTabs />
    </>
  );
  if (pages === undefined) {
    return (
      <>
        {header}
        <LoadingState label={t.notes.loading} />
      </>
    );
  }

  const open = (id: string | null) => {
    setParams(id ? { apunte: id } : {}, { replace: false });
  };

  if (selectedId) {
    const page = pages.find((entry) => entry.id === selectedId);
    return (
      <>
        {header}
        {page ? (
          <NotePage key={page.id} session={session} page={page} pages={pages} onOpen={open} />
        ) : (
          <EmptyState
            title={t.notes.missingTitle}
            description={t.notes.missingBody}
            action={
              <Button
                onClick={() => {
                  open(null);
                }}
              >
                {t.notes.back}
              </Button>
            }
          />
        )}
      </>
    );
  }

  const totals = pages.reduce(
    (sum, page) => {
      const counts = countOf(page);
      return { lines: sum.lines + counts.lines, cards: sum.cards + counts.cards };
    },
    { lines: 0, cards: 0 },
  );

  return (
    <>
      {header}
      <StatPanel label={t.notes.summary.label}>
        <StatCell
          icon={<BookText />}
          label={t.notes.summary.pages}
          value={pages.length.toLocaleString('es-MX')}
          caption={t.notes.summary.pagesCaption}
        />
        <StatCell
          icon={<ListTree />}
          label={t.notes.summary.lines}
          value={totals.lines.toLocaleString('es-MX')}
          caption={t.notes.summary.linesCaption}
        />
        <StatCell
          icon={<Layers3 />}
          label={t.notes.summary.cards}
          value={totals.cards.toLocaleString('es-MX')}
          caption={t.notes.summary.cardsCaption}
        />
      </StatPanel>
      <NewPageCard session={session} onCreated={open} />
      {pages.length === 0 ? (
        <EmptyState title={t.states.empty.title} description={t.notes.empty} />
      ) : (
        <Card aria-labelledby="apuntes-titulo">
          <CardHeader>
            <CardTitle id="apuntes-titulo">{t.notes.listTitle}</CardTitle>
          </CardHeader>
          <ul aria-label={t.notes.listLabel} className="grid gap-2 md:grid-cols-2">
            {pages.map((page) => {
              const counts = countOf(page);
              return (
                <li key={page.id}>
                  <Link
                    to={`${screenPath('notes')}?apunte=${page.id}`}
                    aria-label={t.notes.open(page.title)}
                    className="flex min-h-touch flex-col gap-0.5 rounded-lg border border-line bg-surface p-3 shadow-card transition-colors hover:bg-muted"
                  >
                    <span className="font-semibold">{page.title}</span>
                    <span className="text-sm text-fg-muted">
                      {t.notes.pageMeta(counts.lines, counts.cards)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

/** Formulario para crear un apunte nuevo. Al crearlo se abre para empezar a escribir */
function NewPageCard({
  session,
  onCreated,
}: {
  session: ReadySession;
  onCreated: (id: string) => void;
}) {
  const api = useDataApi();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (title.trim() === '') {
      setError(t.notes.titleEmpty);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const page = await createOutline(api, session.user, { title });
      setTitle('');
      onCreated(page.id);
    } catch (problem) {
      setError(
        problem instanceof OutlineError && problem.code === 'duplicate_title'
          ? t.notes.titleTaken
          : t.notes.createError,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card aria-labelledby="nuevo-apunte-titulo">
      <CardHeader>
        <CardTitle id="nuevo-apunte-titulo">{t.notes.createTitle}</CardTitle>
        <CardDescription>{t.notes.createBody}</CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <TextField
          className="flex-1"
          label={t.notes.titleLabel}
          value={title}
          maxLength={120}
          error={error}
          onChange={(event) => {
            setTitle(event.target.value);
          }}
        />
        <Button type="submit" disabled={busy} className="self-start sm:mb-0">
          <FilePlus2 aria-hidden />
          {busy ? t.notes.creating : t.notes.create}
        </Button>
      </form>
    </Card>
  );
}

/** Un apunte abierto. Título, etiquetas, esquema, enlaces y borrar */
function NotePage({
  session,
  page,
  pages,
  onOpen,
}: {
  session: ReadySession;
  page: OutlinePage;
  pages: readonly OutlinePage[];
  onOpen: (id: string | null) => void;
}) {
  const api = useDataApi();
  const [title, setTitle] = useState(page.title);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const rename = async () => {
    setMessage(null);
    try {
      await renameOutline(api, session.user, page.id, title);
      setMessage({ text: t.notes.renamed, error: false });
    } catch (problem) {
      setMessage({
        text:
          problem instanceof OutlineError && problem.code === 'duplicate_title'
            ? t.notes.titleTaken
            : problem instanceof OutlineError && problem.code === 'empty_title'
              ? t.notes.titleEmpty
              : t.notes.renameError,
        error: true,
      });
    }
  };

  const createLinked = async (linkedTitle: string) => {
    setMessage(null);
    try {
      await createOutline(api, session.user, { title: linkedTitle });
    } catch {
      setMessage({ text: t.notes.createError, error: true });
    }
  };

  const remove = async () => {
    try {
      await deleteOutline(api, session.user, page.id);
      onOpen(null);
    } catch {
      setMessage({ text: t.notes.remove.error, error: true });
    }
  };

  const incoming = backlinks(pages, page);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={() => {
          onOpen(null);
        }}
      >
        {t.notes.back}
      </Button>
      <Card aria-labelledby="apunte-titulo">
        <CardHeader>
          <CardTitle id="apunte-titulo">{page.title}</CardTitle>
        </CardHeader>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void rename();
          }}
        >
          <TextField
            className="flex-1"
            label={t.notes.renameLabel}
            value={title}
            maxLength={120}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
          <Button type="submit" variant="secondary" disabled={title.trim() === page.title}>
            {t.notes.rename}
          </Button>
        </form>
        {message ? (
          <p
            role={message.error ? 'alert' : 'status'}
            className={message.error ? 'text-sm text-danger' : 'text-sm text-fg-muted'}
          >
            {message.text}
          </p>
        ) : null}
      </Card>

      <Card aria-labelledby="esquema-titulo">
        <CardHeader>
          <CardTitle id="esquema-titulo">{t.notes.editorLabel}</CardTitle>
        </CardHeader>
        <OutlineEditor
          session={session}
          page={page}
          pages={pages}
          onCreateLinked={(linkedTitle) => {
            void createLinked(linkedTitle);
          }}
        />
      </Card>

      <Disclosure title={t.notes.help.title} summary={t.notes.help.summary}>
        <ul className="flex flex-col gap-1.5 text-sm">
          {t.notes.help.items.map(([mark, meaning]) => (
            <li key={mark}>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8rem]">{mark}</code>{' '}
              {meaning}
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-muted">{t.notes.help.keys}</p>
        <p className="text-sm text-fg-muted">{t.notes.help.unfinished}</p>
      </Disclosure>

      <Card aria-labelledby="enlaces-titulo">
        <CardHeader>
          <CardTitle id="enlaces-titulo">{t.notes.links.backlinks}</CardTitle>
        </CardHeader>
        {incoming.length === 0 ? (
          <p className="text-sm text-fg-muted">{t.notes.links.noBacklinks}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {incoming.map((entry) => (
              <li key={entry.id}>
                <Link
                  to={`${screenPath('notes')}?apunte=${entry.id}`}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 text-sm font-semibold text-primary hover:underline"
                >
                  <Link2 aria-hidden className="size-4" />
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-col items-start gap-2">
        {confirming ? (
          <>
            <p className="text-sm font-medium">{t.notes.remove.confirm(page.title)}</p>
            <div className="flex gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  void remove();
                }}
              >
                {t.notes.remove.yes}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                {t.notes.remove.no}
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t.notes.remove.button}
          </Button>
        )}
      </div>
    </>
  );
}
