// Los enlaces de un apunte. A cuáles apuntes enlaza, cuáles títulos todavía no existen (con un botón
// para crearlos) y qué apuntes lo mencionan a él.
import { Link } from 'react-router';
import { screenPath } from '@/app/screens';
import type { Backlink } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { Button } from '@/ui/components/button';

export interface LinkTarget {
  id: string;
  title: string;
}

const hrefOf = (id: string) => `${screenPath('outlines')}?apunte=${encodeURIComponent(id)}`;

export function OutlineLinks({
  targets,
  missing,
  backlinks,
  busy,
  onCreate,
}: {
  targets: readonly LinkTarget[];
  missing: readonly string[];
  backlinks: readonly Backlink[];
  busy: boolean;
  /** Crea el apunte que falta con ese título */
  onCreate: (title: string) => void;
}) {
  const text = t.outlines.links;
  // Un apunte que menciona a este en varias líneas sale una sola vez
  const mentions = [...new Map(backlinks.map((entry) => [entry.outlineId, entry])).values()];
  return (
    <section aria-labelledby="enlaces-del-apunte" className="flex flex-col gap-3">
      <h2 id="enlaces-del-apunte" className="text-base font-semibold">
        {text.title}
      </h2>
      {targets.length > 0 || missing.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-semibold text-fg-muted">{text.goesTo}</p>
          <ul className="flex flex-col gap-1">
            {targets.map((target) => (
              <li key={target.id}>
                <Link
                  to={hrefOf(target.id)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {target.title}
                </Link>
              </li>
            ))}
            {missing.map((title) => (
              <li key={title} className="flex flex-wrap items-center gap-2">
                <span>{title}</span>
                <span className="text-fg-muted">{text.missing}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    onCreate(title);
                  }}
                >
                  {t.outlines.create}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-col gap-1 text-sm">
        <p className="font-semibold text-fg-muted">{text.backlinks}</p>
        {mentions.length === 0 ? (
          <p className="text-fg-muted">{text.none}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {mentions.map((entry) => (
              <li key={entry.outlineId}>
                <Link
                  to={hrefOf(entry.outlineId)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
