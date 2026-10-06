// Frase de la pregunta con las negaciones resaltadas (7.5). El texto no cambia, solo se marca.
import type { HighlightRange } from '@/engines/structure';

export function HighlightedPrompt({ text, ranges }: { text: string; ranges: HighlightRange[] }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    if (range.start > cursor) parts.push(text.slice(cursor, range.start));
    parts.push(
      <mark key={index} className="rounded bg-warning-soft px-0.5 font-semibold text-fg">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
