// Etiquetas visibles obligatorias (4.6). Siempre con texto, nunca solo con color.
import { FlaskConical, TriangleAlert } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { Badge } from './badge';

export function DemoContentLabel({ className }: { className?: string }) {
  return (
    <Badge variant="demo" className={className}>
      <TriangleAlert aria-hidden className="size-3.5" />
      {t.labels.demoContent}
    </Badge>
  );
}

export function SimulatedDataLabel({ className }: { className?: string }) {
  return (
    <Badge variant="simulated" className={className}>
      <FlaskConical aria-hidden className="size-3.5" />
      {t.labels.simulatedData}
    </Badge>
  );
}
