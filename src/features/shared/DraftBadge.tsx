// Marca de borrador pendiente de revisión médica (8.5). Los consejos por sesgo son textos base y
// ningún médico los ha revisado, así que donde aparezcan lo dicen con texto y no solo con color.
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';

export function DraftBadge({ className }: { className?: string }) {
  return (
    // Puede pasar a dos renglones. Con el texto en una sola línea la columna no se podía encoger y
    // el informe del tutor se salía de la pantalla en el teléfono
    <Badge
      variant="warning"
      className={cn('max-w-full rounded-xl text-left leading-tight whitespace-normal', className)}
    >
      {t.tutor.biasTips.draftLabel}
    </Badge>
  );
}
