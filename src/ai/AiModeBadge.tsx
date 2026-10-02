// Muestra en qué modo está la IA (8.1). Simulada siempre se dice con texto.
import { Bot } from 'lucide-react';
import { t } from '@/i18n/es-MX';
import { Badge } from '@/ui/components/badge';
import type { AiStatus } from './client';

const VARIANT = {
  checking: 'neutral',
  real: 'info',
  mock: 'neutral',
  'no-proxy': 'neutral',
  offline: 'warning',
} as const satisfies Record<AiStatus['kind'], 'neutral' | 'info' | 'warning'>;

export function AiModeBadge({ status }: { status: AiStatus }) {
  return (
    <Badge variant={VARIANT[status.kind]} title={t.ai.detail[status.kind]}>
      <Bot aria-hidden className="size-3.5" />
      {t.ai.badge[status.kind]}
    </Badge>
  );
}
