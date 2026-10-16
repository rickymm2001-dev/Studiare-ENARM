// La pantalla Calibración sin pintar nada (B14, 7.2 del plan de B14). Si la calibración está al día, qué
// dice cada corrida en una línea y sus conteos con nombre. Funciones puras, con el reloj como parámetro,
// así se prueban sin pantalla.
import type { AdminCalibration, CalibrationRun } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import { CALIBRATION_TIME_ZONE } from '../model/dayWords';

/** Horas sin una corrida buena a partir de las cuales la pantalla avisa y dice cómo volver a prenderla (10.25) */
export const STALE_AFTER_HOURS = 48;

const text = calibrationAdminTexts.runs;

export type CalibrationHealth =
  /** Todavía no hay ninguna corrida. Puede faltar la llave o el primer lanzamiento */
  | { kind: 'never' }
  /** Hay corridas, pero ninguna terminó bien */
  | { kind: 'no_good_run' }
  /** La última buena pasó de 48 horas. hours son las horas completas que lleva */
  | { kind: 'stale'; hours: number }
  | { kind: 'fresh'; hours: number };

/** Horas completas entre un instante y ahora. null si el instante no se entiende. Nunca negativas */
export function hoursSince(iso: string | null, now: Date): number | null {
  if (iso === null) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  return Math.max(Math.floor((now.getTime() - time) / 3_600_000), 0);
}

export function calibrationHealth(
  data: Pick<AdminCalibration, 'lastOkAt' | 'runs'>,
  now: Date,
): CalibrationHealth {
  if (data.runs.length === 0 && data.lastOkAt === null) return { kind: 'never' };
  const hours = hoursSince(data.lastOkAt, now);
  if (hours === null) return { kind: 'no_good_run' };
  return hours > STALE_AFTER_HOURS ? { kind: 'stale', hours } : { kind: 'fresh', hours };
}

const RELATIVE = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });

/** Hace cuánto fue un instante, en palabras. Hace unos minutos, hace 5 horas, hace 3 días */
export function agoText(iso: string, now: Date): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor((now.getTime() - time) / 60_000);
  if (minutes < 2) return 'hace un momento';
  if (minutes < 60) return RELATIVE.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return RELATIVE.format(-hours, 'hour');
  return RELATIVE.format(-Math.floor(hours / 24), 'day');
}

const COUNT_ORDER = Object.keys(text.counts);

function countValue(key: string, value: number | string | boolean | null): string {
  if (typeof value === 'boolean') return value ? text.yes : text.no;
  if (typeof value === 'number') return value.toLocaleString('es-MX');
  if (value === null) return '—';
  return key === 'fatigueState' ? (text.fatigueStates[value] ?? value) : value;
}

/** Los conteos de una corrida que tienen nombre, en el orden de la lista. Los técnicos sin nombre no salen */
export function labeledCounts(
  counts: CalibrationRun['counts'],
): { key: string; label: string; value: string }[] {
  return COUNT_ORDER.flatMap((key) => {
    const value = counts[key];
    const label = text.counts[key];
    return value === undefined || label === undefined
      ? []
      : [{ key, label, value: countValue(key, value) }];
  });
}

const numberOf = (value: number | string | boolean | null | undefined): number | null =>
  typeof value === 'number' ? value : null;

/** Una línea con lo más importante de una corrida. Solo lo que la corrida contó */
export function runSummary(run: Pick<CalibrationRun, 'counts'>): string[] {
  const { counts } = run;
  const parts: string[] = [];
  const consenters = numberOf(counts.consenters);
  if (consenters !== null) parts.push(text.consenters(consenters));
  const physician = numberOf(counts.itemsPhysicianEstimate);
  const provisional = numberOf(counts.itemsProvisional);
  const calibrated = numberOf(counts.itemsCalibrated);
  if (physician !== null && provisional !== null && calibrated !== null) {
    parts.push(text.items(physician, provisional, calibrated));
  }
  const flagsNew = numberOf(counts.flagsNew);
  if (flagsNew !== null) parts.push(text.flags(flagsNew));
  const ready = numberOf(counts.cellsReady);
  const calibrating = numberOf(counts.cellsCalibrating);
  if (ready !== null && calibrating !== null) parts.push(text.cells(ready, calibrating));
  const fatigue = counts.fatigueState;
  if (typeof fatigue === 'string') {
    parts.push(text.fatigue(text.fatigueStates[fatigue] ?? fatigue));
  }
  if (typeof counts.parity === 'boolean') {
    parts.push(counts.parity ? text.parityMatch : text.parityMismatch);
  }
  return parts;
}

/** El color de la etiqueta de estado de una corrida */
export function runTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'ok') return 'success';
  if (status === 'partial') return 'warning';
  if (status === 'failed' || status === 'interrupted') return 'danger';
  return 'neutral';
}

/** 15 oct 2026, 4:31 a. m., en la zona de la calibración, que es la de Mérida */
export function whenText(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: CALIBRATION_TIME_ZONE,
  });
}

/** 15 de octubre, el día de un instante en la zona de la calibración */
export function dayText(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    timeZone: CALIBRATION_TIME_ZONE,
  });
}

/** El motivo de una corrida en español. Un código que no se conoce se muestra tal cual */
export function reasonText(reason: string | null): string {
  return reason === null ? '' : (calibrationAdminTexts.reasons[reason] ?? reason);
}
