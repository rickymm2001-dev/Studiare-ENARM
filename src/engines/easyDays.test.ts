import { describe, expect, it } from 'vitest';
import {
  applyEasyDays,
  easyDayRadius,
  EASY_DAY_LEVELS,
  fnv1a32,
  hasEasyDays,
  isDayAcceptable,
  NO_EASY_DAYS,
  stableHash,
  WEEKDAY_KEYS,
  weekdayOf,
  type EasyDayLevel,
  type EasyDays,
  type EasyDaysInput,
  type WeekdayKey,
} from './easyDays';
import { createRng } from './random';
import {
  addDays,
  DAY_MS,
  daysBetween,
  studyDayEnd,
  studyDayOf,
  studyDayStart,
  weekStartOf,
} from './studyDay';

const TZ = 'America/Merida';
// Jueves 1 de octubre de 2026, 9:00 locales. Los domingos caen a 3, 10, 17, 24 y 31 días
const NOW = new Date('2026-10-01T15:00:00.000Z');

const levels = (overrides: Partial<Record<WeekdayKey, EasyDayLevel>>): EasyDays => ({
  ...NO_EASY_DAYS,
  ...overrides,
});
const SUN_MIN = levels({ sun: 'minimum' });
const dueIn = (days: number, from: Date = NOW) => new Date(from.getTime() + days * DAY_MS);
const run = (due: Date, easyDays: EasyDays, extra: Partial<EasyDaysInput> = {}) =>
  applyEasyDays({
    due,
    now: NOW,
    timeZone: TZ,
    easyDays,
    seed: 'semilla',
    deadline: null,
    ...extra,
  });
const seeds = (count: number) => Array.from({ length: count }, (_, index) => `semilla-${index}`);

describe('weekdayOf', () => {
  it('da el día de la semana de fechas conocidas', () => {
    expect(weekdayOf('2026-10-01')).toBe('thu');
    expect(weekdayOf('2026-10-04')).toBe('sun');
    expect(weekdayOf('2026-10-05')).toBe('mon');
    expect(weekdayOf('2024-02-29')).toBe('thu');
    expect(weekdayOf('2000-01-01')).toBe('sat');
    expect(weekdayOf('1999-12-31')).toBe('fri');
  });

  it('recorre los siete días en orden y vuelve a empezar', () => {
    for (let offset = 0; offset < 21; offset += 1) {
      expect(weekdayOf(addDays('2026-10-05', offset))).toBe(WEEKDAY_KEYS[offset % 7]);
    }
  });

  it('coincide con el lunes que da weekStartOf', () => {
    for (let offset = 0; offset < 60; offset += 1) {
      expect(weekdayOf(weekStartOf(addDays('2026-09-01', offset)))).toBe('mon');
    }
  });

  it('rechaza lo que no es una fecha del calendario', () => {
    for (const bad of [
      '',
      'hoy',
      '2026-1-5',
      '2026-13-01',
      '2026-02-30',
      '2026-00-10',
      '2026-04-31',
    ]) {
      expect(() => weekdayOf(bad)).toThrow(RangeError);
    }
  });
});

describe('hash estable', () => {
  it('FNV-1a de 32 bits da los vectores de referencia publicados', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('procesa los bytes UTF-8, así que los acentos no dependen del motor de JavaScript', () => {
    // é son los bytes 0xc3 0xa9
    let expected = 0x811c9dc5;
    for (const byte of [0xc3, 0xa9]) expected = Math.imul(expected ^ byte, 0x01000193) >>> 0;
    expect(fnv1a32('é')).toBe(expected);
  });

  it('el hash final es determinista, sin signo y cambia con cualquier carácter', () => {
    expect(stableHash('semilla|2026-10-04')).toBe(stableHash('semilla|2026-10-04'));
    for (const text of ['', 'a', 'semilla|2026-10-04', 'x'.repeat(500)]) {
      const hash = stableHash(text);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
    expect(new Set(seeds(400).map((seed) => stableHash(seed))).size).toBe(400);
    expect(stableHash('semilla|2026-10-04')).not.toBe(stableHash('semilla|2026-10-05'));
  });

  it('queda fijo en el tiempo, porque cambiarlo movería las fechas que se vayan a calcular', () => {
    expect(stableHash('')).toBe(2872998923);
    expect(stableHash('semilla|2026-10-04')).toBe(3175957658);
    expect(stableHash('abc|2026-10-04')).toBe(267015132);
    expect(stableHash('abc|2026-10-05')).toBe(406380223);
  });

  it('la mezcla final evita que dos días seguidos alternen siempre', () => {
    const sameParity = (hash: (text: string) => number) =>
      seeds(400).filter((seed) => hash(`${seed}|2026-10-04`) % 2 === hash(`${seed}|2026-10-05`) % 2)
        .length;
    // El último bit de FNV-1a solo es la paridad de los bits bajos de los caracteres. Las fechas
    // seguidas difieren en un dígito, así que sin la mezcla nunca coinciden
    expect(sameParity(fnv1a32)).toBe(0);
    const share = sameParity(stableHash) / 400;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });
});

describe('radio de la ventana', () => {
  it('sigue la tabla de D-085 y redondea el intervalo', () => {
    const table: [number, number][] = [
      [-5, 0],
      [0, 0],
      [0.5, 0],
      [1, 0],
      [2, 0],
      [2.4, 0],
      [2.5, 1],
      [3, 1],
      [6.4, 1],
      [6.5, 2],
      [7, 2],
      [19.4, 2],
      [19.5, 3],
      [20, 3],
      [59.4, 3],
      [59.5, 5],
      [60, 5],
      [400, 5],
    ];
    for (const [days, radius] of table) expect(easyDayRadius(days), `${days} días`).toBe(radius);
  });

  it('un intervalo que no es número no mueve nada', () => {
    expect(easyDayRadius(Number.NaN)).toBe(0);
  });
});

describe('hasEasyDays', () => {
  it('ausente o todo normal cuenta como sin días fáciles', () => {
    expect(hasEasyDays(undefined)).toBe(false);
    expect(hasEasyDays(NO_EASY_DAYS)).toBe(false);
    expect(hasEasyDays(levels({ wed: 'reduced' }))).toBe(true);
    expect(hasEasyDays(levels({ sun: 'minimum' }))).toBe(true);
  });
});

describe('aceptabilidad de un día', () => {
  it('normal siempre y minimum nunca', () => {
    for (const seed of seeds(50)) {
      expect(isDayAcceptable('normal', '2026-10-04', seed)).toBe(true);
      expect(isDayAcceptable('minimum', '2026-10-04', seed)).toBe(false);
    }
  });

  it('reduced deja pasar más o menos la mitad de 400 semillas', () => {
    const accepted = seeds(400).filter((seed) => isDayAcceptable('reduced', '2026-10-04', seed));
    expect(accepted.length / 400).toBeGreaterThan(0.4);
    expect(accepted.length / 400).toBeLessThan(0.6);
  });

  it('reduced también reparte parejo entre 400 días distintos con la misma semilla', () => {
    const accepted = Array.from({ length: 400 }, (_, index) => addDays('2026-01-01', index)).filter(
      (day) => isDayAcceptable('reduced', day, 'una-semilla'),
    );
    expect(accepted.length / 400).toBeGreaterThan(0.4);
    expect(accepted.length / 400).toBeLessThan(0.6);
  });

  it('con la misma semilla y el mismo día responde siempre igual', () => {
    const first = isDayAcceptable('reduced', '2026-10-11', 'abc');
    for (let repeat = 0; repeat < 5; repeat += 1) {
      expect(isDayAcceptable('reduced', '2026-10-11', 'abc')).toBe(first);
    }
  });
});

describe('applyEasyDays', () => {
  it('con todo normal no cambia nada, sea cual sea el intervalo', () => {
    const allNormal: EasyDays = { ...NO_EASY_DAYS };
    for (const days of [0, 0.5, 1, 2, 3, 4.2, 7, 20, 45, 60, 120]) {
      const due = dueIn(days);
      expect(run(due, NO_EASY_DAYS).toISOString()).toBe(due.toISOString());
      expect(run(due, allNormal).toISOString()).toBe(due.toISOString());
    }
  });

  it('minimum esquiva ese día cuando hay un normal en la ventana', () => {
    // 3, 10, 17, 24 y 66 días desde el jueves son domingo, con radios 1, 2, 2, 3 y 5
    for (const days of [3, 10, 17, 24, 66]) {
      const due = dueIn(days);
      expect(weekdayOf(studyDayOf(due, TZ))).toBe('sun');
      const moved = run(due, SUN_MIN);
      // Con la misma distancia gana el día anterior. Conserva la hora, 9:00 locales
      expect(moved.toISOString(), `${days} días`).toBe(dueIn(days - 1).toISOString());
      expect(weekdayOf(studyDayOf(moved, TZ))).toBe('sat');
    }
  });

  it('con la misma distancia gana el día anterior y, si no sirve, el siguiente', () => {
    const due = dueIn(3);
    expect(run(due, SUN_MIN).toISOString()).toBe(dueIn(2).toISOString());
    // El sábado tampoco sirve. El lunes está a la misma distancia
    expect(run(due, levels({ sat: 'minimum', sun: 'minimum' })).toISOString()).toBe(
      dueIn(4).toISOString(),
    );
  });

  it('elige el candidato aceptable más cercano al objetivo', () => {
    const due = dueIn(10);
    // Sábado, domingo y lunes fuera. A distancia 2 el viernes gana al martes
    expect(run(due, levels({ sat: 'minimum', sun: 'minimum', mon: 'minimum' })).toISOString()).toBe(
      dueIn(8).toISOString(),
    );
    // Con el viernes también fuera, queda el martes
    expect(
      run(
        due,
        levels({ fri: 'minimum', sat: 'minimum', sun: 'minimum', mon: 'minimum' }),
      ).toISOString(),
    ).toBe(dueIn(12).toISOString());
  });

  it('si el día objetivo es aceptable no se mueve', () => {
    // De 3 a 9 días caen domingo a miércoles. Solo el domingo cambia
    for (let days = 3; days <= 9; days += 1) {
      const due = dueIn(days);
      const same = run(due, SUN_MIN).getTime() === due.getTime();
      expect(same, `${days} días`).toBe(days !== 3);
    }
  });

  it('si ningún candidato es aceptable no se mueve', () => {
    const due = dueIn(3);
    expect(run(due, levels({ sat: 'minimum', sun: 'minimum', mon: 'minimum' })).getTime()).toBe(
      due.getTime(),
    );
    const allMinimum = levels(Object.fromEntries(WEEKDAY_KEYS.map((key) => [key, 'minimum'])));
    for (const days of [3, 10, 30, 100]) {
      expect(run(dueIn(days), allMinimum).getTime()).toBe(dueIn(days).getTime());
    }
  });

  it('no toca intervalos menores de 3 días', () => {
    // Desde el viernes, 2 días caen en domingo
    const friday = new Date('2026-10-02T15:00:00.000Z');
    for (const days of [0, 10 / (24 * 60), 1, 2, 2.4]) {
      const due = dueIn(days, friday);
      const out = applyEasyDays({
        due,
        now: friday,
        timeZone: TZ,
        easyDays: SUN_MIN,
        seed: 'semilla',
        deadline: null,
      });
      expect(out.getTime(), `${days} días`).toBe(due.getTime());
    }
    // A 2.5 días ya redondea a 3 y se mueve
    const due = dueIn(2.5, friday);
    expect(weekdayOf(studyDayOf(due, TZ))).toBe('sun');
    const out = applyEasyDays({
      due,
      now: friday,
      timeZone: TZ,
      easyDays: SUN_MIN,
      seed: 'semilla',
      deadline: null,
    });
    expect(out.toISOString()).toBe(dueIn(1.5, friday).toISOString());
  });

  it('reduced deja pasar aproximadamente la mitad de 400 semillas y el resto sale hacia el sábado', () => {
    const due = dueIn(3);
    const easyDays = levels({ sun: 'reduced' });
    const outcomes = seeds(400).map((seed) => run(due, easyDays, { seed }));
    const kept = outcomes.filter((out) => out.getTime() === due.getTime());
    expect(kept.length / 400).toBeGreaterThan(0.4);
    expect(kept.length / 400).toBeLessThan(0.6);
    const moved = outcomes.filter((out) => out.getTime() !== due.getTime());
    expect(moved.every((out) => out.getTime() === dueIn(2).getTime())).toBe(true);
  });

  it('con sábado reduced y domingo minimum, el domingo sale al sábado o al lunes según la semilla', () => {
    const due = dueIn(3);
    const easyDays = levels({ sat: 'reduced', sun: 'minimum' });
    const days = new Set<number>();
    let saturdays = 0;
    for (const seed of seeds(400)) {
      const out = run(due, easyDays, { seed });
      const offset = Math.round((out.getTime() - NOW.getTime()) / DAY_MS);
      days.add(offset);
      if (offset === 2) saturdays += 1;
    }
    expect([...days].sort((a, b) => a - b)).toEqual([2, 4]);
    expect(saturdays / 400).toBeGreaterThan(0.4);
    expect(saturdays / 400).toBeLessThan(0.6);
  });

  it('es determinista, con la misma entrada da siempre la misma fecha', () => {
    const easyDays = levels({ sat: 'reduced', sun: 'reduced' });
    for (const seed of seeds(30)) {
      const first = run(dueIn(10), easyDays, { seed });
      for (let repeat = 0; repeat < 3; repeat += 1) {
        expect(run(dueIn(10), easyDays, { seed }).getTime()).toBe(first.getTime());
      }
    }
  });

  describe('examen', () => {
    it('no pasa del día del examen, que queda excluido como candidato', () => {
      const due = dueIn(3);
      const satSunMin = levels({ sat: 'minimum', sun: 'minimum' });
      // Sin examen el domingo sale al lunes
      expect(run(due, satSunMin).toISOString()).toBe(dueIn(4).toISOString());
      // Con el examen el lunes, ese día no cuenta, y el sábado tampoco sirve, así que se queda
      const deadline = studyDayStart('2026-10-05', TZ);
      expect(run(due, satSunMin, { deadline }).getTime()).toBe(due.getTime());
      // Con el examen el martes, el lunes sí es candidato
      const later = studyDayStart('2026-10-06', TZ);
      expect(run(due, satSunMin, { deadline: later }).toISOString()).toBe(dueIn(4).toISOString());
    });

    it('con ventana de 2 días tampoco cruza al examen', () => {
      const due = dueIn(10);
      const easyDays = levels({ fri: 'minimum', sat: 'minimum', sun: 'minimum' });
      // Lunes a distancia 1. Con el examen el lunes, el martes a distancia 2 también queda fuera
      expect(run(due, easyDays).toISOString()).toBe(dueIn(11).toISOString());
      const deadline = studyDayStart('2026-10-12', TZ);
      expect(run(due, easyDays, { deadline }).getTime()).toBe(due.getTime());
    });

    it('un vencimiento que ya cae en el examen o después no se negocia', () => {
      const deadline = studyDayStart('2026-10-04', TZ);
      for (const days of [3, 4, 5, 10]) {
        const due = dueIn(days);
        expect(run(due, SUN_MIN, { deadline }).getTime()).toBe(due.getTime());
      }
    });

    it('se aparta del domingo hacia el día anterior aunque el examen esté el lunes', () => {
      const deadline = studyDayStart('2026-10-05', TZ);
      expect(run(dueIn(3), SUN_MIN, { deadline }).toISOString()).toBe(dueIn(2).toISOString());
    });
  });

  describe('día de estudio y horario de verano', () => {
    it('trabaja con el día de estudio y conserva la hora relativa desde las 4 a. m.', () => {
      // 3:00 a. m. del lunes cuenta como domingo para el día de estudio
      const now = new Date('2026-10-02T21:00:00.000Z');
      const due = new Date('2026-10-05T09:00:00.000Z');
      expect(studyDayOf(due, TZ)).toBe('2026-10-04');
      const out = applyEasyDays({
        due,
        now,
        timeZone: TZ,
        easyDays: SUN_MIN,
        seed: 'semilla',
        deadline: null,
      });
      // Sábado de estudio más 23 horas, que es el domingo a las 3:00 a. m. locales
      expect(out.toISOString()).toBe('2026-10-04T09:00:00.000Z');
      expect(studyDayOf(out, TZ)).toBe('2026-10-03');
    });

    it('conserva la hora local aunque el domingo tenga otro largo por el cambio de horario', () => {
      const tz = 'America/New_York';
      // El horario de verano termina el domingo 1 de noviembre de 2026
      const now = new Date('2026-10-28T15:00:00.000Z');
      const due = new Date('2026-11-01T16:00:00.000Z');
      expect(studyDayOf(due, tz)).toBe('2026-11-01');
      const out = applyEasyDays({
        due,
        now,
        timeZone: tz,
        easyDays: SUN_MIN,
        seed: 'semilla',
        deadline: null,
      });
      // Siguen siendo las 11:00 locales, ahora del sábado, aún en horario de verano
      expect(out.toISOString()).toBe('2026-10-31T15:00:00.000Z');
    });

    it('un día de 23 horas no empuja el vencimiento a otro día de estudio', () => {
      const tz = 'America/New_York';
      // El horario de verano empieza el domingo 8 de marzo de 2026. El sábado 7 de estudio dura 23 h
      const now = new Date('2026-03-03T15:00:00.000Z');
      // 3:30 a. m. del lunes 9 de marzo es la hora 23.5 del domingo de estudio
      const due = new Date('2026-03-09T07:30:00.000Z');
      expect(studyDayOf(due, tz)).toBe('2026-03-08');
      const out = applyEasyDays({
        due,
        now,
        timeZone: tz,
        easyDays: SUN_MIN,
        seed: 'semilla',
        deadline: null,
      });
      // Sumar 23.5 horas al inicio del sábado ya sería el domingo. Se queda en el último instante
      expect(out.getTime()).toBe(studyDayEnd('2026-03-07', tz).getTime() - 1);
      expect(out.getTime()).toBeLessThan(studyDayStart('2026-03-08', tz).getTime());
    });

    it('la hora de más del cambio de horario de otoño no lo saca del día de destino', () => {
      const tz = 'America/New_York';
      const now = new Date('2026-10-28T15:00:00.000Z');
      // studyDayOf corta el domingo 1 de noviembre una hora antes que studyDayStart, así que a las
      // 3:30 a. m. ya es domingo aunque el domingo de estudio empiece a las 4:00 a. m.
      const due = new Date('2026-11-01T08:30:00.000Z');
      expect(studyDayOf(due, tz)).toBe('2026-11-01');
      expect(due.getTime()).toBeLessThan(studyDayStart('2026-11-01', tz).getTime());
      const out = applyEasyDays({
        due,
        now,
        timeZone: tz,
        easyDays: SUN_MIN,
        seed: 'semilla',
        deadline: null,
      });
      // Cae en el primer instante del sábado en lugar de colarse al viernes
      expect(out.getTime()).toBe(studyDayStart('2026-10-31', tz).getTime());
    });
  });

  it('cumple los invariantes en un barrido de intervalos, horas, zonas y configuraciones', () => {
    const rng = createRng('easy-days-sweep');
    let moved = 0;
    let unchanged = 0;
    for (const timeZone of ['America/Merida', 'America/New_York']) {
      for (let index = 0; index < 4000; index += 1) {
        // Cubre el fin del horario de verano de Nueva York, el 1 de noviembre
        const now = new Date(Date.UTC(2026, 9, 15) + rng.int(0, 30 * 24 * 60) * 60_000);
        const due = new Date(now.getTime() + Math.round(rng.next() * 100 * DAY_MS));
        const easyDays = Object.fromEntries(
          WEEKDAY_KEYS.map((key) => [key, rng.pick(EASY_DAY_LEVELS)]),
        ) as EasyDays;
        const seed = `s${rng.int(0, 999)}`;
        const today = studyDayOf(now, timeZone);
        const deadline = rng.chance(0.5)
          ? studyDayStart(addDays(today, rng.int(1, 120)), timeZone)
          : null;
        const deadlineDay = deadline === null ? null : studyDayOf(deadline, timeZone);

        const out = applyEasyDays({ due, now, timeZone, easyDays, seed, deadline });

        // Oráculo independiente. Orden de prueba 1 antes, 1 después, 2 antes, 2 después
        const radius = easyDayRadius((due.getTime() - now.getTime()) / DAY_MS);
        const target = studyDayOf(due, timeZone);
        const acceptable = (day: string) => isDayAcceptable(easyDays[weekdayOf(day)], day, seed);
        const usable = (day: string) =>
          day > today && (deadlineDay === null || day < deadlineDay) && acceptable(day);
        // Misma hora relativa desde el inicio del día de estudio, sin salirse del día de destino
        const shifted = (day: string) => {
          const first = studyDayStart(day, timeZone).getTime();
          const last = studyDayEnd(day, timeZone).getTime() - 1;
          const offset = due.getTime() - studyDayStart(target, timeZone).getTime();
          return Math.min(Math.max(first + offset, first), last);
        };
        const future = (day: string) =>
          shifted(day) > now.getTime() && (deadline === null || shifted(day) < deadline.getTime());
        let expectedDay: string | null = null;
        const pastExam = deadlineDay !== null && target >= deadlineDay;
        if (radius > 0 && !pastExam && !acceptable(target)) {
          for (let distance = 1; distance <= radius && expectedDay === null; distance += 1) {
            expectedDay =
              [addDays(target, -distance), addDays(target, distance)].find(
                (day) => usable(day) && future(day),
              ) ?? null;
          }
        }

        if (expectedDay === null) {
          expect(out.getTime()).toBe(due.getTime());
          unchanged += 1;
          continue;
        }
        moved += 1;
        expect(out.getTime()).toBe(shifted(expectedDay));
        // Dentro del día de estudio elegido, a no más de r días del objetivo
        expect(out.getTime()).toBeGreaterThanOrEqual(
          studyDayStart(expectedDay, timeZone).getTime(),
        );
        expect(out.getTime()).toBeLessThan(studyDayEnd(expectedDay, timeZone).getTime());
        expect(Math.abs(daysBetween(target, expectedDay))).toBeLessThanOrEqual(radius);
        // Nunca a hoy ni al pasado
        expect(expectedDay > today).toBe(true);
        expect(out.getTime()).toBeGreaterThan(now.getTime());
        // Nunca al examen ni después
        if (deadline) expect(out.getTime()).toBeLessThan(deadline.getTime());
        // Aterriza en un día que el alumno aceptó
        expect(acceptable(expectedDay)).toBe(true);
      }
    }
    // El barrido tiene que ejercitar los dos caminos
    expect(moved).toBeGreaterThan(1000);
    expect(unchanged).toBeGreaterThan(1000);
  });
});
