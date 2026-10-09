// La lista de apuntes del alumno, con su búsqueda y el formulario para crear uno. Desde aquí se
// abre un apunte en el editor. Cada apunte dice cuántas líneas tiene y cuántas tarjetas da.
import { FileText } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { screenPath } from '@/app/screens';
import { useDataApi } from '@/data/context';
import type { Outline } from '@/data/schemas/outlines';
import { createOutline } from '@/data/usecases/outlines';
import { cardCountOf, countNodes, normalizeTitle, planCards } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';
import { Card, CardHeader, CardTitle } from '@/ui/components/card';
import { TextField } from '@/ui/components/field';
import { EmptyState } from '@/ui/states/states';
import type { ReadySession } from '../shared/RequireSession';

const hrefOf = (id: string) => `${screenPath('outlines')}?apunte=${encodeURIComponent(id)}`;

/** Todas las líneas del apunte en un solo texto, para buscar en ellas */
function textOf(outline: Outline): string {
  const parts: string[] = [outline.title];
  const walk = (nodes: Outline['nodes']) => {
    for (const node of nodes) {
      parts.push(node.text);
      walk(node.children);
    }
  };
  walk(outline.nodes);
  return normalizeTitle(parts.join(' '));
}

export function OutlinesList({
  session,
  outlines,
}: {
  session: ReadySession;
  outlines: readonly Outline[];
}) {
  const api = useDataApi();
  const navigate = useNavigate();
  const text = t.outlines;
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);

  const rows = useMemo(
    () =>
      outlines.map((outline) => ({
        outline,
        lines: countNodes(outline.nodes),
        cards: planCards(outline.nodes).plans.reduce(
          (sum, plan) => sum + cardCountOf(plan.draft),
          0,
        ),
        haystack: textOf(outline),
      })),
    [outlines],
  );
  const shown = useMemo(() => {
    const needle = normalizeTitle(deferred);
    const filtered = needle === '' ? rows : rows.filter((row) => row.haystack.includes(needle));
    // Lo que se tocó más reciente va primero
    return [...filtered].sort((a, b) =>
      (b.outline.updatedAt ?? b.outline.createdAt).localeCompare(
        a.outline.updatedAt ?? a.outline.createdAt,
      ),
    );
  }, [rows, deferred]);

  const create = async () => {
    if (title.trim() === '') {
      setTitleError(text.titleRequired);
      return;
    }
    setTitleError(null);
    setProblem(null);
    setBusy(true);
    try {
      const outline = await createOutline(api, session.user, { title });
      setTitle('');
      void navigate(hrefOf(outline.id));
    } catch {
      setProblem(text.createFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card aria-labelledby="nuevo-apunte">
        <CardHeader>
          <CardTitle id="nuevo-apunte">{text.listTitle}</CardTitle>
          <p className="text-sm text-fg-muted">{text.listHint}</p>
        </CardHeader>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-start"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <TextField
            className="sm:flex-1"
            label={text.newTitle}
            value={title}
            placeholder={text.newPlaceholder}
            maxLength={120}
            error={titleError}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(null);
            }}
          />
          <Button type="submit" disabled={busy} className="sm:mt-7">
            {busy ? text.creating : text.create}
          </Button>
        </form>
        {problem ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {problem}
          </p>
        ) : null}
      </Card>

      {outlines.length === 0 ? (
        <EmptyState title={text.listTitle} description={text.empty} />
      ) : (
        <Card aria-label={text.listTitle}>
          <TextField
            label={text.search}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          {shown.length === 0 ? (
            <p role="status" className="mt-3 text-sm text-fg-muted">
              {text.noMatches}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-line">
              {shown.map(({ outline, lines, cards }) => (
                <li key={outline.id}>
                  <Link
                    to={hrefOf(outline.id)}
                    aria-label={text.open(outline.title)}
                    className="flex min-h-touch items-center gap-3 py-2 hover:bg-muted"
                  >
                    <FileText aria-hidden className="size-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{outline.title}</span>
                      <span className="block text-sm text-fg-muted">
                        {text.summary(lines, cards)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
