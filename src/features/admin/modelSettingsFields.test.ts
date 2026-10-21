import { describe, expect, it } from 'vitest';
import { FACTORY_MODEL_SETTINGS, readModelSettings } from '@/config/modelSettings';
import { mergeModelSettings } from '@/data/cloud/calibrationAdmin';
import { calibrationAdminTexts } from '@/i18n/calibrationAdmin';
import {
  MODEL_FIELDS,
  draftFrom,
  factoryDraft,
  factoryPatch,
  patchFromDraft,
  thresholdValue,
  validateModelDraft,
  type ModelField,
} from './modelSettingsFields';

const errors = calibrationAdminTexts.settings.errors;

/** Los ajustes que la app lee si el servidor guardó este valor en este campo */
function readWith(field: ModelField, value: number) {
  const [first = '', second] = field.id.split('.');
  const thresholds = second === undefined ? { [first]: value } : { [first]: { [second]: value } };
  return readModelSettings({ thresholds });
}

describe('rangos de los campos contra el esquema con el que lee la app', () => {
  for (const field of MODEL_FIELDS) {
    it(`${field.id} acepta su mínimo y su máximo y descarta lo que queda afuera`, () => {
      const factory = thresholdValue(FACTORY_MODEL_SETTINGS, field.id);
      expect(thresholdValue(readWith(field, field.min), field.id)).toBe(field.min);
      expect(thresholdValue(readWith(field, field.max), field.id)).toBe(field.max);
      const below = field.kind === 'int' ? field.min - 1 : field.min - 0.01;
      const above = field.kind === 'int' ? field.max + 1 : field.max + 0.01;
      expect(thresholdValue(readWith(field, below), field.id)).toBe(factory);
      expect(thresholdValue(readWith(field, above), field.id)).toBe(factory);
      if (field.kind === 'int') {
        const middle = Math.min(field.min + 1.5, field.max);
        if (!Number.isInteger(middle)) {
          expect(thresholdValue(readWith(field, middle), field.id)).toBe(factory);
        }
      }
    });
  }

  it('los campos con piso de privacidad empiezan en 30, que es el piso del esquema', () => {
    const floors = MODEL_FIELDS.filter((field) => field.privacyFloor === true);
    expect(floors.map((field) => field.id)).toEqual(['minGroupSize', 'populationMinStudents']);
    for (const field of floors) expect(field.min).toBe(30);
  });

  it('cubre todos los umbrales del esquema que no son de otra pantalla', () => {
    const ids = MODEL_FIELDS.map((field) => field.id).sort();
    const { fatigue, ...rest } = FACTORY_MODEL_SETTINGS.thresholds;
    const expected = [
      ...Object.keys(rest),
      ...Object.keys(fatigue).map((key) => `fatigue.${key}`),
    ].sort();
    expect(ids).toEqual(expected);
  });
});

describe('borrador', () => {
  it('el de fábrica no trae errores y dice lo que dice el esquema', () => {
    const draft = factoryDraft();
    expect(validateModelDraft(draft)).toEqual({});
    expect(draft.values.minGroupSize).toBe('30');
    expect(draft.values['fatigue.minSplitHalfKappa']).toBe('0.4');
    expect(draft.comparison).toBe(true);
    expect(draft.adaptive).toBe(true);
  });

  it('rechaza lo que no es número, lo vacío, los enteros con decimales y lo que sale del rango', () => {
    const draft = factoryDraft();
    draft.values.minBranchAnswers = '';
    draft.values.comparisonWindowDays = 'siete';
    draft.values.adaptiveMinItems = '10.5';
    draft.values.maxDailyFirstAttempts = '9';
    draft.values.adaptiveExploreShare = '0.8';
    expect(validateModelDraft(draft)).toEqual({
      minBranchAnswers: errors.notNumber,
      comparisonWindowDays: errors.notNumber,
      adaptiveMinItems: errors.notInteger,
      maxDailyFirstAttempts: errors.range(10, 5000),
      adaptiveExploreShare: errors.range(0, 0.5),
    });
  });

  it('minGroupSize y populationMinStudents no bajan de 30 y lo dicen como promesa de privacidad', () => {
    const draft = factoryDraft();
    draft.values.minGroupSize = '29';
    draft.values.populationMinStudents = '10';
    expect(validateModelDraft(draft)).toEqual({
      minGroupSize: errors.floor,
      populationMinStudents: errors.floor,
    });
    draft.values.minGroupSize = '30';
    draft.values.populationMinStudents = '45';
    expect(validateModelDraft(draft)).toEqual({});
  });

  it('el error estándar de calibrada tiene que ser menor que el de provisional', () => {
    const draft = factoryDraft();
    draft.values.calibratedMaxSe = '0.5';
    expect(validateModelDraft(draft)).toEqual({ calibratedMaxSe: errors.seOrder });
    draft.values.calibratedMaxSe = '0.4';
    expect(validateModelDraft(draft)).toEqual({});
  });
});

describe('lo que se guarda', () => {
  it('sin cambios no hay nada que guardar', () => {
    expect(patchFromDraft(factoryDraft(), FACTORY_MODEL_SETTINGS)).toEqual({});
    const saved = readModelSettings({ thresholds: { minBranchAnswers: 25 } });
    expect(patchFromDraft(draftFrom(saved), saved)).toEqual({});
  });

  it('solo lleva los campos que cambiaron, con los de fatiga en su nivel', () => {
    const draft = factoryDraft();
    draft.values.minBranchAnswers = '25';
    draft.values['fatigue.minStudents'] = '40';
    draft.values.adaptiveTargetOffset = '-0.5';
    draft.adaptive = false;
    expect(patchFromDraft(draft, FACTORY_MODEL_SETTINGS)).toEqual({
      features: { adaptive: false },
      thresholds: {
        minBranchAnswers: 25,
        adaptiveTargetOffset: -0.5,
        fatigue: { minStudents: 40 },
      },
    });
  });

  it('volver a lo de fábrica deja los ajustes como los de fábrica y conserva la calibración', () => {
    const tuned = {
      calibration: { enabled: true, mode: 'apply', minNoticeVersion: '2026-10-15b' },
      features: { comparison: false, adaptive: false },
      thresholds: { minGroupSize: 50, minBranchAnswers: 40, fatigue: { minStudents: 80 } },
    };
    const merged = mergeModelSettings(tuned, factoryPatch());
    const read = readModelSettings(merged);
    expect(read.thresholds).toEqual(FACTORY_MODEL_SETTINGS.thresholds);
    expect(read.features).toEqual(FACTORY_MODEL_SETTINGS.features);
    expect(read.calibration).toEqual({
      enabled: true,
      mode: 'apply',
      minNoticeVersion: '2026-10-15b',
    });
  });
});
