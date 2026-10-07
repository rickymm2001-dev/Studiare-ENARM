// Las tarjetas encontradas, una fila cada una. Cada fila se puede marcar, y al abrirla muestra las dos
// caras como en el repaso. El texto es plano y se corta a pocas líneas, así la lista se lee de un vistazo.
import { Eye, EyeOff } from 'lucide-react';
import { deckPath } from '@/engines/deckTree';
import type { ExploreRow } from '@/engines/explore';
import type { Deck } from '@/data/schemas/decks';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import { Button } from '@/ui/components/button';
import { DemoContentLabel } from '@/ui/components/labels';
import { CardHtml } from '../shared/CardHtml';
import type { CardFaces } from '../review/study';

const TAGS_SHOWN = 3;

function dueLabel(due: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(new Date(due));
}

function Statuses({ row, timeZone, now }: { row: ExploreRow; timeZone: string; now: Date }) {
  const overdue = row.due !== null && new Date(row.due).getTime() <= now.getTime();
  return (
    <>
      {row.suspended ? <Badge variant="warning">{t.explore.statusOne.suspended}</Badge> : null}
      {row.leech ? <Badge variant="danger">{t.explore.statusOne.leech}</Badge> : null}
      {row.fsrs === 'new' ? (
        <Badge variant="info">{t.explore.newCard}</Badge>
      ) : row.due !== null ? (
        <Badge variant={overdue && !row.suspended ? 'success' : 'neutral'}>
          {t.explore.dueOn(dueLabel(row.due, timeZone))}
        </Badge>
      ) : null}
      {row.lapses > 0 ? <Badge variant="neutral">{t.explore.lapses(row.lapses)}</Badge> : null}
      {row.origin === 'preloaded' ? <Badge variant="neutral">{t.explore.preloaded}</Badge> : null}
    </>
  );
}

export function ResultList({
  rows,
  decks,
  selected,
  onToggle,
  openId,
  onOpen,
  facesOf,
  timeZone,
  now,
}: {
  rows: readonly ExploreRow[];
  decks: readonly Deck[];
  selected: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
  openId: string | null;
  onOpen: (cardId: string | null) => void;
  facesOf: (cardId: string) => CardFaces | null;
  timeZone: string;
  now: Date;
}) {
  return (
    <ul aria-label={t.explore.list} className="flex flex-col divide-y divide-line">
      {rows.map((row) => {
        const isOpen = openId === row.cardId;
        const faces = isOpen ? facesOf(row.cardId) : null;
        const front = row.front === '' ? t.explore.emptyFront : row.front;
        return (
          <li key={row.cardId} className="flex flex-col gap-2 py-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-[var(--color-primary)]"
                checked={selected.has(row.cardId)}
                aria-label={t.explore.selectRow(front.slice(0, 80))}
                onChange={() => {
                  onToggle(row.cardId);
                }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="line-clamp-2 font-medium break-words">{front}</p>
                <p className="line-clamp-1 text-sm break-words text-fg-muted">{row.back}</p>
                <p className="truncate text-xs text-fg-muted">
                  {deckPath(decks, row.deckId).join(' › ')}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Statuses row={row} timeZone={timeZone} now={now} />
                  {row.tags.slice(0, TAGS_SHOWN).map((tag) => (
                    <span
                      key={tag}
                      className="max-w-48 truncate rounded-full bg-muted px-2 py-0.5 text-xs text-fg-muted"
                    >
                      {tag}
                    </span>
                  ))}
                  {row.tags.length > TAGS_SHOWN ? (
                    <span className="text-xs text-fg-muted">+{row.tags.length - TAGS_SHOWN}</span>
                  ) : null}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={isOpen}
                onClick={() => {
                  onOpen(isOpen ? null : row.cardId);
                }}
              >
                {isOpen ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {isOpen ? t.explore.hideCard : t.explore.seeCard}
              </Button>
            </div>
            {faces ? (
              <div className="ml-8 flex flex-col gap-2 rounded-lg border border-line bg-muted/40 p-3">
                {row.isDemo ? <DemoContentLabel className="self-start" /> : null}
                <div>
                  <p className="text-xs font-semibold text-fg-muted uppercase">{t.explore.front}</p>
                  <CardHtml html={faces.front} className="text-base" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-fg-muted uppercase">{t.explore.back}</p>
                  <CardHtml html={faces.back} className="text-base" />
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
