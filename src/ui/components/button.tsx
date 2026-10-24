// Botón base al estilo de shadcn/ui, con objetivo táctil de 44 px como mínimo. Píldoras como en la
// portada (D-150). El principal es marino liso con texto blanco y sube un pixel al pasar el puntero,
// el secundario lleva el borde cielo con texto cielo tinta, y los demás son neutros.
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-bold whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-fg hover:-translate-y-px hover:bg-primary-hover active:translate-y-0 active:bg-primary-active',
        secondary:
          'border-[1.5px] border-indicator bg-surface text-primary-ink hover:-translate-y-px hover:bg-primary-soft active:translate-y-0',
        ghost: 'font-semibold text-fg hover:bg-muted',
        // Acciones que borran o cierran. Es un color de estado permitido por 4.7. Al pasar el
        // puntero cambia de tono y no de opacidad, que dejaba el texto abajo del 4.5 a 1
        danger: 'bg-danger text-danger-fg hover:bg-danger-hover',
        // La opacidad bajaba el texto a 4.4 a 1, así que se engruesa el subrayado
        link: 'font-semibold text-primary-ink underline underline-offset-4 hover:decoration-2',
      },
      size: {
        md: 'min-h-touch px-5 text-base',
        lg: 'min-h-13 px-7 text-lg',
        sm: 'min-h-9 px-4 text-sm',
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
