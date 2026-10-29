import { describe, expect, it } from 'vitest';
import { createEvent } from '@/data/events/createEvent';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import {
  challengesByDay,
  FINAL_SIMULATOR_SUNDAYS,
  icsOf,
  MAX_PLAN_WEEKS,
  monthBounds,
  monthGrid,
  monthSummary,
  moveDayByKey,
  nextBusyDay,
  planEvents,
  sessionsByDay,
  shiftMonth,
  studyWeeks,
  weekdayIndex,
  yearMonthOf,
} from './studyCalendar';

describe('monthGrid', () => {
  it('arma semanas de lunes a domingo con relleno de otros meses', () => {
    // Octubre de 2026 empieza en jueves y termina en sábado
    const grid = monthGrid(2026, 10);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0]?.slice(0, 3)).toEqual([null, null, null]);
    expect(grid.weeks[0]?.[3]).toBe('2026-10-01');
    expect(grid.weeks.flat().filter((day) => day !== null)).toHaveLength(31);
    expect(grid.weeks.at(-1)?.[5]).toBe('2026-10-31');
    expect(grid.weeks.at(-1)?.[6]).toBeNull();
  });

  it('febrero de un año bisiesto tiene 29 días y uno que empieza en lunes no lleva relleno', () => {
    expect(
      monthGrid(2028, 2)
        .weeks.flat()
        .filter((day) => day !== null),
    ).toHaveLength(29);
    expect(monthGrid(2027, 2).weeks[0]?.[0]).toBe('2027-02-01');
  });

  it('weekdayIndex da 0 en lunes y 6 en domingo', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0);
    expect(weekdayIndex('2026-10-11')).toBe(6);
  });
});

describe('studyWeeks', () => {
  const branches = ['internal_medicine', 'pediatrics', 'obstetrics_gynecology'];

  it('la primera semana empieza hoy, las demás en lunes y la última es la del examen', () => {
    const weeks = studyWeeks({ today: '2026-10-22', examDate: '2026-11-18', branches });
    expect(weeks[0]?.start).toBe('2026-10-22');
    expect(weeks[0]?.end).toBe('2026-10-25');
    expect(weeks.slice(1).every((week) => weekdayIndex(week.start) === 0)).toBe(true);
    expect(weeks.at(-1)?.examWeek).toBe(true);
    expect(weeks.at(-1)?.simulatorSunday).toBeNull();
  });

  it('las ramas rotan en el orden pedido', () => {
    const weeks = studyWeeks({ today: '2026-10-05', examDate: '2027-01-30', branches });
    expect(weeks.slice(0, 4).map((week) => week.branch)).toEqual([
      'internal_medicine',
      'pediatrics',
      'obstetrics_gynecology',
      'internal_medicine',
    ]);
  });

  it('con tiempo de sobra los simuladores son los últimos domingos y no más de 10', () => {
    const weeks = studyWeeks({ today: '2026-10-05', examDate: '2027-09-13', branches });
    const sims = weeks.filter((week) => week.simulatorSunday !== null);
    expect(sims).toHaveLength(FINAL_SIMULATOR_SUNDAYS);
    expect(sims.map((week) => week.simulatorNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // Son consecutivos y terminan justo antes de la semana del examen
    const last = weeks.indexOf(sims.at(-1) as (typeof weeks)[number]);
    expect(weeks[last + 1]?.examWeek).toBe(true);
    expect(weekdayIndex(sims[0]?.simulatorSunday as string)).toBe(6);
  });

  it('con pocas semanas los simuladores no se comen las semanas de temas', () => {
    const weeks = studyWeeks({ today: '2026-10-05', examDate: '2026-11-08', branches });
    const sims = weeks.filter((week) => week.simulatorSunday !== null).length;
    const topics = weeks.filter((week) => week.simulatorSunday === null && !week.examWeek).length;
    expect(sims).toBeLessThanOrEqual(topics);
  });

  it('sin ramas o con el examen ya pasado no hay plan', () => {
    expect(studyWeeks({ today: '2026-10-05', examDate: '2027-01-01', branches: [] })).toEqual([]);
    expect(studyWeeks({ today: '2026-10-05', examDate: '2026-10-04', branches })).toEqual([]);
  });

  it('con el examen a más de 120 semanas el plan se corta y no pone simuladores lejos del examen', () => {
    // Septiembre de 2030 queda a casi 4 años, más allá del tope del plan
    const weeks = studyWeeks({ today: '2026-10-22', examDate: '2030-09-13', branches });
    expect(weeks).toHaveLength(MAX_PLAN_WEEKS);
    expect(weeks.some((week) => week.examWeek)).toBe(false);
    expect(weeks.filter((week) => week.simulatorSunday !== null)).toEqual([]);
    // El .ics tampoco exporta simuladores, y el examen va una sola vez en su fecha
    const events = planEvents(weeks, '2030-09-13', {
      week: (branch) => `Semana de ${branch}`,
      simulator: (n, total) => `Simulador ${n} de ${total}`,
      exam: 'ENARM',
    });
    expect(events.filter((event) => event.title.startsWith('Simulador'))).toEqual([]);
    expect(events.at(-1)).toMatchObject({ day: '2030-09-13', title: 'ENARM' });
  });

  it('con el examen justo dentro del tope sí hay simuladores', () => {
    // 119 semanas completas más la parte de la primera caben en 120
    const weeks = studyWeeks({ today: '2026-10-22', examDate: '2028-12-20', branches });
    expect(weeks.at(-1)?.examWeek).toBe(true);
    expect(weeks.filter((week) => week.simulatorSunday !== null)).toHaveLength(
      FINAL_SIMULATOR_SUNDAYS,
    );
  });

  it('el examen hoy es una sola semana de examen', () => {
    const weeks = studyWeeks({ today: '2026-10-05', examDate: '2026-10-05', branches });
    expect(weeks).toHaveLength(1);
    expect(weeks[0]?.examWeek).toBe(true);
  });
});

describe('planEvents e icsOf', () => {
  const labels = {
    week: (branch: string) => `Semana de ${branch}`,
    simulator: (n: number, total: number) => `Simulador ${n} de ${total}`,
    exam: 'ENARM',
  };

  it('da un evento por semana de temas, uno por simulador y el del examen, en orden', () => {
    const weeks = studyWeeks({ today: '2026-10-05', examDate: '2026-12-13', branches: ['a', 'b'] });
    const events = planEvents(weeks, '2026-12-13', labels);
    expect(events.at(-1)).toEqual({ uid: 'exam', day: '2026-12-13', title: 'ENARM' });
    expect([...events].sort((x, y) => x.day.localeCompare(y.day))).toEqual(events);
    expect(events.some((event) => /^Simulador \d+ de \d+$/.test(event.title))).toBe(true);
  });

  it('el .ics es válido, con CRLF, días completos y texto escapado', () => {
    const ics = icsOf(
      [
        { day: '2026-12-13', title: 'Examen, de cirugía; ¡ya!', description: 'Línea 1\nLínea 2' },
        { day: '2026-10-05', days: 7, title: 'Semana de pediatría' },
      ],
      new Date('2026-10-22T15:00:00.000Z'),
    );
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTAMP:20261022T150000Z');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261213');
    expect(ics).toContain('DTEND;VALUE=DATE:20261214');
    expect(ics).toContain('DTEND;VALUE=DATE:20261012');
    expect(ics).toContain('SUMMARY:Examen\\, de cirugía\\; ¡ya!');
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2');
    expect(ics.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
    expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(2);
  });

  it('el evento de cada semana empieza en su lunes y dura 7 días aunque hoy sea jueves', () => {
    const weeks = studyWeeks({ today: '2026-10-22', examDate: '2026-12-13', branches: ['a', 'b'] });
    const events = planEvents(weeks, '2026-12-13', labels);
    const first = events.find((event) => event.title.startsWith('Semana de'));
    expect(first).toMatchObject({ day: '2026-10-19', days: 7 });
    expect(
      events
        .filter((event) => event.title.startsWith('Semana de'))
        .every((event) => event.days === 7),
    ).toBe(true);
  });

  it('los UID salen de la clave del evento y no cambian al exportar otro día', () => {
    const at = new Date('2026-10-22T15:00:00.000Z');
    const uidsOf = (today: string) => {
      const weeks = studyWeeks({ today, examDate: '2027-09-13', branches: ['a', 'b', 'c'] });
      const ics = icsOf(planEvents(weeks, '2027-09-13', labels), at);
      return [...ics.matchAll(/^UID:(.+)$/gm)].map((match) => match[1] as string);
    };
    const thursday = uidsOf('2026-10-22');
    const nextThursday = uidsOf('2026-10-29');
    // Sin repetidos dentro de un mismo archivo
    expect(new Set(thursday).size).toBe(thursday.length);
    // Los simuladores y el examen son los mismos, y también las semanas que siguen en el plan
    const stable = (uid: string) => uid.startsWith('simulator-') || uid === 'exam@studiare';
    expect(thursday.filter(stable).sort()).toEqual(nextThursday.filter(stable).sort());
    expect(thursday.filter(stable)).toHaveLength(FINAL_SIMULATOR_SUNDAYS + 1);
    const weekUids = new Set(thursday.filter((uid) => uid.startsWith('week-')));
    expect(
      nextThursday.filter((uid) => uid.startsWith('week-')).every((uid) => weekUids.has(uid)),
    ).toBe(true);
    // El de la semana del 26 de octubre es el mismo, porque se llama por su lunes
    expect(thursday).toContain('week-20261026@studiare');
    expect(nextThursday).toContain('week-20261026@studiare');
  });

  it('un salto de línea suelto o un carácter de control no abren líneas nuevas en el .ics', () => {
    const ics = icsOf(
      [
        {
          day: '2026-10-05',
          title: 'x\rBEGIN:VALARM\rACTION:DISPLAY\u0007\u001b',
          description: 'a\rb\nc\r\nd',
        },
      ],
      new Date('2026-10-22T15:00:00.000Z'),
    );
    // Todo CR del archivo es parte de un CRLF y no queda ningún otro carácter de control
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(ics.split('\r\n')).not.toContain('BEGIN:VALARM');
    expect(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(ics).toContain('SUMMARY:x\\nBEGIN:VALARM\\nACTION:DISPLAY');
    expect(ics).toContain('DESCRIPTION:a\\nb\\nc\\nd');
    expect(ics).not.toContain('\u0007');
    expect(ics).not.toContain('\u001b');
  });

  it('dobla una línea larga sin partir caracteres de varios bytes', () => {
    const title = 'ñ'.repeat(120);
    const ics = icsOf([{ day: '2026-10-05', title }], new Date('2026-10-22T15:00:00.000Z'));
    const lines = ics.split('\r\n');
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${title}`);
  });
});

describe('el mes del Calendario rediseñado (D-150)', () => {
  const TZ = 'America/Mexico_City';
  const USER = newId();
  const sessionEnded = (
    at: string,
    kind: 'review' | 'practice' | 'exam' | 'challenge',
    items: number,
    reason: 'completed' | 'abandoned' = 'completed',
  ): AppEvent =>
    createEvent(
      'session_ended',
      { kind, reason, items, correct: Math.floor(items / 2), durationMs: 60_000 * items, xp: 10 },
      { userId: USER, tz: TZ, clock: { now: () => new Date(at) } },
    );

  it('shiftMonth cruza de año hacia adelante y hacia atrás y yearMonthOf lee un día', () => {
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 10, 14)).toEqual({ year: 2027, month: 12 });
    expect(shiftMonth(2026, 10, 0)).toEqual({ year: 2026, month: 10 });
    expect(yearMonthOf('2026-10-24')).toEqual({ year: 2026, month: 10 });
  });

  it('monthBounds da el primero y el último día, con febrero bisiesto', () => {
    expect(monthBounds(2026, 10)).toEqual({ first: '2026-10-01', last: '2026-10-31' });
    expect(monthBounds(2028, 2)).toEqual({ first: '2028-02-01', last: '2028-02-29' });
  });

  it('sessionsByDay agrupa las sesiones por día de estudio y una de madrugada cae en el día anterior', () => {
    // A las 2 a. m. de la Ciudad de México todavía es el día de estudio anterior (corte a las 4)
    const events = [
      sessionEnded('2026-10-24T20:00:00.000Z', 'practice', 20),
      sessionEnded('2026-10-25T08:30:00.000Z', 'exam', 50, 'abandoned'),
      sessionEnded('2026-10-24T23:00:00.000Z', 'review', 12),
      createEvent(
        'xp_awarded',
        { amount: 5, reason: 'card_review', sourceEventId: null },
        { userId: USER, tz: TZ, clock: { now: () => new Date('2026-10-24T20:00:00.000Z') } },
      ),
    ];
    const byDay = sessionsByDay(events);
    expect([...byDay.keys()]).toEqual(['2026-10-24']);
    expect(byDay.get('2026-10-24')?.map((session) => session.kind)).toEqual([
      'practice',
      'exam',
      'review',
    ]);
    expect(byDay.get('2026-10-24')?.[1]).toMatchObject({
      items: 50,
      reason: 'abandoned',
      correct: 25,
      durationMs: 3_000_000,
    });
  });

  it('monthSummary suma lo programado desde hoy, elige el día más cargado y cuenta las sesiones sin las de repaso', () => {
    const forecast = new Map([
      ['2026-10-20', 90],
      ['2026-10-24', 38],
      ['2026-10-27', 44],
      ['2026-10-30', 44],
      ['2026-11-02', 70],
    ]);
    const sessions = sessionsByDay([
      sessionEnded('2026-10-03T20:00:00.000Z', 'practice', 20),
      sessionEnded('2026-10-10T20:00:00.000Z', 'review', 20),
      sessionEnded('2026-10-24T20:00:00.000Z', 'exam', 50),
      sessionEnded('2026-09-30T20:00:00.000Z', 'practice', 20),
    ]);
    const summary = monthSummary({
      year: 2026,
      month: 10,
      today: '2026-10-24',
      forecast,
      forecastEnd: '2026-12-22',
      sessions,
    });
    // El 20 ya pasó y noviembre es otro mes
    expect(summary.scheduled).toBe(38 + 44 + 44);
    // Con empate gana el primero
    expect(summary.busiest).toEqual({ day: '2026-10-27', count: 44 });
    expect(summary.sessionsDone).toBe(2);
    expect(summary.forecastCovers).toBe(true);
  });

  it('monthSummary dice cuando la proyección no alcanza el fin del mes, salvo en un mes ya pasado', () => {
    const base = { today: '2026-10-24', forecast: new Map<string, number>(), sessions: new Map() };
    expect(
      monthSummary({ ...base, year: 2026, month: 12, forecastEnd: '2026-12-22' }),
    ).toMatchObject({ scheduled: 0, busiest: null, sessionsDone: 0, forecastCovers: false });
    expect(monthSummary({ ...base, year: 2026, month: 9, forecastEnd: null }).forecastCovers).toBe(
      true,
    );
    expect(monthSummary({ ...base, year: 2026, month: 10, forecastEnd: null }).forecastCovers).toBe(
      false,
    );
  });

  it('nextBusyDay es el día que sigue con más carga, sin contar hoy ni los días sin carga', () => {
    const forecast = new Map([
      ['2026-10-24', 99],
      ['2026-10-25', 0],
      ['2026-10-26', 30],
      ['2026-10-28', 44],
      ['2026-10-29', 44],
    ]);
    expect(nextBusyDay(forecast, '2026-10-24')).toEqual({ day: '2026-10-28', count: 44 });
    expect(nextBusyDay(forecast, '2026-10-29')).toBeNull();
    expect(nextBusyDay(new Map(), '2026-10-24')).toBeNull();
  });

  it('challengesByDay pone cada reto en el día de estudio en que termina', () => {
    const byDay = challengesByDay(
      [
        { id: 'a', endsAt: '2026-10-25T05:59:00.000Z' },
        { id: 'b', endsAt: '2026-10-25T18:00:00.000Z' },
        { id: 'c', endsAt: '2026-10-25T23:00:00.000Z' },
      ],
      TZ,
    );
    // A las 23:59 del 24 en la Ciudad de México todavía es 24
    expect(byDay.get('2026-10-24')?.map((item) => item.id)).toEqual(['a']);
    expect(byDay.get('2026-10-25')?.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('moveDayByKey recorre la rejilla con flechas, Inicio y Fin, y no hace nada con otras teclas', () => {
    // El 24 de octubre de 2026 es sábado
    expect(moveDayByKey('2026-10-24', 'ArrowLeft')).toBe('2026-10-23');
    expect(moveDayByKey('2026-10-24', 'ArrowRight')).toBe('2026-10-25');
    expect(moveDayByKey('2026-10-24', 'ArrowUp')).toBe('2026-10-17');
    expect(moveDayByKey('2026-10-24', 'ArrowDown')).toBe('2026-10-31');
    expect(moveDayByKey('2026-10-24', 'Home')).toBe('2026-10-19');
    expect(moveDayByKey('2026-10-24', 'End')).toBe('2026-10-25');
    expect(moveDayByKey('2026-10-31', 'ArrowRight')).toBe('2026-11-01');
    expect(moveDayByKey('2026-10-24', 'Enter')).toBeNull();
  });
});
