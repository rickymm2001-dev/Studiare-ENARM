// Etiquetas visibles obligatorias (4.6). Siempre con texto, nunca solo con color.
import { FlaskConical, TriangleAlert } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '../cn';
import { Badge } from './badge';

/** Las etiquetas obligatorias van en mayúsculas con letra mono, como las del resto de la app (D-079) */
const LABEL_STYLE = 'font-mono text-[0.65rem] tracking-wider uppercase';

export function DemoContentLabel({ className }: { className?: string }) {
  return (
    <Badge variant="demo" className={cn(LABEL_STYLE, className)}>
      <TriangleAlert aria-hidden className="size-3.5" />
      {t.labels.demoContent}
    </Badge>
  );
}

export function SimulatedDataLabel({ className }: { className?: string }) {
  return (
    <Badge variant="simulated" className={cn(LABEL_STYLE, className)}>
      <FlaskConical aria-hidden className="size-3.5" />
      {t.labels.simulatedData}
    </Badge>
  );
}
