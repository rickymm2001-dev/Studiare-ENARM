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

/** La explicación con IA de esta hipótesis viene en camino y mientras tanto se ve la versión sin IA */
export function AiPending({ className }: { className?: string }) {
  return (
    <p role="status" className={cn('text-sm text-fg-muted', className)}>
      {t.tutor.ai.pending}
    </p>
  );
}

/** El trabajo de IA de esta hipótesis falló y se queda la versión sin IA */
export function AiJobFailed({ className }: { className?: string }) {
  return (
    <p role="status" className={cn('text-sm text-fg-muted', className)}>
      {t.tutor.ai.jobFailed}
    </p>
  );
}
