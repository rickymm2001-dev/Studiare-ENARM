// Tabla de niveles y títulos (D-063). Se abre al tocar el nivel del encabezado. Marca dónde va el
// alumno, cuál es el siguiente título y cuánto XP le falta.
import { Award, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { levelFor, nextTitle, titleLadder } from '@/engines/xp';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { ProgressBar } from '@/ui/components/progress-bar';

const fmt = (n: number) => n.toLocaleString('es-MX');

export function LevelLadderDialog({
  totalXp,
  children,
}: {
  totalXp: number;
  /** Lo que abre el diálogo, normalmente el nivel del encabezado */
  children: ReactNode;
}) {
  const level = levelFor(totalXp);
  const next = nextTitle(totalXp);
  const ladder = titleLadder();
  const text = t.levelLadder;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="animate-rise fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-raised">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-xl font-extrabold">
                <Award aria-hidden className="size-6 text-accent" />
                {text.title}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-fg-muted">
                {text.current(level.level, level.title, fmt(totalXp))}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="flex size-touch items-center justify-center rounded-full hover:bg-muted"
              aria-label={text.close}
            >
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-1">
            <ProgressBar
              tone="gold"
              value={level.xpIntoLevel}
              max={level.xpForNext}
              label={text.toNextLevel(fmt(level.xpForNext - level.xpIntoLevel), level.level + 1)}
            />
            <p className="text-sm text-fg-muted">
              {text.toNextLevel(fmt(level.xpForNext - level.xpIntoLevel), level.level + 1)}
            </p>
          </div>

          {next ? (
            <p className="rounded-lg bg-accent-soft p-3 text-sm font-semibold text-accent">
              {text.nextTitle(next.step.title, next.step.fromLevel, fmt(next.xpLeft))}
            </p>
          ) : (
            <p className="rounded-lg bg-accent-soft p-3 text-sm font-semibold text-accent">
              {text.maxTitle}
            </p>
          )}

          <table className="w-full text-sm">
            <caption className="sr-only">{text.title}</caption>
            <thead>
              <tr className="text-left text-fg-muted">
                <th scope="col" className="py-1.5 pr-2">
                  {text.levels}
                </th>
                <th scope="col" className="py-1.5 pr-2">
                  {text.titleColumn}
                </th>
                <th scope="col" className="py-1.5 text-right">
                  {text.xpColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((step) => {
                const isCurrent = step.title === level.title;
                const reached = totalXp >= step.xpFrom;
                return (
                  <tr
                    key={step.title}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={cn(
                      'border-t border-line',
                      isCurrent && 'bg-accent-soft font-bold',
                      !reached && 'text-fg-muted',
                    )}
                  >
                    <td className="py-2 pr-2">
                      {step.toLevel === null
                        ? text.fromLevel(step.fromLevel)
                        : text.range(step.fromLevel, step.toLevel)}
                    </td>
                    <td className="py-2 pr-2">
                      {step.title}
                      {isCurrent ? <span className="ml-1 text-accent">· {text.you}</span> : null}
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt(step.xpFrom)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-fg-muted">{text.howTo}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
