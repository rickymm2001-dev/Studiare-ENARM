// Texto de los avisos de tiempo del examen. El motor timeAlerts decide cuál toca y con qué cifras, y
// aquí se convierte en una frase.
import type { TimeAlert } from '@/engines/timeAlerts';
import { t } from '@/i18n/es-MX';

export function alertMessage(alert: TimeAlert, progress: { answered: number; total: number }) {
  switch (alert.kind) {
    case 'halfway':
      return t.exam.alert.halfway(progress.answered, progress.total);
    case 'quarter_left':
      return t.exam.alert.quarter(alert.remainingMs);
    case 'minutes_left':
      return t.exam.alert.minutes(alert.minutesLeft ?? 1);
    case 'behind_pace':
      return t.exam.alert.behind(
        alert.behindBy ?? 0,
        alert.suggestedSecondsPerQuestion ?? 0,
        alert.unanswered ?? 0,
      );
    case 'time_up':
      return t.exam.alert.timeUp;
  }
}

/** Cuánto se queda visible un aviso. Los críticos duran más, porque son los que no hay que perder */
export function alertVisibleMs(alert: Pick<TimeAlert, 'severity'>): number {
  return alert.severity === 'critical' ? 15_000 : 10_000;
}
