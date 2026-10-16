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

/**
 * Cuánto tiempo en una pregunta sin contestar es más del doble del ritmo, que es cuando el examen avisa
 * que se atoró. Una pregunta de la parte en inglés trae el texto, así que su ritmo es el de todo el texto
 * (B13): el doble de los segundos sugeridos por reactivo de inglés por las preguntas que trae el texto
 */
export function stuckAfterMs(input: {
  english: boolean;
  /** Preguntas del texto en este examen. Solo cuenta en inglés */
  textSize: number;
  clinicalSeconds: number;
  englishSeconds: number;
}): number {
  return input.english
    ? 2 * input.englishSeconds * Math.max(1, input.textSize) * 1000
    : 2 * input.clinicalSeconds * 1000;
}
