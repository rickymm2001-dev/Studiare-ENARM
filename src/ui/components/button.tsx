// Botón base al estilo de shadcn/ui, con objetivo táctil de 44 px como mínimo.
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover',
        secondary: 'border border-line-strong bg-surface text-fg hover:bg-muted',
        ghost: 'text-fg hover:bg-muted',
        danger: 'bg-danger text-danger-fg hover:opacity-90',
        link: 'text-primary underline underline-offset-4 hover:text-primary-hover',
      },
      size: {
        md: 'min-h-touch px-4 text-base',
        lg: 'min-h-12 px-6 text-lg',
        sm: 'min-h-9 px-3 text-sm',
        icon: 'size-touch',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Renderiza el hijo (por ejemplo un Link) con los estilos del botón */
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return <Component className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
