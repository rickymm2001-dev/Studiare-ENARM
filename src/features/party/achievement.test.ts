import { describe, expect, it } from 'vitest';
import { BRAND } from '@/config/brand';
import { STUDY_DAY_MIN } from '@/config/rewards';
import { t } from '@/i18n/es-MX';
import type { DaySummary } from '../home/snapshot';
import {
  buildWeekShare,
  weekShareFigures,
  weekShareLabel,
  weekShareText,
  type WeekShareSource,
} from './achievement';

const day = (patch: Partial<DaySummary>): DaySummary => ({
  cards: 0,
  questions: 0,
  focusMinutes: 0,
  xp: 0,
  ...patch,
});

/**
 * Miércoles 14 de octubre de 2026. La semana empieza el lunes 12. El domingo 11 es de la semana
 * anterior y no cuenta
 */
const snapshot: WeekShareSource = {
  today: '2026-10-14',
  activity: {
    '2026-10-11': day({ cards: 50, questions: 40, xp: 900 }),
    '2026-10-12': day({ cards: 30, questions: 10, xp: 400 }),
    // Solo minutos de Pomodoro, más de los que pide un día de estudio
    '2026-10-13': day({ focusMinutes: STUDY_DAY_MIN.minutes }),
    '2026-10-14': day({ cards: 12, questions: 5, xp: 150 }),
  },
  streak: {
    current: 9,
    best: 9,
    freezesAvailable: 0,
    freezeDays: [],
    todayMet: true,
    closedDays: [],
  },
};

const build = (patch: Partial<Parameters<typeof buildWeekShare>[0]> = {}) =>
  buildWeekShare({ snapshot, alias: null, simulated: false, includeStreak: true, ...patch });

describe('resumen de la semana para compartir', () => {
  it('cuenta los días de estudio, los repasos y las preguntas desde el lunes, con la racha', () => {
    expect(build()).toEqual({
      brand: BRAND.name,
      alias: null,
      weekStart: '2026-10-12',
      studyDays: 3,
      reviews: 42,
      questions: 15,
      streak: 9,
      simulated: false,
    });
  });

  it('un día con actividad por debajo del mínimo no es día de estudio', () => {
    const card = buildWeekShare({
      snapshot: {
        ...snapshot,
        activity: { '2026-10-13': day({ focusMinutes: STUDY_DAY_MIN.minutes - 1 }) },
      },
      alias: null,
      simulated: false,
      includeStreak: true,
    });
    expect(card).toMatchObject({ studyDays: 0, reviews: 0, questions: 0 });
  });

  it('el lunes la semana empieza ese mismo día', () => {
    const card = buildWeekShare({
      snapshot: { ...snapshot, today: '2026-10-12' },
      alias: null,
      simulated: false,
      includeStreak: true,
    });
    expect(card).toMatchObject({ weekStart: '2026-10-12', studyDays: 1, reviews: 30 });
  });

  it('no lleva exactitud, sesgos, XP, nivel ni ningún puntaje', () => {
    const card = build();
    expect(Object.keys(card).sort()).toEqual(
      [
        'alias',
        'brand',
        'questions',
        'reviews',
        'simulated',
        'streak',
        'studyDays',
        'weekStart',
      ].sort(),
    );
    const shared = weekShareText(card);
    expect(shared).not.toMatch(/XP|nivel|%|puntaje|acierto/i);
  });

  it('en modo enfoque la racha no va en las cifras ni en el texto', () => {
    const card = build({ includeStreak: false });
    expect(card.streak).toBeNull();
    expect(weekShareFigures(card).map((figure) => figure.label)).toEqual([
      t.b7.weekShare.studyDays,
      t.b7.weekShare.reviews,
      t.b7.weekShare.questions,
    ]);
    expect(weekShareText(card)).not.toContain('racha');
  });

  it('las cifras van en orden con su valor escrito', () => {
    expect(weekShareFigures(build())).toEqual([
      { label: t.b7.weekShare.studyDays, value: t.b7.weekShare.studyDaysValue(3) },
      { label: t.b7.weekShare.reviews, value: '42' },
      { label: t.b7.weekShare.questions, value: '15' },
      { label: t.b7.weekShare.streak, value: t.b7.weekShare.streakValue(9) },
    ]);
  });

  it('la semana se nombra por su lunes', () => {
    expect(weekShareLabel(build())).toBe(t.b7.weekShare.week('12 de octubre'));
  });

  it('el texto que acompaña a la imagen dice las cifras de la semana', () => {
    const text = weekShareText(build());
    expect(text).toBe(
      `Mi semana en ${BRAND.name}. 3 días de estudio, 42 repasos, 15 preguntas y una racha de 9 días.`,
    );
  });

  it('habla en singular cuando toca', () => {
    const card = buildWeekShare({
      snapshot: {
        ...snapshot,
        today: '2026-10-12',
        activity: { '2026-10-12': day({ cards: 1, questions: 1 }) },
        streak: { ...snapshot.streak, current: 1 },
      },
      alias: null,
      simulated: false,
      includeStreak: true,
    });
    expect(weekShareText(card)).toBe(
      `Mi semana en ${BRAND.name}. 1 día de estudio, 1 repaso, 1 pregunta y una racha de 1 día.`,
    );
  });

  it('el alias solo entra cuando el alumno lo pide', () => {
    expect(weekShareText(build({ alias: 'Ana' })).startsWith('Ana. ')).toBe(true);
    expect(weekShareText(build())).not.toContain('Ana');
  });

  it('con datos de demostración la imagen y el texto lo dicen', () => {
    const card = build({ simulated: true });
    expect(card.simulated).toBe(true);
    expect(weekShareText(card)).toContain(t.b7.weekShare.simulatedBanner);
    expect(weekShareText(build())).not.toContain(t.b7.weekShare.simulatedBanner);
  });
});
