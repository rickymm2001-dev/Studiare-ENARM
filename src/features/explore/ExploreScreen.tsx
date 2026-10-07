// Explorar (D-085, fila 4). Todas las tarjetas del alumno en una lista que se busca, filtra y ordena
// sin trabarse con miles de tarjetas, y sobre la que se actúa por lote. La tercera pestaña de
// Repasar y Mazos. El texto buscado se aplaza un instante para que escribir nunca se sienta lento.
import { Link } from 'react-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { rollupCounts } from '@/engines/deckTree';
import { filterRows, sortRows, statusCounts } from '@/engines/explore';
import { buildTagTree, countByPath } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { CheckboxField } from '@/ui/components/field';
import { DemoContentLabel } from '@/ui/components/labels';
import { ActionDock } from '@/ui/components/action-dock';
import { EmptyState, LoadingState } from '@/ui/states/states';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { StudyTabs } from '../review/StudyTabs';
import { BulkActions, type Notice } from './BulkActions';
import { FilterPanel } from './FilterPanel';
import { ResultList } from './ResultList';
import { useExploreData } from './useExploreData';
import { INITIAL_VIEW, PAGE_SIZE, filtersOf, pageCount, type ExploreView } from './view';

export function ExploreScreen() {
  return (
    <RequireSession screen="explore">{(session) => <Explore session={session} />}</RequireSession>
  );
}

function Explore({ session }: { session: ReadySession }) {
  const data = useExploreData(session);
  const [view, setView] = useState<ExploreView>(INITIAL_VIEW);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // La búsqueda de texto se aplaza para que la caja responda al instante aunque haya miles de filas
  const deferredText = useDeferredValue(view.text);
  const applied = useMemo(() => ({ ...view, text: deferredText }), [view, deferredText]);

  const decks = data?.decks;
  const rows = data?.rows;
  // Lo vencido se decide al cargar los datos, no en cada tecla
  const now = data?.now;
  const filtered = useMemo(
    () => (rows && decks && now ? filterRows(rows, filtersOf(applied, decks), now) : []),
    [rows, decks, applied, now],
  );
  const sorted = useMemo(() => sortRows(filtered, applied.sort), [filtered, applied.sort]);

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

  const change = (patch: Partial<ExploreView>) => {
    setView((current) => ({ ...current, ...patch }));
    setPage(0);
    setOpenId(null);
  };

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

  const pages = pageCount(sorted.length);
  const current = Math.min(page, pages - 1);
  const pageRows = sorted.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const pageSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.cardId));
  const anyDemo = pageRows.some((row) => row.isDemo);

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
      for (const row of pageRows) {
        if (on) next.add(row.cardId);
        else next.delete(row.cardId);
      }
      return next;
    });
  };

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
          {anyDemo ? <DemoContentLabel /> : null}
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
            <ResultList
              rows={pageRows}
              decks={data.decks}
              selected={selected}
              onToggle={toggle}
              openId={openId}
              onOpen={setOpenId}
              facesOf={data.facesOf}
              timeZone={session.user.timeZone}
              now={now}
            />
            {pages > 1 ? (
              <nav
                aria-label={t.explore.page(current + 1, pages)}
                className="flex items-center justify-between gap-2 border-t border-line pt-3"
              >
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={current === 0}
                  onClick={() => {
                    setPage(current - 1);
                    setOpenId(null);
                  }}
                >
                  {t.explore.prev}
                </Button>
                <span className="text-sm text-fg-muted">{t.explore.page(current + 1, pages)}</span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={current >= pages - 1}
                  onClick={() => {
                    setPage(current + 1);
                    setOpenId(null);
                  }}
                >
                  {t.explore.next}
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
