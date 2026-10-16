// Ajustes del modelo (B14, 1.5 del plan). Los valores de fábrica, lo que se ignora y el piso de 30
import { describe, expect, it } from 'vitest';
import {
  FACTORY_MIN_NOTICE_VERSION,
  FACTORY_MODEL_SETTINGS,
  MIN_PRIVACY_GROUP,
  ModelSettingsSchema,
  readModelSettings,
} from './modelSettings';

describe('ajustes del modelo', () => {
  it('los valores de fábrica son los de 1.5 del plan', () => {
    expect(FACTORY_MODEL_SETTINGS).toEqual({
      calibration: { enabled: false, mode: 'dry_run', minNoticeVersion: '2026-10-15b' },
      features: { comparison: true, adaptive: true },
      thresholds: {
        provisionalMaxSe: 0.5,
        calibratedMaxSe: 0.3,
        minGroupSize: 30,
        comparisonWindowDays: 30,
        minBranchAnswers: 20,
        adaptiveMinItems: 50,
        adaptiveTargetOffset: 0,
        adaptiveExploreShare: 0.2,
        maxDailyFirstAttempts: 400,
        populationMinStudents: 30,
        fatigue: { minStudents: 30, minSplitHalfKappa: 0.4, minMotiveReports: 40 },
      },
    });
    expect(FACTORY_MIN_NOTICE_VERSION).toBe('2026-10-15b');
  });

  it('sin nada, o con algo que no es un objeto, quedan los de fábrica', () => {
    for (const raw of [undefined, null, 'texto', 7, [], true]) {
      expect(readModelSettings(raw)).toEqual(FACTORY_MODEL_SETTINGS);
    }
    expect(ModelSettingsSchema.parse({})).toEqual(FACTORY_MODEL_SETTINGS);
  });

  it('lo que el admin escribe bien se respeta', () => {
    const settings = readModelSettings({
      calibration: { enabled: true, mode: 'apply', minNoticeVersion: '2026-11-01' },
      features: { comparison: false },
      thresholds: {
        minGroupSize: 50,
        comparisonWindowDays: 14,
        adaptiveMinItems: 80,
        adaptiveExploreShare: 0.1,
        fatigue: { minMotiveReports: 60 },
      },
    });
    expect(settings.calibration).toEqual({
      enabled: true,
      mode: 'apply',
      minNoticeVersion: '2026-11-01',
    });
    expect(settings.features).toEqual({ comparison: false, adaptive: true });
    expect(settings.thresholds.minGroupSize).toBe(50);
    expect(settings.thresholds.comparisonWindowDays).toBe(14);
    expect(settings.thresholds.adaptiveMinItems).toBe(80);
    expect(settings.thresholds.adaptiveExploreShare).toBe(0.1);
    expect(settings.thresholds.fatigue).toEqual({
      minStudents: 30,
      minSplitHalfKappa: 0.4,
      minMotiveReports: 60,
    });
  });

  it('minGroupSize y populationMinStudents nunca bajan de 30, aunque el admin escriba menos', () => {
    for (const value of [29, 10, 1, 0, -5, 12.5]) {
      const settings = readModelSettings({
        thresholds: { minGroupSize: value, populationMinStudents: value },
      });
      expect(settings.thresholds.minGroupSize).toBe(MIN_PRIVACY_GROUP);
      expect(settings.thresholds.populationMinStudents).toBe(MIN_PRIVACY_GROUP);
    }
    expect(readModelSettings({ thresholds: { minGroupSize: 30 } }).thresholds.minGroupSize).toBe(
      30,
    );
  });

  it('un valor que no cumple se ignora y no tira los demás', () => {
    const settings = readModelSettings({
      calibration: { enabled: 'sí', mode: 'publicar', minNoticeVersion: '' },
      features: { comparison: 'no', adaptive: false },
      thresholds: {
        provisionalMaxSe: -1,
        calibratedMaxSe: 'bajo',
        adaptiveExploreShare: 0.9,
        maxDailyFirstAttempts: 1.5,
        comparisonWindowDays: 14,
        fatigue: { minSplitHalfKappa: 7, minStudents: 40 },
      },
    });
    expect(settings.calibration).toEqual({
      enabled: false,
      mode: 'dry_run',
      minNoticeVersion: '2026-10-15b',
    });
    expect(settings.features).toEqual({ comparison: true, adaptive: false });
    expect(settings.thresholds.provisionalMaxSe).toBe(0.5);
    expect(settings.thresholds.calibratedMaxSe).toBe(0.3);
    expect(settings.thresholds.adaptiveExploreShare).toBe(0.2);
    expect(settings.thresholds.maxDailyFirstAttempts).toBe(400);
    expect(settings.thresholds.comparisonWindowDays).toBe(14);
    expect(settings.thresholds.fatigue).toEqual({
      minStudents: 40,
      minSplitHalfKappa: 0.4,
      minMotiveReports: 40,
    });
  });

  it('una sección que no es un objeto queda de fábrica y las llaves desconocidas se ignoran', () => {
    const settings = readModelSettings({
      calibration: 'prendida',
      features: [],
      thresholds: { fatigue: 3, algoNuevo: 1 },
      algoNuevo: { x: 1 },
    });
    expect(settings).toEqual(FACTORY_MODEL_SETTINGS);
    expect(settings).not.toHaveProperty('algoNuevo');
    expect(settings.thresholds).not.toHaveProperty('algoNuevo');
  });
});
