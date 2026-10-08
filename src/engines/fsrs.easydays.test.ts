import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { FsrsCardStateSchema, type FsrsCardState } from '@/data/schemas/common';
import { easyDayRadius, NO_EASY_DAYS, weekdayOf, type EasyDays } from './easyDays';
import {
  examDeadline,
  FSRS_RATINGS,
  previewReview,
  projectLoad,
  scheduleReview,
  type DayLoad,
  type FsrsRating,
  type QueueCard,
  type SchedulerConfig,
} from './fsrs';
import { createRng } from './random';
import { DAY_MS, studyDayOf } from './studyDay';

// Jueves 1 de octubre de 2026, 9:00 locales. Los domingos caen a 3, 10, 17 y 24 días
const NOW = new Date('2026-10-01T15:00:00.000Z');
const TZ = 'America/Merida';

const base: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: TZ,
  thresholds: DEFAULT_THRESHOLDS.fsrs,
};
const SUN_MIN: EasyDays = { ...NO_EASY_DAYS, sun: 'minimum' };
const SAT_REDUCED: EasyDays = { ...NO_EASY_DAYS, sat: 'reduced' };
const withEasy = (easyDays: EasyDays, extra: Partial<SchedulerConfig> = {}): SchedulerConfig => ({
  ...base,
  ...extra,
  easyDays,
});

const daysBetweenInstants = (from: Date, to: Date) => (to.getTime() - from.getTime()) / DAY_MS;
const dueOf = (state: FsrsCardState) => new Date(state.due);

interface Situation {
  state: FsrsCardState;
  now: Date;
}

/**
 * Tarjetas ya repasadas con Bien en su vencimiento. Cada situación es el estado antes de un repaso
 * y el momento del repaso. Las fechas de inicio se escalonan de un día en un día para cubrir todos
 * los días de la semana. Se arman sin días fáciles, como un alumno que los activa después. Con
 * window solo se guardan los repasos que caen dentro de esa ventana
 */
function situations(options: {
  config: SchedulerConfig;
  firstStart: Date;
  starts: number;
  reviews: number;
  window?: { from: Date; to: Date };
}): Situation[] {
  const { config, firstStart, starts, reviews, window } = options;
  const found: Situation[] = [];
  for (let start = 0; start < starts; start += 1) {
    let state: FsrsCardState | null = null;
    let now = new Date(firstStart.getTime() + start * DAY_MS);
    for (let review = 0; review < reviews; review += 1) {
      const inWindow =
        window === undefined ||
        (now.getTime() >= window.from.getTime() && now.getTime() <= window.to.getTime());
      if (state?.state === 'review' && inWindow) found.push({ state, now });
      state = scheduleReview(state, 'good', now, config).state;
      now = dueOf(state);
    }
  }
  return found;
}

describe('días fáciles en el programador (D-085)', () => {
  // 14 fechas de inicio en enero, 12 repasos cada una
  const all = situations({
    config: base,
    firstStart: new Date('2026-01-01T15:00:00.000Z'),
    starts: 14,
    reviews: 12,
  });

  it('hay suficientes situaciones de repaso para que los barridos signifiquen algo', () => {
    expect(all.length).toBeGreaterThan(80);
  });

  it('ausente o todo normal da exactamente el mismo resultado de siempre', () => {
    const variants: Partial<SchedulerConfig>[] = [
      {},
      { maxIntervalDays: 21 },
      { maxIntervalDays: 21, spacing: { hard: 0.5, good: 1, easy: 1.5 } },
      { examDate: '2026-04-20' },
    ];
    for (const extra of variants) {
      const plain: SchedulerConfig = { ...base, ...extra };
      const explicit: SchedulerConfig = { ...plain, easyDays: NO_EASY_DAYS };
      const undef: SchedulerConfig = { ...plain, easyDays: undefined };
      for (const { state, now } of all) {
        for (const rating of FSRS_RATINGS) {
          const expected = scheduleReview(state, rating, now, plain);
          expect(scheduleReview(state, rating, now, explicit)).toEqual(expected);
          expect(scheduleReview(state, rating, now, undef)).toEqual(expected);
        }
      }
    }
  });

  it('una tarjeta nueva y un día fácil no cambian nada con ningún botón', () => {
    for (const rating of FSRS_RATINGS) {
      expect(scheduleReview(null, rating, NOW, withEasy(SUN_MIN))).toEqual(
        scheduleReview(null, rating, NOW, base),
      );
    }
  });

  it('solo cambian el vencimiento y scheduledDays, nunca la estabilidad ni la dificultad', () => {
    let changed = 0;
    for (const { state, now } of all) {
      for (const rating of FSRS_RATINGS) {
        const plain = scheduleReview(state, rating, now, base);
        const easy = scheduleReview(state, rating, now, withEasy(SUN_MIN));
        const { due: plainDue, scheduledDays: _plainDays, ...plainRest } = plain.state;
        const { due: easyDue, scheduledDays: _easyDays, ...easyRest } = easy.state;
        expect(easyRest).toEqual(plainRest);
        expect(easy.retention).toBe(plain.retention);
        expect(easy.examWindow).toBe(plain.examWindow);
        expect(easy.examCapped).toBe(plain.examCapped);
        if (easyDue !== plainDue) changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(10);
  });

  it('Otra vez y los pasos cortos de aprendizaje nunca se mueven', () => {
    const easyConfig = withEasy({
      ...NO_EASY_DAYS,
      mon: 'minimum',
      tue: 'minimum',
      wed: 'minimum',
    });
    for (const { state, now } of all) {
      expect(scheduleReview(state, 'again', now, easyConfig)).toEqual(
        scheduleReview(state, 'again', now, base),
      );
    }
    // Aprendizaje y reaprendizaje, con minutos de intervalo
    const learning = scheduleReview(null, 'good', NOW, base).state;
    expect(learning.state).toBe('learning');
    expect(scheduleReview(learning, 'good', NOW, easyConfig).state.state).toBe('review');
    expect(scheduleReview(learning, 'again', NOW, easyConfig)).toEqual(
      scheduleReview(learning, 'again', NOW, base),
    );
    const relearning = scheduleReview(all[8]?.state ?? null, 'again', NOW, base).state;
    expect(relearning.state).toBe('relearning');
    expect(scheduleReview(relearning, 'hard', NOW, easyConfig)).toEqual(
      scheduleReview(relearning, 'hard', NOW, base),
    );
  });

  it('un vencimiento en domingo con 3 días o más pasa al sábado o al lunes y lo demás queda igual', () => {
    let sundays = 0;
    let toSaturday = 0;
    let toMonday = 0;
    for (const { state, now } of all) {
      for (const rating of ['hard', 'good', 'easy'] as const) {
        const plain = scheduleReview(state, rating, now, base).state;
        const easy = scheduleReview(state, rating, now, withEasy(SUN_MIN)).state;
        const interval = daysBetweenInstants(now, dueOf(plain));
        const isSunday = weekdayOf(studyDayOf(dueOf(plain), TZ)) === 'sun';
        if (isSunday && easyDayRadius(interval) > 0) {
          sundays += 1;
          // Con sábado y lunes normales los dos quedan a un día, y el desempate parejo elige uno
          const shift = Math.round(daysBetweenInstants(dueOf(plain), dueOf(easy)));
          expect(Math.abs(shift)).toBe(1);
          if (shift === -1) toSaturday += 1;
          else toMonday += 1;
          // scheduledDays se recalcula con el nuevo vencimiento
          expect(easy.scheduledDays).toBe(plain.scheduledDays + shift);
          expect(easy.scheduledDays).toBe(Math.round(daysBetweenInstants(now, dueOf(easy))));
        } else {
          expect(easy).toEqual(plain);
        }
      }
    }
    expect(sundays).toBeGreaterThan(10);
    // El desempate reparte entre el día anterior y el siguiente, no manda todo a uno
    expect(toSaturday).toBeGreaterThan(0);
    expect(toMonday).toBeGreaterThan(0);
  });

  it('convive con el tope de intervalo y los multiplicadores de botón', () => {
    const extra: Partial<SchedulerConfig> = {
      maxIntervalDays: 21,
      spacing: { hard: 0.5, good: 1, easy: 1.5 },
    };
    let moved = 0;
    for (const { state, now } of all) {
      for (const rating of ['hard', 'good', 'easy'] as const) {
        const plain = scheduleReview(state, rating, now, { ...base, ...extra }).state;
        const easy = scheduleReview(state, rating, now, withEasy(SUN_MIN, extra)).state;
        const interval = daysBetweenInstants(now, dueOf(plain));
        const shift = daysBetweenInstants(dueOf(plain), dueOf(easy));
        // El tope y el multiplicador se aplican primero y la ventana se mide sobre su resultado
        expect(Math.abs(shift)).toBeLessThanOrEqual(easyDayRadius(interval));
        if (shift !== 0) {
          moved += 1;
          expect(weekdayOf(studyDayOf(dueOf(easy), TZ))).not.toBe('sun');
        }
      }
    }
    expect(moved).toBeGreaterThan(5);
  });

  describe('vista previa y repaso real', () => {
    it('la vista previa de los cuatro botones es idéntica al repaso con el mismo now', () => {
      const config = withEasy({ ...NO_EASY_DAYS, sat: 'reduced', sun: 'minimum' });
      for (const { state, now } of all) {
        const preview = previewReview(state, now, config);
        for (const rating of FSRS_RATINGS) {
          expect(preview[rating]).toEqual(scheduleReview(state, rating, now, config));
        }
      }
    });

    it('el repaso unos minutos después cae en el mismo día y con los mismos días de intervalo', () => {
      const config = withEasy({ ...NO_EASY_DAYS, sat: 'reduced', sun: 'minimum' });
      let moved = 0;
      for (const { state, now } of all) {
        // La vista previa se calcula al abrir la tarjeta y el repaso real al contestar
        const later = new Date(now.getTime() + 7 * 60 * 1000);
        const preview = previewReview(state, now, config);
        for (const rating of FSRS_RATINGS) {
          const real = scheduleReview(state, rating, later, config);
          expect(studyDayOf(dueOf(real.state), TZ)).toBe(
            studyDayOf(dueOf(preview[rating].state), TZ),
          );
          expect(real.state.scheduledDays).toBe(preview[rating].state.scheduledDays);
          expect(real.state.stability).toBe(preview[rating].state.stability);
          expect(real.state.difficulty).toBe(preview[rating].state.difficulty);
          const plain = scheduleReview(state, rating, later, base);
          if (real.state.due !== plain.state.due) moved += 1;
        }
      }
      expect(moved).toBeGreaterThan(10);
    });
  });

  describe('modo examen', () => {
    // El ENARM el lunes 19 de octubre. El domingo 18 es el último día antes del examen
    const EXAM_DATE = '2026-10-19';
    const examConfig = (easyDays: EasyDays): SchedulerConfig => ({
      ...base,
      maxIntervalDays: 21,
      examDate: EXAM_DATE,
      easyDays,
    });
    const deadline = (examDeadline(examConfig(SUN_MIN)) as Date).getTime();
    // Repasos de las tres semanas previas al examen, de tarjetas con 7 meses de historial
    const nearExam = situations({
      config: { ...base, maxIntervalDays: 21 },
      firstStart: new Date('2026-03-01T15:00:00.000Z'),
      starts: 200,
      reviews: 30,
      window: {
        from: new Date('2026-09-27T00:00:00.000Z'),
        to: new Date('2026-10-18T15:00:00.000Z'),
      },
    });

    it('hay repasos suficientes en la ventana previa al examen', () => {
      expect(nearExam.length).toBeGreaterThan(100);
    });

    it('el recorte al examen sigue mandando y ningún vencimiento llega a pasarse', () => {
      let capped = 0;
      let moved = 0;
      for (const { state, now } of nearExam) {
        for (const rating of ['hard', 'good', 'easy'] as const) {
          const plain = scheduleReview(state, rating, now, { ...examConfig(NO_EASY_DAYS) });
          const easy = scheduleReview(state, rating, now, examConfig(SUN_MIN));
          expect(dueOf(easy.state).getTime()).toBeLessThanOrEqual(deadline);
          expect(easy.examCapped).toBe(plain.examCapped);
          if (plain.examCapped) {
            // Lo que ya se recortaba al examen queda igual, a las 4 a. m. del día del ENARM
            capped += 1;
            expect(easy.state).toEqual(plain.state);
          } else if (easy.state.due !== plain.state.due) {
            moved += 1;
            expect(dueOf(easy.state).getTime()).toBeLessThan(deadline);
          }
        }
      }
      expect(capped).toBeGreaterThan(10);
      expect(moved).toBeGreaterThan(0);
    });

    it('el día del examen no es candidato aunque sábado y domingo sean mínimos', () => {
      const config = examConfig({ ...NO_EASY_DAYS, sat: 'minimum', sun: 'minimum' });
      let tested = 0;
      for (const { state, now } of nearExam) {
        for (const rating of ['hard', 'good', 'easy'] as const) {
          const plain = scheduleReview(state, rating, now, examConfig(NO_EASY_DAYS));
          if (plain.examCapped || studyDayOf(dueOf(plain.state), TZ) !== '2026-10-18') continue;
          const radius = easyDayRadius(daysBetweenInstants(now, dueOf(plain.state)));
          if (radius === 0) continue;
          tested += 1;
          const easy = scheduleReview(state, rating, now, config);
          // Domingo y sábado no sirven y el lunes es el examen. Con radio 1 no hay adónde ir y con
          // radio 2 o más queda el viernes. Nunca el día del ENARM
          expect(dueOf(easy.state).getTime()).toBe(
            dueOf(plain.state).getTime() - (radius === 1 ? 0 : 2 * DAY_MS),
          );
          expect(dueOf(easy.state).getTime()).toBeLessThan(deadline);
        }
      }
      expect(tested).toBeGreaterThan(0);
    });

    it('con la fecha del ENARM ya pasada los días fáciles siguen funcionando', () => {
      const past: Partial<SchedulerConfig> = { examDate: '2025-01-01' };
      let moved = 0;
      for (const { state, now } of all) {
        const without = scheduleReview(state, 'good', now, withEasy(SUN_MIN));
        const withPast = scheduleReview(state, 'good', now, withEasy(SUN_MIN, past));
        expect(withPast.state.due).toBe(without.state.due);
        if (without.state.due !== scheduleReview(state, 'good', now, base).state.due) moved += 1;
      }
      expect(moved).toBeGreaterThan(0);
    });
  });
});

describe('simulación de carga futura con días fáciles (projectLoad)', () => {
  // Tope de intervalo de 21 días, el valor por defecto del producto (D-064). Sin tope FSRS puro
  // manda las tarjetas maduras a meses de distancia y 600 tarjetas apenas dan 400 repasos en 60
  // días, así que el horizonte no mediría nada. Con el tope se ven unos 30 repasos por día
  const simBase: SchedulerConfig = {
    ...base,
    maxIntervalDays: 21,
    thresholds: { ...DEFAULT_THRESHOLDS.fsrs, reviewsPerDay: 200 },
  };
  const HORIZON = 60;
  // Las fechas que ya estaban guardadas antes de activar los días fáciles no se mueven, solo las
  // que se calculan después. Por eso el efecto en un día de la semana crece con las semanas
  const SECOND_WEEK = 7;
  // El intervalo máximo es de 21 días, así que a partir de ahí toda tarjeta ya se reprogramó
  const SETTLED = 21;

  /** 600 tarjetas con un historial de repasos reales y el vencimiento repartido en el futuro */
  function simulationCards(): QueueCard[] {
    const rng = createRng('easy-days-simulation');
    const cards: QueueCard[] = [];
    for (let index = 0; index < 600; index += 1) {
      let at = NOW.getTime() - rng.int(5, 200) * DAY_MS - rng.int(0, 86_399) * 1000;
      let state: FsrsCardState | null = null;
      for (let step = 0; step < 60; step += 1) {
        const roll = rng.next();
        const rating: FsrsRating =
          roll < 0.05 ? 'again' : roll < 0.15 ? 'hard' : roll < 0.9 ? 'good' : 'easy';
        state = scheduleReview(state, rating, new Date(at), simBase).state;
        if (dueOf(state).getTime() > NOW.getTime()) break;
        at = dueOf(state).getTime();
      }
      cards.push({
        cardId: `card-${index}`,
        noteId: `note-${index}`,
        state: FsrsCardStateSchema.parse(state),
      });
    }
    return cards;
  }

  const cards = simulationCards();
  const plainLoad = projectLoad({ cards, now: NOW, config: simBase, days: HORIZON });

  const total = (load: DayLoad[]) => load.reduce((sum, day) => sum + day.reviews, 0);
  const peak = (load: DayLoad[]) => Math.max(...load.map((day) => day.reviews));
  const weekdayTotal = (load: DayLoad[], weekday: string, fromDay: number) =>
    load
      .filter((day, index) => index >= fromDay && weekdayOf(day.day) === weekday)
      .reduce((sum, day) => sum + day.reviews, 0);

  // Factor máximo del pico con días fáciles contra el pico sin ellos. El diseño manda el vencimiento
  // de un día fácil al candidato aceptable más cercano y, con la misma distancia, desempata por un
  // hash parejo de la tarjeta, de modo que el domingo se reparte entre sábado y lunes y no se apila
  // en uno solo. Medido en 8 semillas distintas, 1.4 se sostiene con el domingo en minimum y con el
  // sábado en reduced. Sigue muy por debajo del límite diario de 200
  const PEAK_FACTOR = 1.4;

  it('las 600 tarjetas son estados válidos con vencimientos repartidos', () => {
    expect(cards).toHaveLength(600);
    expect(cards.every((card) => card.state?.state === 'review')).toBe(true);
    const perDay = new Map<string, number>();
    for (const card of cards) {
      const day = studyDayOf(dueOf(card.state as FsrsCardState), TZ);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect(perDay.size).toBeGreaterThan(20);
    expect(Math.max(...perDay.values())).toBeLessThan(600 * 0.15);
    // Sin días fáciles la carga base ronda decenas de repasos por día, lejos del límite de 200
    expect(total(plainLoad)).toBeGreaterThan(1000);
    expect(peak(plainLoad)).toBeLessThan(200);
  });

  it('domingo en minimum deja los domingos casi vacíos sin cambiar el total ni pasar del límite', () => {
    const load = projectLoad({
      cards,
      now: NOW,
      config: withEasy(SUN_MIN, simBase),
      days: HORIZON,
    });
    expect(load).toHaveLength(HORIZON);

    // A partir de la segunda semana los domingos tienen menos de la mitad de los repasos. Todavía
    // incluye vencimientos viejos que se guardaron antes de activar la función
    const secondWeek = weekdayTotal(load, 'sun', SECOND_WEEK);
    const secondWeekBase = weekdayTotal(plainLoad, 'sun', SECOND_WEEK);
    expect(secondWeekBase).toBeGreaterThan(100);
    expect(secondWeek).toBeLessThan(secondWeekBase * 0.5);

    // Ya con todas las tarjetas reprogramadas, los domingos quedan prácticamente vacíos
    const settled = weekdayTotal(load, 'sun', SETTLED);
    expect(settled).toBeLessThan(weekdayTotal(plainLoad, 'sun', SETTLED) * 0.1);

    // El trabajo se corre a otros días, no desaparece. El total cambia menos de 10 por ciento
    expect(Math.abs(total(load) / total(plainLoad) - 1)).toBeLessThan(0.1);

    // Ningún día pasa del límite diario ni del tope de apilar un día sobre su vecino
    expect(peak(load)).toBeLessThanOrEqual(simBase.thresholds.reviewsPerDay);
    expect(peak(load)).toBeLessThanOrEqual(peak(plainLoad) * PEAK_FACTOR);
  });

  it('sábado en reduced baja los sábados a cerca de la mitad, sin vaciarlos', () => {
    const load = projectLoad({
      cards,
      now: NOW,
      config: withEasy(SAT_REDUCED, simBase),
      days: HORIZON,
    });
    // Medido en 6 simulaciones con semillas distintas, los sábados desde la segunda semana quedan
    // en 0.53 a 0.57 de la carga base y desde el día 21 en 0.37 a 0.46. Con el tiempo baja de la
    // mitad porque cada repaso vuelve a sortear si el sábado se acepta, y una tarjeta que sale
    // hacia el viernes con un intervalo casi fijo de 7, 14 o 21 días no regresa al sábado
    const ratio =
      weekdayTotal(load, 'sat', SECOND_WEEK) / weekdayTotal(plainLoad, 'sat', SECOND_WEEK);
    expect(ratio).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThan(0.75);
    const settled = weekdayTotal(load, 'sat', SETTLED) / weekdayTotal(plainLoad, 'sat', SETTLED);
    expect(settled).toBeGreaterThan(0.2);
    expect(settled).toBeLessThan(0.6);

    expect(Math.abs(total(load) / total(plainLoad) - 1)).toBeLessThan(0.1);
    expect(peak(load)).toBeLessThanOrEqual(simBase.thresholds.reviewsPerDay);
    expect(peak(load)).toBeLessThanOrEqual(peak(plainLoad) * PEAK_FACTOR);
  });

  it('los demás días de la semana siguen recibiendo carga con el domingo en minimum', () => {
    const load = projectLoad({
      cards,
      now: NOW,
      config: withEasy(SUN_MIN, simBase),
      days: HORIZON,
    });
    for (const weekday of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']) {
      expect(weekdayTotal(load, weekday, SETTLED)).toBeGreaterThan(0);
    }
    // El sábado y el lunes se reparten lo que sale del domingo, por el desempate parejo
    expect(weekdayTotal(load, 'sat', SETTLED)).toBeGreaterThan(
      weekdayTotal(plainLoad, 'sat', SETTLED) * 1.15,
    );
    expect(weekdayTotal(load, 'mon', SETTLED)).toBeGreaterThan(
      weekdayTotal(plainLoad, 'mon', SETTLED) * 1.15,
    );
    expect(weekdayTotal(load, 'sun', SETTLED)).toBeLessThan(
      weekdayTotal(plainLoad, 'sun', SETTLED),
    );
  });

  it('es reproducible, la misma proyección da exactamente la misma carga', () => {
    const config = withEasy({ ...NO_EASY_DAYS, sat: 'reduced', sun: 'minimum' }, simBase);
    const first = projectLoad({ cards, now: NOW, config, days: HORIZON });
    expect(projectLoad({ cards, now: NOW, config, days: HORIZON })).toEqual(first);
  });
});
