// Configuración del programador de repasos de un alumno. La comparten Repasar, el planificador y
// la carga futura, para que todos proyecten con las mismas reglas (7.1, D-064, D-067).
import { examDateFor } from '@/config/exam';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { SchedulerConfig } from '@/engines/fsrs';
import type { ReadySession } from '../shared/RequireSession';

export function schedulerConfig(session: Pick<ReadySession, 'user' | 'settings'>): SchedulerConfig {
  const { user, settings } = session;
  return {
    desiredRetention: settings.desiredRetention,
    maxIntervalDays: settings.maxIntervalDays,
    spacing: settings.spacing,
    examDate: examDateFor(user),
    timeZone: user.timeZone,
    thresholds: {
      ...DEFAULT_THRESHOLDS.fsrs,
      newCardsPerDay: settings.newCardsPerDay,
      reviewsPerDay: settings.reviewsPerDay,
    },
  };
}
