// Botón base al estilo de shadcn/ui, con objetivo táctil de 44 px como mínimo. El principal es el
// único con color, #156082 liso con texto blanco; los demás son neutros (B2 del plan del cambio,
// comentario 10, D-121).
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/ui/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover active:bg-primary-active',
        secondary: 'border border-line-strong bg-surface text-fg hover:bg-muted',
        ghost: 'text-fg hover:bg-muted',
        // Acciones que borran o cierran. Es un color de estado permitido por 4.7. Al pasar el
        // puntero cambia de tono y no de opacidad, que dejaba el texto abajo del 4.5 a 1
        danger: 'bg-danger text-danger-fg hover:bg-danger-hover',
        // Igual aquí. La opacidad bajaba el texto a 4.4 a 1, así que se engruesa el subrayado
        link: 'text-primary-ink underline underline-offset-4 hover:decoration-2',
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
