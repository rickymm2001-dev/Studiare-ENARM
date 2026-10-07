import { describe, expect, it } from 'vitest';
import {
  ALL_BRANCHES,
  DEFAULT_FUTURE_LOAD,
  DEFAULT_WEAK_TOPICS,
  readFutureLoadSettings,
  readWeakTopicsSettings,
} from './analysisSettings';

describe('ajustes de los widgets de análisis', () => {
  it('sin nada guardado usan los de siempre', () => {
    expect(readWeakTopicsSettings({})).toEqual(DEFAULT_WEAK_TOPICS);
    expect(readFutureLoadSettings({})).toEqual(DEFAULT_FUTURE_LOAD);
  });

  it('respetan lo guardado cuando es uno de los valores permitidos', () => {
    expect(readWeakTopicsSettings({ count: 8, branch: 'internal_medicine' })).toEqual({
      count: 8,
      branch: 'internal_medicine',
    });
    expect(readFutureLoadSettings({ days: 60 })).toEqual({ days: 60 });
  });

  it('descartan valores que no existen, de otro tipo o alterados', () => {
    expect(readWeakTopicsSettings({ count: 4, branch: 'no_existe' })).toEqual(DEFAULT_WEAK_TOPICS);
    expect(readWeakTopicsSettings({ count: '8', branch: 12 })).toEqual(DEFAULT_WEAK_TOPICS);
    expect(readWeakTopicsSettings({ count: 3, branch: ALL_BRANCHES }).count).toBe(3);
    expect(readFutureLoadSettings({ days: 45 })).toEqual(DEFAULT_FUTURE_LOAD);
    expect(readFutureLoadSettings({ days: '60' })).toEqual(DEFAULT_FUTURE_LOAD);
  });
});
