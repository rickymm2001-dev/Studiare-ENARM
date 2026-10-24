// Las ramas clínicas como chips píldora con el punto de color de su rama (D-128, D-150). Una rama
// prendida lleva el borde y el fondo suave de su color. Marcar una rama marca o desmarca todas sus
// subespecialidades; con solo algunas marcadas el chip queda prendido y lo dice. El color nunca va solo,
// siempre junto al nombre de la rama.
import { t } from '@/i18n/es-MX';
import { branchTone, TONE_CLASSES, type BranchTone } from '@/ui/branches';
import { cn } from '@/ui/cn';
import { CLINICAL_BRANCHES } from './clinicalBranches';

/** Borde del color lleno de cada rama. Completo para que Tailwind lo encuentre */
const BORDER: Record<BranchTone, string> = {
  mi: 'border-mi',
  ped: 'border-ped',
  gyo: 'border-gyo',
  cir: 'border-cir',
  fam: 'border-fam',
  urg: 'border-urg',
  neutral: 'border-line-strong',
};

export function BranchChips({
  selected,
  onChange,
}: {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {CLINICAL_BRANCHES.map((branch) => {
        const keys = branch.topics.map((topic) => topic.key);
        const on = keys.filter((key) => selected.has(key)).length;
        const active = on > 0;
        const tone = branchTone(branch.key);
        return (
          <button
            key={branch.key}
            type="button"
            aria-pressed={on === keys.length ? true : active ? 'mixed' : false}
            aria-label={t.simulator.branchChip(branch.name, on, keys.length)}
            onClick={() => {
              const next = new Set(selected);
              for (const key of keys) {
                if (active) next.delete(key);
                else next.add(key);
              }
              onChange(next);
            }}
            className={cn(
              'inline-flex min-h-10 items-center gap-2 rounded-full border-[1.5px] px-4 text-sm font-semibold transition-colors',
              active
                ? cn('font-bold', BORDER[tone], TONE_CLASSES[tone].chip)
                : 'border-line bg-surface text-fg hover:border-indicator',
            )}
          >
            <span aria-hidden className={cn('size-2.5 rounded-full', TONE_CLASSES[tone].bar)} />
            {branch.name}
            {active && on < keys.length ? (
              <span className="text-xs font-normal tabular-nums">
                {t.topicPicker.of(on, keys.length)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
