// Buscar tarjetas (B4 del plan del cambio, comentario 11), antes Explorar (D-085). Un buscador rápido
// en la tercera pestaña de Repasar. Una sola barra de búsqueda con resultados al teclear, filtros
// como chips con su conteo y Más filtros para lo raro. En la computadora una tabla que se ordena por
// columna y un panel al lado para ver y editar la tarjeta sin perder la lista. En el teléfono una
// lista y una hoja de filtros. Casillas y acciones por lote, atajos de teclado y desplazamiento
// continuo en lugar de páginas. Todo cambio pasa por los casos de uso de siempre, así suspender,
// reanudar y reiniciar solo agregan eventos a la bitácora.
import { Search } from 'lucide-react';
import { Dialog } from 'radix-ui';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenHeader } from '@/app/layout/ScreenHeader';
import { screenPath } from '@/app/screens';
import { searchCards, sortCards, type CardSortKey } from '@/engines/cardSearch';
import { buildTopicOutline } from '@/engines/deckTopics';
import { buildTagTree, countByPath } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { ActionDock } from '@/ui/components/action-dock';
import { Button } from '@/ui/components/button';
import { Card } from '@/ui/components/card';
import { Disclosure } from '@/ui/components/disclosure';
import { Kbd, KeyHint } from '@/ui/components/key-hint';
import { SkeletonRows } from '@/ui/components/skeleton';
import { DESKTOP_QUERY, useMediaQuery } from '@/ui/hooks/use-media-query';
import { EmptyState } from '@/ui/states/states';
import { StudyTabs } from '../review/StudyTabs';
import { FeatureGate } from '../shared/FeatureGate';
import { RequireSession, type ReadySession } from '../shared/RequireSession';
import { usePlanText } from '../shared/useActivePlan';
import { useShortcuts } from '../shared/useShortcuts';
import { BulkActions, type Notice } from './BulkActions';
import { CardPanel } from './CardPanel';
import { deckOptions, topicOptions } from './filterOptions';
import { ResultsList } from './ResultsList';
import { ResultsTable } from './ResultsTable';
import { DesktopFilters, PhoneFilters, type FiltersProps } from './SearchFilters';
import {
  clearedView,
  hasActiveFilters,
  nextSort,
  queryOf,
  viewFromParams,
  viewKey,
  withKnownDeck,
  type SearchView,
} from './searchView';
import { useCardSearchData } from './useCardSearchData';
import { ROWS_STEP, useLoadMore } from './useLoadMore';

export function CardSearchScreen() {
  return (
    <RequireSession screen="explore">
      {(session) => (
        <FeatureGate userId={session.user.id} feature="explore">
          <CardSearch session={session} />
        </FeatureGate>
      )}
    </RequireSession>
  );
}

function CardSearch({ session }: { session: ReadySession }) {
  const data = useCardSearchData(session);
  const [params] = useSearchParams();
  const [pickedView, setView] = useState<SearchView>(() => viewFromParams(params));
  // Un ?mazo= de un mazo que no existe se suelta cuando los mazos cargan, en lugar de dejar un filtro sin
  // resultados ni nombre
  const knownDecks = data?.decks;
  const view = useMemo(
    () => (knownDecks ? withKnownDeck(pickedView, knownDecks) : pickedView),
    [pickedView, knownDecks],
  );
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [shown, setShown] = useState({ key: '', count: ROWS_STEP });
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const searchId = useId();
  const panelId = useId();
  const titleId = useId();
  // Sin tarjetas, en Gratis no se sugiere seguir un mazo del catálogo, que es de pago (4.25, B8)
  const emptyText = usePlanText(session.user.id, 'deckCatalog', {
    open: t.cardSearch.empty,
    closed: t.freePlan.catalog.exploreEmpty,
  });

  // El texto se aplaza un instante para que la caja responda al teclear aunque haya miles de filas
  const deferredText = useDeferredValue(view.text);
  const applied = useMemo(() => ({ ...view, text: deferredText }), [view, deferredText]);
  const rows = data?.rows;
  const decks = data?.decks;
  const nowMs = data?.now.getTime();
  // Se ordena solo cuando cambia el orden o las tarjetas. Buscar recorre la lista ya ordenada
  const sorted = useMemo(() => (rows ? sortCards(rows, view.sort) : []), [rows, view.sort]);
  const query = useMemo(() => (decks ? queryOf(applied, decks) : null), [applied, decks]);
  const result = useMemo(
    () => (query && nowMs !== undefined ? searchCards(sorted, query, nowMs) : null),
    [sorted, query, nowMs],
  );
  const allTopics = useMemo(
    () => buildTopicOutline((rows ?? []).map((row) => row.topicPath)),
    [rows],
  );
  const byId = useMemo(() => new Map((rows ?? []).map((row) => [row.cardId, row])), [rows]);
  const kinds = useMemo(() => [...new Set((rows ?? []).map((row) => row.kind))].sort(), [rows]);
  // Las etiquetas solo se cuentan al abrir Más filtros, con todo lo demás puesto
  const tagNodes = useCallback(() => {
    if (!query || nowMs === undefined) return [];
    const withoutTag = searchCards(sorted, { ...query, tag: null }, nowMs).rows;
    return buildTagTree(countByPath(withoutTag.map((row) => row.tags)));
  }, [sorted, query, nowMs]);

  const found = useMemo(() => result?.rows ?? [], [result]);
  const key = viewKey(applied);
  const count = shown.key === key ? shown.count : ROWS_STEP;
  const visible = found.slice(0, count);
  const active = Math.min(activeIndex, Math.max(0, visible.length - 1));
  const selectedRows = useMemo(
    () => found.filter((row) => selected.has(row.cardId)),
    [found, selected],
  );
  const allSelected = found.length > 0 && selectedRows.length === found.length;
  const openRow = openId === null ? undefined : byId.get(openId);

  const loadMore = () => {
    setShown({ key, count: count + ROWS_STEP });
  };
  useLoadMore(sentinelRef, count < found.length, count, loadMore);

  const focusRow = (index: number) => {
    resultsRef.current
      ?.querySelector<HTMLElement>(`[data-row-index="${String(index)}"] [data-row-open]`)
      ?.focus();
  };
  // Una fila que se pidió con las flechas y que todavía no estaba pintada recibe el foco al pintarse
  useEffect(() => {
    const index = pendingFocus.current;
    if (index === null || index >= visible.length) return;
    pendingFocus.current = null;
    focusRow(index);
  });

  const closePanel = () => {
    const id = openId;
    setOpenId(null);
    if (id !== null)
      resultsRef.current?.querySelector<HTMLElement>(`[data-row-open="${id}"]`)?.focus();
  };
  useShortcuts({
    '/': () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    },
  });
  useShortcuts({ escape: closePanel }, desktop && openId !== null);

  const change = (patch: Partial<SearchView>) => {
    setView((current) => ({ ...current, ...patch }));
    setActiveIndex(0);
  };
  const toggle = (cardId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };
  const toggleAll = (on: boolean) => {
    setSelected(on ? new Set(found.map((row) => row.cardId)) : new Set());
  };
  /** Pasa a otra fila con el teclado. Con el panel abierto en la computadora, el panel la sigue */
  const moveTo = (index: number) => {
    if (found.length === 0) return;
    const next = Math.max(0, Math.min(index, found.length - 1));
    setActiveIndex(next);
    if (desktop && openId !== null) setOpenId(found[next]?.cardId ?? null);
    if (next >= count) {
      pendingFocus.current = next;
      setShown({ key, count: Math.max(count + ROWS_STEP, next + 1) });
    } else {
      focusRow(next);
    }
  };
  const onResultsKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('[data-row-index]');
    if (!row) return;
    const index = Number(row.dataset.rowIndex);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveTo(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (index === 0) searchRef.current?.focus();
        else moveTo(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        moveTo(0);
        break;
      case 'End':
        event.preventDefault();
        moveTo(visible.length - 1);
        break;
      case 'x':
      case 'X': {
        const target = found[index];
        if (!target) break;
        event.preventDefault();
        toggle(target.cardId);
        break;
      }
      default:
        break;
    }
  };

  const header = (
    <>
      <ScreenHeader title={t.screens.explore.title} description={t.screens.explore.description} />
      <StudyTabs />
    </>
  );
  if (
    !data ||
    !result ||
    nowMs === undefined ||
    (data.rows.length === 0 && emptyText === undefined)
  ) {
    return (
      <>
        {header}
        <Card>
          <SkeletonRows label={t.cardSearch.loading} rows={6} />
        </Card>
      </>
    );
  }
  if (data.rows.length === 0) {
    // Sin tarjetas el término que llegó de la barra se dice igual, para que no parezca que se perdió
    const term = view.text.trim();
    return (
      <>
        {header}
        <EmptyState
          title={term === '' ? t.states.empty.title : t.cardSearch.noResultsFor(term)}
          description={emptyText}
          action={
            <Button asChild>
              <Link to={screenPath('decks')}>{t.studyTabs.decks}</Link>
            </Button>
          }
        />
      </>
    );
  }

  const filters: FiltersProps = {
    view,
    onChange: change,
    onClear: () => {
      change(clearedView(view));
    },
    deckChoices: deckOptions(data.decks, result.facets.decks),
    topicChoices: topicOptions(allTopics, result.facets.topics, view.topic?.key ?? null),
    facets: result.facets,
    kinds,
    tagNodes,
    results: found.length,
  };
  const shortcuts = t.cardSearch.shortcuts;
  const bulk =
    selectedRows.length > 0 ? (
      <BulkActions
        session={session}
        selected={selectedRows}
        ownDecks={data.ownDecks}
        onNotice={setNotice}
        onClear={() => {
          setSelected(new Set());
        }}
      />
    ) : null;
  const panel = openRow ? (
    <CardPanel
      key={openRow.cardId}
      session={session}
      row={openRow}
      note={data.noteOf(openRow.noteId)}
      deck={data.decks.find((deck) => deck.id === data.noteOf(openRow.noteId)?.deckId)}
      faces={data.facesOf(openRow.cardId)}
      nowMs={nowMs}
      titleId={titleId}
      onClose={closePanel}
    />
  ) : null;
  const resultsProps = {
    rows: visible,
    selected,
    onToggle: toggle,
    openId,
    onOpen: (cardId: string) => {
      setOpenId(cardId === openId && desktop ? null : cardId);
    },
    activeIndex: active,
    onActive: setActiveIndex,
    onKeyDown: onResultsKeyDown,
    panelId,
    nowMs,
    timeZone: session.user.timeZone,
  };

  return (
    <>
      {header}
      <section role="search" aria-label={t.cardSearch.searchLabel} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={searchId} className="sr-only">
            {t.cardSearch.searchLabel}
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-fg-muted"
            />
            <input
              ref={searchRef}
              id={searchId}
              type="search"
              value={view.text}
              placeholder={t.cardSearch.searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${searchId}-ayuda`}
              onChange={(event) => {
                change({ text: event.target.value });
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' && found.length > 0) {
                  event.preventDefault();
                  moveTo(0);
                }
              }}
              className="min-h-touch w-full rounded-md border border-line-strong bg-surface pr-3 pl-10 text-base text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-focus"
            />
          </div>
          <p id={`${searchId}-ayuda`} className="text-sm text-fg-muted">
            {t.cardSearch.searchHint}
          </p>
          <Disclosure
            title={t.cardSearch.advanced.title}
            summary={t.cardSearch.advanced.summary}
            className="mt-1"
          >
            <p className="text-sm text-fg-muted">{t.cardSearch.advanced.intro}</p>
            <ul className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              {t.cardSearch.advanced.examples.map((example) => (
                <li key={example.text} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <button
                    type="button"
                    aria-label={t.cardSearch.advanced.insert(example.text)}
                    className="min-h-touch rounded-sm border border-line bg-muted px-2 py-0.5 font-mono text-sm text-fg hover:bg-surface sm:min-h-8"
                    onClick={() => {
                      change({ text: `${view.text.trim()} ${example.text}`.trim() + ' ' });
                      searchRef.current?.focus();
                    }}
                  >
                    {example.text}
                  </button>
                  <span className="text-sm text-fg-muted">{example.meaning}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        </div>
        {desktop ? <DesktopFilters {...filters} /> : <PhoneFilters {...filters} />}
        <KeyHint>
          <span className="sr-only">{shortcuts.label}. </span>
          <Kbd>/</Kbd> {shortcuts.search} · <Kbd>↑</Kbd> <Kbd>↓</Kbd> {shortcuts.move} ·{' '}
          <Kbd>Enter</Kbd> {shortcuts.open} · <Kbd>Esc</Kbd> {shortcuts.close} · <Kbd>X</Kbd>{' '}
          {shortcuts.select}
        </KeyHint>
      </section>

      <div className="flex items-start gap-4">
        <section
          aria-label={t.cardSearch.resultsLabel}
          className="flex min-w-0 flex-1 flex-col gap-3"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <p role="status" className="font-semibold">
              {t.cardSearch.results(found.length, data.rows.length)}
            </p>
            {!desktop && found.length > 0 ? (
              <Button
                variant="link"
                size="sm"
                onClick={() => {
                  toggleAll(!allSelected);
                }}
              >
                {allSelected ? t.cardSearch.clearSelection : t.cardSearch.selectAll(found.length)}
              </Button>
            ) : null}
          </div>
          <p
            role="status"
            className={notice?.failed ? 'text-sm text-danger' : 'text-sm text-fg-muted'}
          >
            {notice?.text ?? ''}
          </p>
          {/* En la computadora las acciones van arriba de la tabla. En el teléfono van al final y
              se quedan pegadas abajo mientras recorres la lista */}
          {desktop ? bulk : null}
          <div ref={resultsRef}>
            {found.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-2">
                <p className="text-fg-muted">
                  {applied.text.trim() === ''
                    ? t.cardSearch.noResults
                    : t.cardSearch.noResultsFor(applied.text.trim())}
                </p>
                {hasActiveFilters(view) ? (
                  <Button variant="secondary" size="sm" onClick={filters.onClear}>
                    {t.cardSearch.clear}
                  </Button>
                ) : null}
              </div>
            ) : desktop ? (
              <ResultsTable
                {...resultsProps}
                total={found.length}
                sort={view.sort}
                onSort={(column: CardSortKey) => {
                  change({ sort: nextSort(view.sort, column) });
                }}
                allSelected={allSelected}
                someSelected={selectedRows.length > 0}
                onToggleAll={toggleAll}
                compact={panel !== null}
              />
            ) : (
              <ResultsList {...resultsProps} />
            )}
          </div>
          {count < found.length ? (
            <div ref={sentinelRef} className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={loadMore}>
                {t.cardSearch.showMore(Math.min(ROWS_STEP, found.length - count))}
              </Button>
            </div>
          ) : null}
          {bulk && !desktop ? <ActionDock>{bulk}</ActionDock> : null}
        </section>
        {/* El panel crece hasta 28 rem solo en pantallas muy anchas. En 1280 se queda en 24 rem
            para que la tabla quepa sin desplazarse de lado */}
        {desktop && panel ? (
          <section
            id={panelId}
            aria-label={t.cardSearch.panel.label}
            className="sticky top-[calc(var(--spacing-topbar)+1.25rem)] max-h-[calc(100dvh-var(--spacing-topbar)-2.5rem)] w-[24rem] shrink-0 overflow-y-auto rounded-lg border border-line bg-surface p-4 2xl:w-[28rem]"
          >
            {panel}
          </section>
        ) : null}
      </div>

      {desktop ? null : (
        <Dialog.Root
          open={panel !== null}
          onOpenChange={(open) => {
            if (!open) setOpenId(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
            <Dialog.Content
              id={panelId}
              aria-describedby={undefined}
              className="animate-rise fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col overflow-y-auto rounded-t-xl border-t border-line bg-surface px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-raised"
            >
              <Dialog.Title className="sr-only">{t.cardSearch.panel.label}</Dialog.Title>
              {panel}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
