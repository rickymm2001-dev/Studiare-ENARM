import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge necesita conocer los tokens propios para no confundir text-fg (color)
// con text-question (tamaño) al combinar clases.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        'canvas',
        'surface',
        'muted',
        'line',
        'line-strong',
        'fg',
        'fg-muted',
        'primary',
        'primary-hover',
        'primary-fg',
        'primary-soft',
        'focus',
        'success',
        'success-soft',
        'warning',
        'warning-soft',
        'danger',
        'danger-soft',
        'danger-fg',
        'demo',
        'demo-fg',
        'demo-line',
        'sim',
        'sim-fg',
        'sim-line',
      ],
      text: ['question'],
      spacing: ['touch', 'nav', 'rail'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
