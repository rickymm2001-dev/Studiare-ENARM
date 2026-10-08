/**
 * Perfil guía de un toque (Fase C2, D-085 fila 6).
 *
 * Qué hace. Propone los ajustes de repaso que recomienda la guía de Anki, adaptados a Studiare, y
 * lista qué cambiaría en los ajustes actuales del alumno para que la interfaz pueda mostrarlo
 * antes de aplicarlo. No guarda nada y no toca las nuevas por día, que se calculan aparte según la
 * carga proyectada y los minutos del alumno (dailyLoad).
 * Entradas. El día de hoy y la fecha del ENARM, ambos AAAA-MM-DD, y los ajustes actuales.
 * Salidas. El perfil propuesto y la lista de cambios con texto listo para mostrar en español.
 * Método
 *   - Retención deseada 0.9 y separación 1, 1, 1 en Difícil, Bien y Fácil, que es lo recomendado
 *   - Intervalo máximo igual a los días que faltan para el ENARM. Ningún repaso se programa más
 *     allá del examen de todos modos (el modo examen lo recorta), así que ese tope no estorba
 *   - Sin fecha del ENARM o con la fecha ya pasada, 365 días
 *   - Si la fecha es inválida, daysBetween lanza RangeError, igual que el resto de studyDay
 * Umbrales. El tope de la guía de Anki son 365 días fijos. Aquí es hasta el examen, con mínimo de 1
 * día y máximo de 3650, que es el máximo que acepta el esquema de ajustes (J, D-085).
 */
import { daysBetween } from './studyDay';

export interface GuideProfile {
  desiredRetention: number;
  maxIntervalDays: number;
  spacing: { hard: number; good: number; easy: number };
}

export interface ProfileChange {
  field: 'desiredRetention' | 'maxIntervalDays' | 'spacing';
  /** Valor actual, listo para mostrar */
  from: string;
  /** Valor propuesto, listo para mostrar */
  to: string;
}

/** Retención que recomienda la guía */
export const GUIDE_RETENTION = 0.9;
/** Tope cuando no hay fecha del ENARM o ya pasó. Es el de la guía de Anki */
export const GUIDE_FALLBACK_MAX_INTERVAL_DAYS = 365;
/** Máximo que acepta el esquema de ajustes */
export const GUIDE_MAX_INTERVAL_DAYS = 3650;

const TOLERANCE = 1e-9;

export function guideProfile(input: { today: string; examDate: string | null }): GuideProfile {
  return {
    desiredRetention: GUIDE_RETENTION,
    maxIntervalDays: guideMaxIntervalDays(input.today, input.examDate),
    spacing: { hard: 1, good: 1, easy: 1 },
  };
}

function guideMaxIntervalDays(today: string, examDate: string | null): number {
  if (examDate === null) return GUIDE_FALLBACK_MAX_INTERVAL_DAYS;
  const daysToExam = daysBetween(today, examDate);
  // El día del examen mismo (0 días) todavía cuenta y queda en el mínimo de 1
  if (daysToExam < 0) return GUIDE_FALLBACK_MAX_INTERVAL_DAYS;
  return Math.min(GUIDE_MAX_INTERVAL_DAYS, Math.max(1, daysToExam));
}

/** Un número sin ruido de punto flotante ni ceros de sobra, 1 es "1" y 0.85 es "0.85" */
function plain(value: number): string {
  return String(Number(value.toFixed(2)));
}

function percent(value: number): string {
  return `${String(Number((value * 100).toFixed(1)))}%`;
}

function days(value: number | null): string {
  if (value === null) return 'Sin tope';
  return `${String(value)} ${value === 1 ? 'día' : 'días'}`;
}

function spacingText(spacing: GuideProfile['spacing']): string {
  return `Difícil ${plain(spacing.hard)}, Bien ${plain(spacing.good)}, Fácil ${plain(spacing.easy)}`;
}

function same(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCE;
}

/** Solo lo que cambia entre los ajustes actuales y el perfil propuesto. Vacía si ya coinciden */
export function guideProfileChanges(
  current: {
    desiredRetention: number;
    maxIntervalDays: number | null;
    spacing: { hard: number; good: number; easy: number };
  },
  proposed: GuideProfile,
): ProfileChange[] {
  const changes: ProfileChange[] = [];
  if (!same(current.desiredRetention, proposed.desiredRetention)) {
    changes.push({
      field: 'desiredRetention',
      from: percent(current.desiredRetention),
      to: percent(proposed.desiredRetention),
    });
  }
  if (current.maxIntervalDays !== proposed.maxIntervalDays) {
    changes.push({
      field: 'maxIntervalDays',
      from: days(current.maxIntervalDays),
      to: days(proposed.maxIntervalDays),
    });
  }
  if (
    !same(current.spacing.hard, proposed.spacing.hard) ||
    !same(current.spacing.good, proposed.spacing.good) ||
    !same(current.spacing.easy, proposed.spacing.easy)
  ) {
    changes.push({
      field: 'spacing',
      from: spacingText(current.spacing),
      to: spacingText(proposed.spacing),
    });
  }
  return changes;
}
