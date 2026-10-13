// Etiqueta chica. Neutra por omisión y con color solo en los estados que permite 4.7 del plan del
// cambio (correcto, aviso y error), siempre con texto.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-line bg-muted text-fg-muted',
        info: 'border-transparent bg-primary-soft text-primary-ink',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
        // Lo que era dorado o naranja va neutro
        accent: 'border-line bg-muted text-fg-muted',
        streak: 'border-line bg-muted text-fg-muted',
        demo: 'border-demo-line bg-demo text-demo-fg',
        simulated: 'border-sim-line bg-sim text-sim-fg',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
