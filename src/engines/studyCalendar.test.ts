import { describe, expect, it } from 'vitest';
import {
  FINAL_SIMULATOR_SUNDAYS,
  icsOf,
  monthGrid,
  planEvents,
  studyWeeks,
  weekdayIndex,
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
    expect(events.at(-1)).toEqual({ day: '2026-12-13', title: 'ENARM' });
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

  it('dobla una línea larga sin partir caracteres de varios bytes', () => {
    const title = 'ñ'.repeat(120);
    const ics = icsOf([{ day: '2026-10-05', title }], new Date('2026-10-22T15:00:00.000Z'));
    const lines = ics.split('\r\n');
    expect(lines.every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${title}`);
  });
});
