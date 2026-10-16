import { describe, expect, it } from 'vitest';
import { physicianToLogit } from '@/engines/difficulty';
import type { CatalogEntry } from '../schemas/bankCloud';
import {
  calibrationOf,
  effectiveDifficulty,
  effectiveDifficultyFromStats,
  effectiveLevel,
  isMeasured,
  poolDifficulty,
} from './calibration';

const VERSION = '01JAA6S0000000000000000001';
const OTHER = '01JAA6S0000000000000000002';

const calibration = (
  overrides: Partial<NonNullable<CatalogEntry['calibration']>> = {},
): NonNullable<CatalogEntry['calibration']> => ({
  versionId: VERSION,
  state: 'calibrated',
  difficulty: 0.8,
  se: 0.2,
  students: 134,
  elo: 0.7,
  extreme: false,
  studyDay: '2026-10-15',
  ...overrides,
});

const entry = (
  calibrationValue: CatalogEntry['calibration'],
  difficulty = 3,
): Pick<CatalogEntry, 'versionId' | 'difficulty' | 'calibration'> => ({
  versionId: VERSION,
  difficulty,
  ...(calibrationValue === undefined ? {} : { calibration: calibrationValue }),
});

describe('dificultad que usa la app (4.4)', () => {
  it('sin calibración usa la del médico en logits', () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(effectiveDifficulty(entry(undefined, level))).toEqual({
        logit: physicianToLogit(level),
        source: 'physician_estimate',
        students: 0,
      });
      expect(effectiveDifficulty(entry(null, level)).source).toBe('physician_estimate');
    }
  });

  it('calibrada o provisional usa la de Rasch y dice cuántos alumnos hay detrás', () => {
    expect(effectiveDifficulty(entry(calibration(), 2))).toEqual({
      logit: 0.8,
      source: 'calibrated',
      students: 134,
    });
    expect(
      effectiveDifficulty(
        entry(calibration({ state: 'provisional', students: 45, difficulty: -1.2 })),
      ),
    ).toEqual({ logit: -1.2, source: 'provisional', students: 45 });
  });

  it('la calibración de otra versión no vale, aunque sea la de la misma pregunta', () => {
    const old = calibration({ versionId: OTHER });
    expect(calibrationOf(entry(old))).toBeNull();
    expect(effectiveDifficulty(entry(old, 4))).toMatchObject({
      logit: physicianToLogit(4),
      source: 'physician_estimate',
      students: 0,
    });
    expect(calibrationOf(entry(calibration()))?.state).toBe('calibrated');
  });

  it('una pregunta extrema o sin estimación finita se queda con la del médico', () => {
    expect(effectiveDifficulty(entry(calibration({ extreme: true, students: 60 }), 5))).toEqual({
      logit: physicianToLogit(5),
      source: 'physician_estimate',
      students: 60,
    });
    expect(effectiveDifficulty(entry(calibration({ difficulty: null }), 1)).source).toBe(
      'physician_estimate',
    );
    expect(effectiveDifficulty(entry(calibration({ difficulty: Number.NaN }), 1)).source).toBe(
      'physician_estimate',
    );
  });

  it('con pocos alumnos sigue la del médico, pero cuenta cuántos hay', () => {
    expect(
      effectiveDifficulty(
        entry(calibration({ state: 'physician_estimate', students: 12, difficulty: 3 }), 2),
      ),
    ).toEqual({ logit: physicianToLogit(2), source: 'physician_estimate', students: 12 });
  });

  it('isMeasured distingue lo que sale de las respuestas', () => {
    expect(isMeasured('calibrated')).toBe(true);
    expect(isMeasured('provisional')).toBe(true);
    expect(isMeasured('physician_estimate')).toBe(false);
  });
});

describe('nivel de la escala del médico', () => {
  it('la dificultad del médico vuelve a su mismo nivel', () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      expect(effectiveLevel({ logit: physicianToLogit(level) })).toBe(level);
    }
  });

  it('redondea al nivel más cercano y no sale de 1 a 5', () => {
    expect(effectiveLevel({ logit: -0.4 })).toBe(3);
    expect(effectiveLevel({ logit: 0.6 })).toBe(4);
    expect(effectiveLevel({ logit: -1.6 })).toBe(1);
    expect(effectiveLevel({ logit: -9 })).toBe(1);
    expect(effectiveLevel({ logit: 9 })).toBe(5);
    expect(effectiveLevel({ logit: Number.NaN })).toBe(3);
  });
});

describe('dificultad de la demostración desde itemStatsCache', () => {
  it('usa la de Rasch si el estado ya es provisional o calibrado', () => {
    expect(
      effectiveDifficultyFromStats(3, {
        calibration: 'calibrated',
        raschDifficulty: 1.3,
        responses: 210,
      }),
    ).toEqual({ logit: 1.3, source: 'calibrated', students: 210 });
  });

  it('con pocas respuestas, sin estimación o sin datos usa la del médico', () => {
    expect(
      effectiveDifficultyFromStats(4, {
        calibration: 'physician_estimate',
        raschDifficulty: 0.2,
        responses: 12,
      }),
    ).toEqual({ logit: physicianToLogit(4), source: 'physician_estimate', students: 12 });
    expect(
      effectiveDifficultyFromStats(2, {
        calibration: 'provisional',
        raschDifficulty: null,
        responses: 40,
      }).source,
    ).toBe('physician_estimate');
    expect(effectiveDifficultyFromStats(5, undefined)).toEqual({
      logit: physicianToLogit(5),
      source: 'physician_estimate',
      students: 0,
    });
  });
});

describe('dificultad de una pregunta del pool', () => {
  it('usa la calculada si la fuente la trae y si no la del médico', () => {
    const measured = { logit: 1.1, source: 'calibrated' as const, students: 120 };
    expect(poolDifficulty({ physicianDifficulty: 2, effectiveDifficulty: measured })).toBe(
      measured,
    );
    expect(poolDifficulty({ physicianDifficulty: 2 })).toEqual({
      logit: physicianToLogit(2),
      source: 'physician_estimate',
      students: 0,
    });
  });
});
