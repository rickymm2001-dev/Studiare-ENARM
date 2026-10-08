// Árbol de etiquetas en ruta con su conteo. Tocar una ruta filtra por ella y por todo lo que cuelga
// de ella. Los niveles de abajo solo se dibujan al abrirlos, así un árbol de cientos de etiquetas no
// pesa al abrir la pantalla.
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { TagNode } from '@/engines/tagPath';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

export function TagTree({
  nodes,
  selected,
  onSelect,
}: {
  nodes: readonly TagNode[];
  selected: string | null;
  onSelect: (path: string | null) => void;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (path: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const render = (list: readonly TagNode[]) => (
    <ul className="flex flex-col">
      {list.map((node) => {
        const isOpen = open.has(node.path);
        const isSelected = selected?.toLowerCase() === node.path.toLowerCase();
        return (
          <li key={node.path}>
            <div className="flex items-center gap-1">
              {node.children.length > 0 ? (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={
                    isOpen ? t.explore.collapseTag(node.name) : t.explore.expandTag(node.name)
                  }
                  onClick={() => {
                    toggle(node.path);
                  }}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-muted"
                >
                  <ChevronRight
                    aria-hidden
                    className={cn('size-4 transition-transform', isOpen && 'rotate-90')}
                  />
                </button>
              ) : (
                <span aria-hidden className="size-8 shrink-0" />
              )}
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  onSelect(isSelected ? null : node.path);
                }}
                className={cn(
                  'flex min-h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 text-left text-sm hover:bg-muted',
                  isSelected && 'bg-primary-soft font-semibold text-primary',
                )}
              >
                <span className="truncate">{node.name}</span>
                <span className="shrink-0 text-xs text-fg-muted">
                  {node.count.toLocaleString('es-MX')}
                </span>
              </button>
            </div>
            {isOpen && node.children.length > 0 ? (
              <div className="ml-4 border-l border-line pl-1">{render(node.children)}</div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  return render(nodes);
}
