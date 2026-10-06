// Selector de ramas troncales y subespecialidades (D-066, D-078). Cada troncal es una fila con su
// casilla y su total. Sus subespecialidades se ven solo al abrir la fila, para que las 72 no llenen
// la pantalla. Marcar una troncal marca o desmarca todas sus subespecialidades.
import { CheckCheck, ChevronDown, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { topicTaxonomy } from '@/demo/content';
import { t } from '@/i18n/es-MX';
import { toneClasses } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { Button } from '@/ui/components/button';
import { ALL_TOPICS } from './topics';

function TriCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
  hint,
  stacked = false,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  /** Pone el conteo debajo del nombre, para que nombres largos no se partan en el teléfono */
  stacked?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate === true;
  }, [indeterminate]);
  return (
    <label
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-1 text-sm hover:bg-muted',
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        className="size-4 shrink-0 accent-[var(--color-primary)]"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      {stacked ? (
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span>{label}</span>
          {hint ? (
            <span className="text-xs font-normal text-fg-muted tabular-nums">{hint}</span>
          ) : null}
        </span>
      ) : (
        <>
          <span className="min-w-0 flex-1">{label}</span>
          {hint ? (
            <span className="shrink-0 text-xs text-fg-muted tabular-nums">{hint}</span>
          ) : null}
        </>
      )}
    </label>
  );
}

export function BranchTopicPicker({
  selected,
  onChange,
  counts,
  countLabel = t.topicPicker.questions,
  showCount = true,
}: {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Preguntas disponibles por subespecialidad, para mostrarlas junto a cada una */
  counts?: ReadonlyMap<string, number>;
  /** Texto del total de cada troncal. Preguntas por defecto */
  countLabel?: (n: number) => string;
  /** Muestra cuántas subespecialidades van marcadas. Se apaga si ya lo dice el resumen de afuera */
  showCount?: boolean;
}) {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const setMany = (keys: readonly string[], on: boolean) => {
    const next = new Set(selected);
    for (const key of keys) {
      if (on) next.add(key);
      else next.delete(key);
    }
    onChange(next);
  };
  const countOf = (keys: readonly string[]) =>
    counts ? keys.reduce((sum, key) => sum + (counts.get(key) ?? 0), 0) : undefined;
  const toggleOpen = (key: string) => {
    const next = new Set(open);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{t.topicPicker.trunks}</legend>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {showCount ? (
          <span className="text-sm text-fg-muted" aria-live="polite">
            {t.topicPicker.selected(selected.size, ALL_TOPICS.length)}
          </span>
        ) : null}
        <div className="ml-auto flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(new Set(ALL_TOPICS));
            }}
          >
            <CheckCheck aria-hidden />
            {t.topicPicker.all}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(new Set());
            }}
          >
            <X aria-hidden />
            {t.topicPicker.none}
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {topicTaxonomy.branches.map((branch) => {
          const keys = branch.topics.map((topic) => topic.key);
          const on = keys.filter((key) => selected.has(key)).length;
          const total = countOf(keys);
          const isOpen = open.has(branch.key);
          const panelId = `${baseId}-${branch.key}`;
          return (
            <li key={branch.key}>
              <div className={cn('flex items-center gap-1 pr-1', total === 0 && 'opacity-60')}>
                <span
                  aria-hidden
                  className={cn('ml-2 h-6 w-1 shrink-0 rounded-full', toneClasses(branch.key).bar)}
                />
                <TriCheckbox
                  stacked
                  className="min-h-touch flex-1 py-1 font-semibold hover:bg-transparent"
                  label={branch.name}
                  hint={
                    total === undefined
                      ? undefined
                      : total === 0
                        ? countLabel === t.topicPicker.questions
                          ? t.topicPicker.noQuestions
                          : countLabel(0)
                        : countLabel(total)
                  }
                  checked={on === keys.length}
                  indeterminate={on > 0 && on < keys.length}
                  onChange={(checked) => {
                    setMany(keys, checked);
                  }}
                />
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={t.topicPicker.toggle(branch.name, on, keys.length)}
                  onClick={() => {
                    toggleOpen(branch.key);
                  }}
                  className="flex min-h-touch shrink-0 items-center gap-1 rounded-md px-2 text-xs text-fg-muted tabular-nums hover:bg-muted"
                >
                  {t.topicPicker.of(on, keys.length)}
                  <ChevronDown
                    aria-hidden
                    className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
                  />
                </button>
              </div>
              <div
                id={panelId}
                hidden={!isOpen}
                className="grid gap-x-4 border-t border-line bg-muted/40 px-2 py-1 pl-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {branch.topics.map((topic) => {
                  const count = counts?.get(topic.key);
                  return (
                    <TriCheckbox
                      key={topic.key}
                      label={topic.name}
                      hint={count === undefined ? undefined : String(count)}
                      checked={selected.has(topic.key)}
                      onChange={(checked) => {
                        setMany([topic.key], checked);
                      }}
                    />
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
