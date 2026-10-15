// Formato, umbrales y bandera de Inglés médico (B13, 1.9 y 1.10 del plan de B13). El examen real trae 250
// reactivos en español y 30 en inglés, y los umbrales del inglés los edita el admin como los demás.
import { describe, expect, it } from 'vitest';
import { ENARM_FORMAT, ENGLISH_PLACEMENT } from './exam';
import { APP_ENVS, FEATURE_FLAGS, isFeatureEnabled } from './featureFlags';
import { FACTORY_THRESHOLDS, mergeThresholds } from './thresholds';

describe('formato del examen con su parte en inglés', () => {
  it('son 250 reactivos en español y 30 en inglés, 280 en total', () => {
    expect(ENARM_FORMAT).toEqual({ clinical: 250, english: 30 });
    expect(ENARM_FORMAT.clinical + ENARM_FORMAT.english).toBe(280);
  });

  it('el inglés va mezclado por casos mientras la convocatoria no diga otra cosa', () => {
    expect(ENGLISH_PLACEMENT).toBe('mixed');
  });
});

describe('umbrales del inglés', () => {
  it('traen los valores de fábrica del plan', () => {
    expect(FACTORY_THRESHOLDS.english).toEqual({
      secondsPerItem: 90,
      examMinItems: 30,
      practiceMinCases: 1,
      minAnswersForStats: 20,
    });
  });

  it('el admin los cambia y se valida el conjunto, como los demás', () => {
    const merged = mergeThresholds(FACTORY_THRESHOLDS, {
      english: { secondsPerItem: 77, minAnswersForStats: 30 },
    });
    expect(merged.ok && merged.value.english).toEqual({
      secondsPerItem: 77,
      examMinItems: 30,
      practiceMinCases: 1,
      minAnswersForStats: 30,
    });
    const invalid: Record<string, number>[] = [
      { secondsPerItem: 29 },
      { secondsPerItem: 301 },
      { secondsPerItem: 90.5 },
      { examMinItems: 0 },
      { practiceMinCases: -1 },
      { minAnswersForStats: 0 },
      { inventado: 1 },
    ];
    for (const patch of invalid) {
      const result = mergeThresholds(FACTORY_THRESHOLDS, { english: patch });
      expect(result.ok, JSON.stringify(patch)).toBe(false);
    }
  });
});

describe('bandera medicalEnglish', () => {
  it('nace prendida en los tres entornos y el servidor la puede apagar', () => {
    expect(FEATURE_FLAGS.medicalEnglish.description.length).toBeGreaterThan(10);
    for (const appEnv of APP_ENVS) {
      expect(isFeatureEnabled('medicalEnglish', { appEnv, stored: null }), appEnv).toBe(true);
      expect(
        isFeatureEnabled('medicalEnglish', { appEnv, stored: { medicalEnglish: false } }),
        appEnv,
      ).toBe(false);
    }
  });
});
