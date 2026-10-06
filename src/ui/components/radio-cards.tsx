// Grupo de opciones grandes sobre RadioGroup de Radix. Accesible con teclado y lector de pantalla.
import { RadioGroup } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '@/ui/cn';

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  icon?: ReactNode;
}

interface RadioCardsProps<T extends string> {
  legend: string;
  description?: string;
  value: T;
  options: readonly RadioCardOption<T>[];
  onValueChange: (value: T) => void;
  className?: string;
  /** row pone las opciones lado a lado, compactas, para pocas opciones sin descripción */
  layout?: 'stack' | 'row';
}

export function RadioCards<T extends string>({
  legend,
  description,
  value,
  options,
  onValueChange,
  className,
  layout = 'stack',
}: RadioCardsProps<T>) {
  const legendId = useId();
  const descriptionId = useId();
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div>
        <p id={legendId} className="font-semibold text-fg">
          {legend}
        </p>
        {description ? (
          <p id={descriptionId} className="text-sm text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      <RadioGroup.Root
        aria-labelledby={legendId}
        aria-describedby={description ? descriptionId : undefined}
        value={value}
        onValueChange={(next) => {
          const match = options.find((option) => option.value === next);
          if (match) onValueChange(match.value);
        }}
        className={cn('grid gap-2', layout === 'row' && 'grid-cols-3')}
      >
        {options.map((option) => (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            className={cn(
              'flex min-h-touch w-full items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-left text-fg',
              layout === 'row' && 'flex-col justify-center gap-1 px-2 text-center',
              'hover:bg-muted data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-line-strong',
                layout === 'row' && 'sr-only',
              )}
            >
              <RadioGroup.Indicator className="size-2.5 rounded-full bg-primary" />
            </span>
            {option.icon ? (
              <span aria-hidden className="text-fg-muted [&_svg]:size-5">
                {option.icon}
              </span>
            ) : null}
            <span className="flex flex-col">
              <span className={cn('font-medium', layout === 'row' && 'text-sm leading-tight')}>
                {option.label}
              </span>
              {option.description ? (
                <span className="text-sm text-fg-muted">{option.description}</span>
              ) : null}
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
    </div>
  );
}
