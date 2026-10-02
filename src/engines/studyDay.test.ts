import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  studyDayEnd,
  studyDayOf,
  studyDayStart,
  weekStartOf,
} from './studyDay';

const MERIDA = 'America/Merida';

describe('día de estudio con corte a las 4 a. m. de Mérida (9.4)', () => {
  it('antes de las 4 a. m. cuenta el día anterior', () => {
    // Mérida está en UTC−6. 09:30 UTC son las 03:30 locales del 2 de octubre
    expect(studyDayOf(new Date('2026-10-02T09:30:00.000Z'), MERIDA)).toBe('2026-10-01');
    expect(studyDayOf(new Date('2026-10-02T10:00:00.000Z'), MERIDA)).toBe('2026-10-02');
    expect(studyDayOf(new Date('2026-10-03T05:59:00.000Z'), MERIDA)).toBe('2026-10-02');
  });

  it('inicio y fin de un día de estudio', () => {
    expect(studyDayStart('2026-10-02', MERIDA).toISOString()).toBe('2026-10-02T10:00:00.000Z');
    expect(studyDayEnd('2026-10-02', MERIDA).toISOString()).toBe('2026-10-03T10:00:00.000Z');
  });

  it('suma días, cuenta diferencias y encuentra el lunes', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(daysBetween('2026-10-01', '2027-09-14')).toBe(348);
    expect(daysBetween('2026-10-05', '2026-10-01')).toBe(-4);
    // El 1 de octubre de 2026 es jueves
    expect(weekStartOf('2026-10-01')).toBe('2026-09-28');
    expect(weekStartOf('2026-09-28')).toBe('2026-09-28');
    expect(weekStartOf('2026-10-04')).toBe('2026-09-28');
  });

  it('rechaza días mal escritos', () => {
    expect(() => addDays('2026/10/01', 1)).toThrow(RangeError);
  });
});
