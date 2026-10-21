import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import type { CalibrationRun } from '@/data/cloud/calibrationAdmin';
import {
  STALE_AFTER_HOURS,
  agoText,
  calibrationHealth,
  hoursSince,
  labeledCounts,
  runSummary,
  runTone,
} from './calibrationView';

const now = new Date('2026-10-16T12:00:00.000Z');
const run = (counts: CalibrationRun['counts']): Pick<CalibrationRun, 'counts'> => ({ counts });

/** Los ajustes con la calibración encendida o apagada */
const settings = (enabled: boolean) => ({
  ...FACTORY_MODEL_SETTINGS,
  calibration: { ...FACTORY_MODEL_SETTINGS.calibration, enabled },
});

describe('si la calibración está al día', () => {
  it('sin corridas ni corrida buena dice que nunca ha corrido', () => {
    expect(calibrationHealth({ lastOkAt: null, runs: [], settings: settings(true) }, now)).toEqual({
      kind: 'never',
    });
  });

  it('con corridas pero ninguna buena lo dice aparte', () => {
    const runs = [{ id: 'a' }] as CalibrationRun[];
    expect(calibrationHealth({ lastOkAt: null, runs, settings: settings(true) }, now)).toEqual({
      kind: 'no_good_run',
    });
  });

  it('avisa solo cuando la última buena pasa de 48 horas', () => {
    const at = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
    const runs = [{ id: 'a' }] as CalibrationRun[];
    expect(STALE_AFTER_HOURS).toBe(48);
    expect(calibrationHealth({ lastOkAt: at(5), runs, settings: settings(true) }, now)).toEqual({
      kind: 'fresh',
      hours: 5,
    });
    expect(calibrationHealth({ lastOkAt: at(48), runs, settings: settings(true) }, now)).toEqual({
      kind: 'fresh',
      hours: 48,
    });
    expect(calibrationHealth({ lastOkAt: at(49), runs, settings: settings(true) }, now)).toEqual({
      kind: 'stale',
      hours: 49,
    });
    expect(calibrationHealth({ lastOkAt: at(200), runs, settings: settings(true) }, now)).toEqual({
      kind: 'stale',
      hours: 200,
    });
  });

  it('apagada a propósito no avisa ni de las 48 horas ni de que no hay corrida buena (revisión de B14, hallazgo 8)', () => {
    const at = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
    const runs = [{ id: 'a' }] as CalibrationRun[];
    const off = settings(false);
    expect(calibrationHealth({ lastOkAt: at(200), runs, settings: off }, now)).toEqual({
      kind: 'off',
    });
    expect(calibrationHealth({ lastOkAt: null, runs, settings: off }, now)).toEqual({
      kind: 'off',
    });
    // Sin ninguna corrida sigue diciendo que nunca ha corrido, porque puede faltar la llave
    expect(calibrationHealth({ lastOkAt: null, runs: [], settings: off }, now)).toEqual({
      kind: 'never',
    });
    // Encendida de nuevo, el aviso vuelve
    expect(calibrationHealth({ lastOkAt: at(200), runs, settings: settings(true) }, now)).toEqual({
      kind: 'stale',
      hours: 200,
    });
  });

  it('un instante en el futuro o roto no rompe nada', () => {
    expect(hoursSince('2026-10-17T00:00:00.000Z', now)).toBe(0);
    expect(hoursSince('no es fecha', now)).toBeNull();
    expect(hoursSince(null, now)).toBeNull();
  });
});

describe('hace cuánto', () => {
  const ago = (ms: number) => agoText(new Date(now.getTime() - ms).toISOString(), now);
  it('lo dice en minutos, horas y días', () => {
    expect(ago(30_000)).toBe('hace un momento');
    expect(ago(10 * 60_000)).toBe('hace 10 minutos');
    expect(ago(5 * 3_600_000)).toBe('hace 5 horas');
    expect(ago(47 * 3_600_000)).toBe('hace 47 horas');
    expect(ago(72 * 3_600_000)).toBe('hace 3 días');
  });
  it('un instante que no se entiende no dice nada', () => {
    expect(agoText('ayer', now)).toBe('');
  });
});

describe('conteos de una corrida', () => {
  it('pone nombre a los que lo tienen, en un orden fijo, y deja fuera los técnicos', () => {
    const rows = labeledCounts({
      flagsNew: 3,
      consenters: 1412,
      parity: true,
      fatigueState: 'validated',
      answerPages: 7,
      itemsCalibrated: 10,
    });
    expect(rows.map((row) => row.label)).toEqual([
      'Alumnos con permiso',
      'Calibradas',
      'Detector de fatiga',
      'Kappa igual al del tablero',
      'Marcas nuevas',
    ]);
    expect(rows.map((row) => row.value)).toEqual([
      (1412).toLocaleString('es-MX'),
      '10',
      'Validado',
      'Sí',
      '3',
    ]);
  });

  it('una corrida sin conteos no trae filas', () => {
    expect(labeledCounts({})).toEqual([]);
  });
});

describe('la línea de una corrida', () => {
  it('junta lo que la corrida contó', () => {
    expect(
      runSummary(
        run({
          consenters: 412,
          itemsPhysicianEstimate: 260,
          itemsProvisional: 30,
          itemsCalibrated: 10,
          flagsNew: 1,
          cellsReady: 20,
          cellsCalibrating: 8,
          fatigueState: 'calibrating',
          parity: false,
        }),
      ),
    ).toEqual([
      '412 alumnos con permiso',
      'Preguntas 260 del médico, 30 provisionales, 10 calibradas',
      '1 marca nueva',
      'Comparación 20 celdas listas y 8 calibrando',
      'Fatiga calibrando',
      'Kappa no coincide',
    ]);
  });

  it('una corrida saltada solo trae lo que alcanzó a contar', () => {
    expect(runSummary(run({ consenters: 0 }))).toEqual(['0 alumnos con permiso']);
    expect(runSummary(run({}))).toEqual([]);
  });
});

describe('color de la etiqueta de estado', () => {
  it('verde si terminó bien, amarillo con aviso, rojo si falló y neutro lo demás', () => {
    expect(runTone('ok')).toBe('success');
    expect(runTone('partial')).toBe('warning');
    expect(runTone('failed')).toBe('danger');
    expect(runTone('interrupted')).toBe('danger');
    expect(runTone('skipped')).toBe('neutral');
    expect(runTone('running')).toBe('neutral');
  });
});
