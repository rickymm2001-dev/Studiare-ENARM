// La lista de apuntes del alumno, con su búsqueda y el formulario para crear uno. Desde aquí se
// abre un apunte en el editor. Cada apunte dice cuántas líneas tiene y cuántas tarjetas da.
//
// La búsqueda recorre los títulos y todas las líneas de todos los apuntes, sin importar acentos ni
// mayúsculas, y muestra las líneas que coinciden. Abrir una deja el cursor en esa línea (B6).
import { CornerDownRight, FileText } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Deck } from '@/data/schemas/decks';
import type { Outline } from '@/data/schemas/outlines';
import { cardCountOf, countNodes, freeSubjects, planCards } from '@/engines/outline';
import { searchOutlines, searchTerms, type OutlineHit } from '@/engines/outlineSearch';
import { t } from '@/i18n/es-MX';
import { Card } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { EmptyState } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';
import { NewOutline } from './NewOutline';
import { outlineHref } from './outlineNav';
import { subjectLabel } from './subjectDraft';

/** Lo que se tocó más reciente va primero */
const byRecent = (a: Outline, b: Outline) =>
  (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);

export function OutlinesList({
  session,
  outlines,
  decks,
}: {
  session: ReadySession;
  outlines: readonly Outline[];
  decks: readonly Deck[];
}) {
  const text = t.outlines;
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const suggestions = useMemo(() => freeSubjects(outlines), [outlines]);

  const rows = useMemo(
    () =>
      [...outlines].sort(byRecent).map((outline) => ({
        outline,
        lines: countNodes(outline.nodes),
        cards: planCards(outline.nodes).plans.reduce(
          (sum, plan) => sum + cardCountOf(plan.draft),
          0,
        ),
      })),
    [outlines],
  );
  const searching = searchTerms(deferred).length > 0;
  const hits = useMemo(() => {
    const found = new Map<string, OutlineHit>();
    for (const hit of searchOutlines(outlines, deferred)) found.set(hit.outlineId, hit);
    return found;
  }, [outlines, deferred]);
  const shown = searching ? rows.filter((row) => hits.has(row.outline.id)) : rows;

  return (
    <div className="flex flex-col gap-4">
      <NewOutline session={session} decks={decks} suggestions={suggestions} />

      {outlines.length === 0 ? (
        <EmptyState title={text.listTitle} description={text.empty} />
      ) : (
        <Card aria-label={text.listTitle}>
          <TextField
            label={text.search}
            hint={text.searchHint}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {searching ? (
            <p role="status" className="mt-3 text-sm text-fg-muted">
              {shown.length === 0 ? text.noMatches : text.searchResults(shown.length)}
            </p>
          ) : null}
          {shown.length > 0 ? (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {shown.map(({ outline, lines, cards }) => {
                const hit = hits.get(outline.id);
                return (
                  <li key={outline.id} className="flex flex-col gap-1 py-1">
                    <Link
                      to={outlineHref(outline.id)}
                      aria-label={text.open(outline.title)}
                      className="flex min-h-touch items-center gap-3 rounded-md py-2 hover:bg-muted"
                    >
                      <FileText aria-hidden className="size-5 shrink-0 text-primary-ink" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{outline.title}</span>
                        <span className="block text-sm text-fg-muted">
                          {text.summary(lines, cards)}
                          {outline.subject ? ` · ${subjectLabel(outline.subject)}` : ''}
                        </span>
                      </span>
                    </Link>
                    {hit ? <LineHits title={outline.title} hit={hit} /> : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </Card>
      )}
    </div>
  );
}

/** Las líneas del apunte donde aparece lo buscado. Cada una abre el apunte en esa línea */
function LineHits({ title, hit }: { title: string; hit: OutlineHit }) {
  const text = t.outlines;
  if (hit.lines.length === 0) {
    return hit.titleMatch ? <p className="pl-8 text-sm text-fg-muted">{text.titleMatch}</p> : null;
  }
  return (
    <ul className="flex flex-col gap-0.5 pb-1 pl-8">
      {hit.lines.map((line) => (
        <li key={line.nodeId}>
          <Link
            to={outlineHref(hit.outlineId, { line: line.nodeId })}
            aria-label={text.openLine(title, line.text)}
            className="flex min-h-touch items-start gap-2 rounded-md px-1 py-2 text-sm hover:bg-muted"
          >
            <CornerDownRight aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 break-words">
              {line.path.length > 0 ? (
                <span className="block text-xs text-fg-muted">{line.path.join(' › ')}</span>
              ) : null}
              <span className="block">{line.text}</span>
            </span>
          </Link>
        </li>
      ))}
      {hit.lineCount > hit.lines.length ? (
        <li className="px-1 text-sm text-fg-muted">
          {text.moreLines(hit.lineCount - hit.lines.length)}
        </li>
      ) : null}
    </ul>
  );
}
