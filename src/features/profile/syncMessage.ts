// Texto del estado de la sincronización (D-095). Aparte del componente para poder probarlo solo.
import type { SyncOutcome } from '@/app/syncScheduler';
import { t } from '@/i18n/es-MX';

export function when(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export function syncMessage(outcome: SyncOutcome, lastSyncAt: string | null): string {
  const text = t.cloud.sync;
  switch (outcome.status) {
    case 'never':
      return text.never;
    case 'ok':
      return text.ok(when(outcome.at));
    case 'clock_skew':
      return text.clockSkew(Math.max(1, Math.round(Math.abs(outcome.skewMs) / 60_000)));
    case 'failed': {
      const reason = text[outcome.failure];
      return lastSyncAt ? `${reason} ${text.lastWas(when(lastSyncAt))}` : reason;
    }
  }
}
