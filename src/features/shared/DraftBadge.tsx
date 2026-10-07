// Marca de borrador pendiente de revisión médica (8.5). Los consejos por sesgo son textos base y
// ningún médico los ha revisado, así que donde aparezcan lo dicen con texto y no solo con color.
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';

export function DraftBadge({ className }: { className?: string }) {
  return (
    <Badge variant="warning" className={className}>
      {t.tutor.biasTips.draftLabel}
    </Badge>
  );
}
