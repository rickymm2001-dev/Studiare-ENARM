// Etiqueta chica en píldora, como las de la portada (D-150). Neutra por omisión y con color solo en
// los estados que permite 4.7 del plan del cambio (correcto, aviso y error), siempre con texto. Una
// etiqueta no es un botón, así que nunca lleva el color de acción (comentario 10). La de una rama va
// en el color de su rama con BranchBadge (branch-tag.tsx, D-128).
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

const badgeVariants = cva(
  'inline-flex min-h-6 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-demo-line bg-muted text-demo-fg',
        // Lo informativo, como el plan actual, una tarjeta nueva o la IA real, también va neutro. El
        // nombre se queda para que quien lo usa diga qué tipo de etiqueta es
        info: 'border-demo-line bg-muted text-demo-fg',
        success: 'border-transparent bg-success-soft text-success',
        warning: 'border-transparent bg-warning-soft text-warning',
        danger: 'border-transparent bg-danger-soft text-danger',
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
