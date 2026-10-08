// Marca de lo que redactó la IA. Dice quién lo escribió y que es un borrador que ningún médico ha
// validado (CLAUDE.md), con texto y no solo con color.
import { Bot } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { cn } from '@/ui/cn';
import { Badge } from '@/ui/components/badge';

export function AiWritten({
  mode,
  className,
}: {
  mode: 'real' | 'mock' | 'template';
  className?: string;
}) {
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Badge variant={mode === 'real' ? 'info' : 'simulated'}>
        <Bot aria-hidden className="size-3.5" />
        {t.tutor.ai.written[mode]}
      </Badge>
      <Badge variant="warning" className="whitespace-normal leading-tight">
        {t.tutor.ai.draft}
      </Badge>
    </span>
  );
}
