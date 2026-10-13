// Etiquetas visibles obligatorias (4.6). Siempre con texto, nunca solo con color. La etiqueta de
// contenido de demostración por pantalla se quitó (comentario 9); queda el aviso global de 4.1 del
// plan del cambio y la de datos simulados, que responde a otra regla.
import { FlaskConical } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '../cn';
import { Badge } from './badge';

export function SimulatedDataLabel({ className }: { className?: string }) {
  return (
    <Badge variant="simulated" className={cn('text-xs', className)}>
      <FlaskConical aria-hidden className="size-3.5" />
      {t.labels.simulatedData}
    </Badge>
  );
}
