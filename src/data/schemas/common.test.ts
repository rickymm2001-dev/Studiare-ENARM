import { describe, expect, it } from 'vitest';
import {
  CURRENT_ERROR_CAUSES,
  CurrentErrorCauseSchema,
  ErrorCauseSchema,
  LegacyErrorCauseSchema,
  normalizeErrorCause,
} from './common';

describe('motivos de error (D-124)', () => {
  it('los 7 motivos vigentes son válidos en CurrentErrorCauseSchema y ErrorCauseSchema', () => {
    expect(CURRENT_ERROR_CAUSES).toHaveLength(7);
    for (const cause of CURRENT_ERROR_CAUSES) {
      expect(CurrentErrorCauseSchema.safeParse(cause).success).toBe(true);
      expect(ErrorCauseSchema.safeParse(cause).success).toBe(true);
      // normalizeErrorCause los conserva idénticos
      expect(normalizeErrorCause(cause)).toBe(cause);
    }
  });

  it('los 8 motivos heredados son válidos en LegacyErrorCauseSchema y ErrorCauseSchema', () => {
    const legacy = [
      'not_studied',
      'forgot',
      'confused',
      'misread',
      'missed_detail',
      'rushed_or_tired',
      'changed_answer',
      'other',
    ];
    for (const cause of legacy) {
      expect(LegacyErrorCauseSchema.safeParse(cause).success).toBe(true);
      expect(ErrorCauseSchema.safeParse(cause).success).toBe(true);
      expect(CurrentErrorCauseSchema.safeParse(cause).success).toBe(false);
    }
  });

  it('tabla de equivalencias D-124 mapea correctamente motivos heredados', () => {
    // not_studied, forgot, confused -> knowledge
    expect(normalizeErrorCause('not_studied')).toBe('knowledge');
    expect(normalizeErrorCause('forgot')).toBe('knowledge');
    expect(normalizeErrorCause('confused')).toBe('knowledge');

    // misread -> misinterpretation
    expect(normalizeErrorCause('misread')).toBe('misinterpretation');

    // missed_detail -> shallow_reading
    expect(normalizeErrorCause('missed_detail')).toBe('shallow_reading');

    // rushed_or_tired -> time
    expect(normalizeErrorCause('rushed_or_tired')).toBe('time');

    // changed_answer -> anxiety
    expect(normalizeErrorCause('changed_answer')).toBe('anxiety');

    // other / null / undefined / desconocido -> null
    expect(normalizeErrorCause('other')).toBeNull();
    expect(normalizeErrorCause(null)).toBeNull();
    expect(normalizeErrorCause(undefined)).toBeNull();
    expect(normalizeErrorCause('unknown_cause')).toBeNull();
  });
});
