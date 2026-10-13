// Temas de un mazo (B4 del plan del cambio, comentario 8). Debajo de cada mazo, en Repasar y en Mazos,
// van sus ramas y todos sus temas en orden alfabético del español, sin repetidos y sin recortes. En
// Mazos el resumen dice las ramas y cuántos temas hay, y al abrirlo se ve la lista completa, rama por
// rama, como Reumatología con Artritis reumatoide y Lupus eritematoso sistémico debajo. En Repasar la
// lista va abierta dentro de Mazos y temas. Los nombres largos se parten en renglones y nunca se
// cortan. Se muestran tres niveles, rama, materia y tema (TOPIC_OUTLINE_DEPTH).
import { ChevronDown } from 'lucide-react';
import type { TopicNode, TopicOutline } from '@/engines/deckTopics';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';

/** La lista completa de temas de un mazo, con la rama arriba y sus temas debajo */
export function TopicOutlineList({
  label,
  outline,
  className,
}: {
  /** Nombre de la lista para el lector de pantalla, como Temas de Urgencias (Paco) */
  label: string;
  outline: TopicOutline;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <ul aria-label={label} className="flex flex-col gap-3">
        {outline.branches.map((branch) => (
          <li key={branch.name} className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold break-words text-fg">{branch.name}</p>
            {branch.children.length > 0 ? (
              <ul
                aria-label={branch.name}
                className="gap-x-6 border-l border-line pl-3 sm:columns-2 lg:columns-3"
              >
                {branch.children.map((subject) => (
                  <Subject key={subject.name} node={subject} />
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
      {outline.untagged > 0 ? (
        <p className="text-xs text-fg-muted">{t.deckTopics.untagged(outline.untagged)}</p>
      ) : null}
    </div>
  );
}

function Subject({ node }: { node: TopicNode }) {
  return (
    <li className="mb-2 break-inside-avoid">
      <p className="text-sm font-medium break-words text-fg">{node.name}</p>
      {node.children.length > 0 ? (
        <ul aria-label={node.name} className="mt-0.5 flex flex-col gap-0.5 pl-3">
          {node.children.map((topic) => (
            <li key={topic.name} className="text-sm break-words text-fg-muted">
              {topic.name}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Los temas de un mazo. En Mazos van plegados bajo su resumen, que ya dice sus ramas y cuántos temas
 * tiene, para que la lista de mazos no se haga larga. Sin pliegue, como dentro de Mazos y temas de
 * Repasar, que ya es un pliegue, la lista va abierta. No pinta nada si el mazo no tiene temas
 */
export function DeckTopics({
  deckName,
  outline,
  className,
  collapsible = true,
}: {
  deckName: string;
  outline: TopicOutline | undefined;
  className?: string;
  /** false muestra la lista abierta, sin un segundo pliegue */
  collapsible?: boolean;
}) {
  if (!outline || outline.branches.length === 0) return null;
  if (!collapsible) {
    return (
      <TopicOutlineList
        label={t.deckTopics.listLabel(deckName)}
        outline={outline}
        className={cn('min-w-0', className)}
      />
    );
  }
  return (
    <details className={cn('group min-w-0', className)}>
      <summary className="flex min-h-8 cursor-pointer list-none items-start gap-1 py-1 text-sm [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="font-semibold text-primary-ink">{t.deckTopics.title}</span>{' '}
          <span className="text-fg-muted">
            ·{' '}
            {t.deckTopics.summary(
              outline.branches.map((branch) => branch.name),
              outline.leaves,
            )}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <TopicOutlineList
        label={t.deckTopics.listLabel(deckName)}
        outline={outline}
        className="mt-2"
      />
    </details>
  );
}
