// Explorar (D-085, fila 4). Todas las tarjetas del alumno en una lista que se busca, filtra y ordena
// sin trabarse con miles de tarjetas, y sobre la que se actúa por lote. La tercera pestaña de
// Repasar y Mazos. El texto buscado se aplaza un instante para que escribir nunca se sienta lento.
import { Link, useSearchParams } from 'react-router';
import { useDataApi } from '@/data/context';
import { resolveControversy } from '@/data/usecases/aiCards';
import { setSuspended } from '@/data/usecases/organize';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { rollupCounts } from '@/engines/deckTree';
import { filterRows, sortRows, statusCounts, type ExploreStatus } from '@/engines/explore';
import { buildTagTree, countByPath } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { ActionDock } from '@/ui/components/action-dock';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { FeatureGate } from '../shared/FeatureGate';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { StudyTabs } from '../review/StudyTabs';
import { BulkActions, type Notice } from './BulkActions';
import { ExploreTable } from './ExploreTable';
import { FilterPanel } from './FilterPanel';
import { ResultList } from './ResultList';
import { SidePreviewPanel } from './SidePreviewPanel';
import { useExploreData } from './useExploreData';
import { INITIAL_VIEW, PAGE_SIZE, filtersOf, type ExploreView } from './view';

export function ExploreScreen() {
  return (
    <RequireSession screen="explore">
      {(session) => (
        <FeatureGate userId={session.user.id} feature="explore">
          <Explore session={session} />
        </FeatureGate>
      )}
    </RequireSession>
  );
}

/** Estados que se pueden pedir por la dirección, por ejemplo desde el aviso de sanguijuelas */
const STATUS_PARAMS: Record<string, ExploreStatus> = {
  nuevas: 'new',
  aprendiendo: 'learning',
  repaso: 'review',
  reaprendiendo: 'relearning',
  vencidas: 'due',
  suspendidas: 'suspended',
  sanguijuelas: 'leech',
};

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(min-width: 64rem)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 64rem)');
    const handler = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => {
      mq.removeEventListener('change', handler);
    };
  }, []);

  return isDesktop;
}

function Explore({ session }: { session: ReadySession }) {
  const api = useDataApi();
  const data = useExploreData(session);
  const [params] = useSearchParams();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<ExploreView>(() => {
    const asked = STATUS_PARAMS[params.get('estado') ?? ''];
    return asked ? { ...INITIAL_VIEW, status: new Set([asked]) } : INITIAL_VIEW;
  });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [onlyMarked, setOnlyMarked] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // La búsqueda de texto se aplaza para que la caja responda al instante aunque haya miles de filas
  const deferredText = useDeferredValue(view.text);
  const applied = useMemo(() => ({ ...view, text: deferredText }), [view, deferredText]);

  // Reset del desplazamiento al cambiar el texto diferido sin causar efecto en cascada
  const [prevDeferredText, setPrevDeferredText] = useState(deferredText);
  if (prevDeferredText !== deferredText) {
    setPrevDeferredText(deferredText);
    setVisibleCount(PAGE_SIZE);
  }

  const decks = data?.decks;
  const rows = data?.rows;
  // Lo vencido se decide al cargar los datos, no en cada tecla
  const now = data?.now;
  const filtered = useMemo(() => {
    if (!rows || !decks || !now) return [];
    const base = filterRows(rows, filtersOf(applied, decks), now);
    if (!onlyMarked) return base;
    return base.filter((r) => selected.has(r.cardId));
  }, [rows, decks, applied, now, onlyMarked, selected]);

  const sorted = useMemo(() => sortRows(filtered, applied.sort), [filtered, applied.sort]);

  // Observer para carga continua
  useEffect(() => {
    if (visibleCount >= sorted.length) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, sorted.length));
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => { observer.disconnect(); };
  }, [visibleCount, sorted.length]);

  // Lo que daría cada opción de los filtros con todos los demás puestos
  const facets = useMemo(() => {
    if (!rows || !decks || !now) return null;
    const byDeck = new Map<string, number>();
    for (const row of filterRows(rows, filtersOf(applied, decks, 'deck'), now)) {
      byDeck.set(row.deckId, (byDeck.get(row.deckId) ?? 0) + 1);
    }
    const tagRows = filterRows(rows, filtersOf(applied, decks, 'tag'), now);
    return {
      deckCounts: rollupCounts(decks, byDeck),
      tagNodes: buildTagTree(countByPath(tagRows.map((row) => row.tags))),
      statusCounts: statusCounts(filterRows(rows, filtersOf(applied, decks, 'status'), now), now),
      kinds: [...new Set(rows.map((row) => row.kind))].sort(),
    };
  }, [rows, decks, applied, now]);

  const selectedRows = useMemo(
    () => sorted.filter((row) => selected.has(row.cardId)),
    [sorted, selected],
  );

  const visibleRows = useMemo(
    () => sorted.slice(0, visibleCount),
    [sorted, visibleCount],
  );

  const activeCard = useMemo(
    () => (activeCardId ? sorted.find((r) => r.cardId === activeCardId) ?? null : null),
    [sorted, activeCardId],
  );

  const activeFaces = useMemo(
    () => (activeCardId && data ? data.facesOf(activeCardId) : null),
    [data, activeCardId],
  );

  const change = (patch: Partial<ExploreView>) => {
    setView((current) => ({ ...current, ...patch }));
    setVisibleCount(PAGE_SIZE);
    setOpenId(null);
  };

  const toggle = (cardId: string) => {
    setSelected((currentSet) => {
      const next = new Set(currentSet);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const setPageSelection = (on: boolean) => {
    setSelected((currentSet) => {
      const next = new Set(currentSet);
      for (const row of visibleRows) {
        if (on) next.add(row.cardId);
        else next.delete(row.cardId);
      }
      return next;
    });
  };

  const handleSaveNote = async (noteId: string, front: string, back: string) => {
    const note = await api.repos.notes.get(noteId);
    if (!note) return;
    const now = new Date().toISOString();
    if (note.kind === 'basic') {
      await api.repos.notes.put({
        ...note,
        front,
        back,
        updatedAt: now,
      });
    } else if (note.kind === 'cloze') {
      await api.repos.notes.put({
        ...note,
        text: front,
        extra: back,
        updatedAt: now,
      });
    }
  };

  const handleToggleSuspend = async (cardId: string, suspend: boolean) => {
    await setSuspended(api, session.user, [cardId], suspend);
  };

  // Atajos de teclado: flechas para navegar filas, espacio para marcar, Escape para cerrar panel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!visibleRows.length) return;
        if (!activeCardId) {
          setActiveCardId(visibleRows[0]?.cardId ?? null);
        } else {
          const idx = visibleRows.findIndex((r) => r.cardId === activeCardId);
          if (idx >= 0 && idx < visibleRows.length - 1) {
            setActiveCardId(visibleRows[idx + 1]?.cardId ?? null);
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!visibleRows.length) return;
        if (!activeCardId) {
          setActiveCardId(visibleRows[0]?.cardId ?? null);
        } else {
          const idx = visibleRows.findIndex((r) => r.cardId === activeCardId);
          if (idx > 0) {
            setActiveCardId(visibleRows[idx - 1]?.cardId ?? null);
          }
        }
      } else if (e.key === ' ') {
        if (activeCardId) {
          e.preventDefault();
          toggle(activeCardId);
        }
      } else if (e.key === 'Escape') {
        setActiveCardId(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); };
  }, [visibleRows, activeCardId]);

  const header = (
    <>
      <ScreenHeader title={t.screens.explore.title} description={t.screens.explore.description} />
      <StudyTabs />
    </>
  );

  if (!data || !facets || !now) {
    return (
      <>
        {header}
        <LoadingState label={t.explore.loading} />
      </>
    );
  }

  if (data.rows.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          title={t.states.empty.title}
          description={t.explore.empty}
          action={
            <Button asChild>
              <Link to={screenPath('decks')}>{t.studyTabs.decks}</Link>
            </Button>
          }
        />
      </>
    );
  }

  const pageSelected = visibleRows.length > 0 && visibleRows.every((row) => selected.has(row.cardId));

  return (
    <>
      {header}
      <Card aria-label={t.explore.filtersTitle}>
        <FilterPanel
          view={view}
          onChange={change}
          decks={data.decks}
          deckCounts={facets.deckCounts}
          tagNodes={facets.tagNodes}
          statusCounts={facets.statusCounts}
          kinds={facets.kinds}
          markedCount={selected.size}
          onlyMarked={onlyMarked}
          onToggleMarked={(on) => {
            setOnlyMarked(on);
            setVisibleCount(PAGE_SIZE);
          }}
        />
      </Card>
      {selectedRows.length > 0 ? (
        <ActionDock>
          <BulkActions
            session={session}
            selected={selectedRows}
            decks={data.decks}
            onNotice={setNotice}
          />
        </ActionDock>
      ) : null}
      <Card aria-label={t.explore.list}>
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p role="status" className="font-semibold">
            {t.explore.results(sorted.length, data.rows.length)}
          </p>
          {selectedRows.length > 0 ? (
            <p className="text-sm text-fg-muted">{t.explore.selected(selectedRows.length)}</p>
          ) : null}
        </div>
        <p
          role="status"
          className={notice?.failed ? 'mb-2 text-sm text-danger' : 'mb-2 text-sm text-fg-muted'}
        >
          {notice?.text ?? ''}
        </p>
        {sorted.length === 0 ? (
          <p className="py-4 text-fg-muted">{t.explore.noResults}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line pb-2">
              <CheckboxField
                label={t.explore.selectPage}
                checked={pageSelected}
                onChange={(event) => {
                  setPageSelection(event.target.checked);
                }}
              />
              {pageSelected && selectedRows.length < sorted.length ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSelected(new Set(sorted.map((row) => row.cardId)));
                  }}
                >
                  {t.explore.selectAllMatching(sorted.length)}
                </Button>
              ) : null}
              {selectedRows.length > 0 ? (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSelected(new Set());
                  }}
                >
                  {t.explore.clearSelection}
                </Button>
              ) : null}
            </div>

            {isDesktop ? (
              <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                <div className="flex min-w-0 flex-col gap-4">
                  <ExploreTable
                    rows={visibleRows}
                    selected={selected}
                    onToggle={toggle}
                    onToggleAll={(on) => { setPageSelection(on); }}
                    allSelected={pageSelected}
                    activeCardId={activeCardId}
                    onSelectCard={(id) => { setActiveCardId((curr) => (curr === id ? null : id)); }}
                    sort={applied.sort}
                    onSortChange={(sort) => { change({ sort }); }}
                    timeZone={session.user.timeZone}
                  />
                  {visibleCount < sorted.length ? (
                    <div ref={sentinelRef} className="flex justify-center py-4">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { setVisibleCount((count) => Math.min(count + PAGE_SIZE, sorted.length)); }
                        }
                      >
                        {t.explore.loadMore(sorted.length - visibleCount)}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="sticky top-4">
                  <SidePreviewPanel
                    card={activeCard}
                    faces={activeFaces}
                    onClose={() => { setActiveCardId(null); }}
                    onSaveNote={handleSaveNote}
                    onToggleSuspend={handleToggleSuspend}
                    onVerify={async (noteId) => {
                      await resolveControversy(api, session.user, noteId, 'verified');
                    }}
                    timeZone={session.user.timeZone}
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <ResultList
                  rows={visibleRows}
                  decks={data.decks}
                  selected={selected}
                  onToggle={toggle}
                  openId={openId}
                  onOpen={setOpenId}
                  onVerify={async (noteId) => {
                    await resolveControversy(api, session.user, noteId, 'verified');
                  }}
                  facesOf={data.facesOf}
                  timeZone={session.user.timeZone}
                  now={now}
                />
                {visibleCount < sorted.length ? (
                  <div ref={sentinelRef} className="flex justify-center py-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { setVisibleCount((count) => Math.min(count + PAGE_SIZE, sorted.length)); }
                      }
                    >
                      {t.explore.loadMore(sorted.length - visibleCount)}
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
