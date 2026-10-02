// Selector de ramas troncales y subespecialidades (D-066). Arriba las 6 troncales, abajo todas las
// subespecialidades agrupadas por troncal, en tantas columnas como quepan. Marcar una troncal marca
// o desmarca todas sus subespecialidades.
import { CheckCheck, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
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
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
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
        className="size-4 accent-[var(--color-primary)]"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
      />
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-xs text-fg-muted tabular-nums">{hint}</span> : null}
    </label>
  );
}

export function BranchTopicPicker({
  selected,
  onChange,
  counts,
  countLabel = t.topicPicker.questions,
}: {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** Preguntas disponibles por subespecialidad, para mostrarlas junto a cada una */
  counts?: ReadonlyMap<string, number>;
  /** Texto del total de cada troncal. Preguntas por defecto */
  countLabel?: (n: number) => string;
}) {
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

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-2 font-semibold">{t.topicPicker.trunks}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {topicTaxonomy.branches.map((branch) => {
            const keys = branch.topics.map((topic) => topic.key);
            const on = keys.filter((key) => selected.has(key)).length;
            const total = countOf(keys);
            return (
              <div
                key={branch.key}
                className={cn('rounded-lg px-2 py-1', toneClasses(branch.key).chip)}
              >
                <TriCheckbox
                  className="font-semibold hover:bg-transparent"
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
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
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
            variant="secondary"
            size="sm"
            onClick={() => {
              onChange(new Set());
            }}
          >
            <X aria-hidden />
            {t.topicPicker.none}
          </Button>
          <span className="self-center text-sm text-fg-muted">
            {t.topicPicker.selected(selected.size, ALL_TOPICS.length)}
          </span>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 font-semibold">{t.topicPicker.subspecialties}</legend>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {topicTaxonomy.branches.map((branch) => (
            <div key={branch.key} className="flex flex-col">
              <p
                className={cn(
                  'mb-1 text-xs font-bold tracking-wide uppercase',
                  toneClasses(branch.key).chip.split(' ')[1],
                )}
              >
                {branch.name}
              </p>
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
          ))}
        </div>
      </fieldset>
    </div>
  );
}
