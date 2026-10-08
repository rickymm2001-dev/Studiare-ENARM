import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import type { FsrsCardState } from '@/data/schemas/common';
import {
  newCardState,
  projectLoad,
  scheduleReview,
  type QueueCard,
  type SchedulerConfig,
} from './fsrs';
import {
  DEFAULT_MAX_NEW,
  estimateCardTimes,
  suggestNewPerDay,
  type NewPerDayRules,
  type ReviewTimeSample,
  type TimeEstimate,
  type TimeRules,
} from './dailyLoad';
import { studyDayOf } from './studyDay';

const NOW = new Date('2026-10-08T15:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const config: SchedulerConfig = {
  desiredRetention: 0.9,
  examDate: null,
  timeZone: 'America/Merida',
  thresholds: { ...DEFAULT_THRESHOLDS.fsrs, newCardsPerDay: 20, reviewsPerDay: 200 },
};

// Estimación de tiempos

const TIME_RULES: TimeRules = {
  minReviewsToMeasure: 30,
  referenceSecondsPerReview: 8,
  referenceSecondsPerNew: 25,
  capSeconds: 60,
};

const sample = (totalSeconds: number, isNew = false): ReviewTimeSample => ({
  msToReveal: totalSeconds * 600,
  msToRate: totalSeconds * 400,
  isNew,
});
const samples = (count: number, totalSeconds: number, isNew = false): ReviewTimeSample[] =>
  Array.from({ length: count }, () => sample(totalSeconds, isNew));

describe('estimateCardTimes', () => {
  it('con pocas muestras usa la referencia y lo dice', () => {
    const result = estimateCardTimes(samples(29, 3), TIME_RULES);
    expect(result).toEqual({
      secondsPerReview: 8,
      secondsPerNew: 25,
      measured: false,
      reviews: 29,
    });
  });

  it('sin muestras usa la referencia, aunque no se pida ningún mínimo', () => {
    const empty = estimateCardTimes([], TIME_RULES);
    expect(empty).toEqual({ secondsPerReview: 8, secondsPerNew: 25, measured: false, reviews: 0 });
    expect(estimateCardTimes([], { ...TIME_RULES, minReviewsToMeasure: 0 }).measured).toBe(false);
  });

  it('con suficientes repasos usa la mediana propia', () => {
    const result = estimateCardTimes(samples(30, 5), TIME_RULES);
    expect(result).toMatchObject({ secondsPerReview: 5, measured: true, reviews: 30 });
    // Sin 20 nuevas medidas, las nuevas siguen con la referencia
    expect(result.secondsPerNew).toBe(25);
  });

  it('suma lo que tardó en ver la respuesta y en calificar', () => {
    const only = [{ msToReveal: 4000, msToRate: 1500, isNew: false }];
    const result = estimateCardTimes(only, { ...TIME_RULES, minReviewsToMeasure: 1 });
    expect(result.secondsPerReview).toBeCloseTo(5.5, 10);
  });

  it('una pausa larga no distorsiona la mediana y queda recortada al tope', () => {
    // 30 repasos de 5 segundos y 6 pausas de 10 minutos, como alguien que dejó la tarjeta abierta
    const pauses = Array.from({ length: 6 }, () => sample(600));
    const result = estimateCardTimes([...samples(30, 5), ...pauses], TIME_RULES);
    expect(result.secondsPerReview).toBe(5);
    expect(result.reviews).toBe(36);
    // Aun si la mayoría fueran pausas, ninguna muestra pasa del tope
    const mostlyPauses = estimateCardTimes([...samples(5, 5), ...samples(30, 900)], TIME_RULES);
    expect(mostlyPauses.secondsPerReview).toBe(60);
  });

  it('con una cantidad par de muestras promedia las dos del medio', () => {
    const four = [4, 10, 6, 8].map((seconds) => sample(seconds));
    const result = estimateCardTimes(four, { ...TIME_RULES, minReviewsToMeasure: 4 });
    expect(result.secondsPerReview).toBe(7);
  });

  it('las nuevas usan su mediana solo desde 20 muestras', () => {
    const base = samples(30, 5);
    const nineteen = estimateCardTimes([...base, ...samples(19, 12, true)], TIME_RULES);
    expect(nineteen.secondsPerNew).toBe(25);
    const twenty = estimateCardTimes([...base, ...samples(20, 12, true)], TIME_RULES);
    expect(twenty.secondsPerNew).toBe(12);
    // Las nuevas no cuentan como repasos ni mueven la mediana de repasos
    expect(twenty.reviews).toBe(30);
    expect(twenty.secondsPerReview).toBe(5);
  });

  it('con puras nuevas no hay repasos medidos y se usa la referencia en ambos', () => {
    const result = estimateCardTimes(samples(40, 12, true), TIME_RULES);
    expect(result).toEqual({ secondsPerReview: 8, secondsPerNew: 25, measured: false, reviews: 0 });
  });

  it('ignora muestras con tiempos negativos o no finitos', () => {
    const broken: ReviewTimeSample[] = [
      { msToReveal: -1, msToRate: 3000, isNew: false },
      { msToReveal: 3000, msToRate: -1, isNew: false },
      { msToReveal: Number.NaN, msToRate: 3000, isNew: false },
      { msToReveal: 3000, msToRate: Number.POSITIVE_INFINITY, isNew: false },
      { msToReveal: Number.NEGATIVE_INFINITY, msToRate: 0, isNew: true },
    ];
    expect(estimateCardTimes([...samples(30, 5), ...broken], TIME_RULES)).toMatchObject({
      secondsPerReview: 5,
      measured: true,
      reviews: 30,
    });
    // Si lo único que hay es basura, tampoco cuenta para llegar al mínimo
    expect(estimateCardTimes(broken, { ...TIME_RULES, minReviewsToMeasure: 1 }).measured).toBe(
      false,
    );
  });

  it('un tope inválido se ignora y no envenena la mediana', () => {
    for (const capSeconds of [Number.NaN, -5]) {
      const result = estimateCardTimes(samples(30, 5), { ...TIME_RULES, capSeconds });
      expect(result.secondsPerReview).toBe(5);
    }
  });
});

// Nuevas por día

const TIMES: TimeEstimate = {
  secondsPerReview: 8,
  secondsPerNew: 25,
  measured: true,
  reviews: 120,
};
const RULES: NewPerDayRules = { cardsTimeShare: 0.7, suggestionHorizonDays: 30 };
const TODAY = studyDayOf(NOW, config.timeZone);

/** Tarjeta con historial. Vence en dueInDays y cada grupo de tres tiene otra estabilidad */
function seen(index: number, dueInDays: number): QueueCard {
  const first = (['good', 'easy', 'good'] as const)[index % 3] ?? 'good';
  let state: FsrsCardState = scheduleReview(
    null,
    first,
    new Date(NOW.getTime() - 20 * DAY),
    config,
  ).state;
  state = {
    ...state,
    state: 'review',
    due: new Date(NOW.getTime() + dueInDays * DAY).toISOString(),
  };
  return { cardId: `c${index}`, noteId: `n${index}`, state };
}

const fresh = (count: number): QueueCard[] =>
  Array.from({ length: count }, (_, index) => ({
    cardId: `f${index}`,
    noteId: `nf${index}`,
    state: null,
  }));

/** Repasos repartidos en los próximos 30 días, ya con historial */
const history = (count: number): QueueCard[] =>
  Array.from({ length: count }, (_, index) => seen(index, (index * 7) % 31));

function suggest(
  cards: readonly QueueCard[],
  dailyMinutes: number | null,
  extra: Partial<Parameters<typeof suggestNewPerDay>[0]> = {},
) {
  return suggestNewPerDay({
    cards,
    now: NOW,
    config,
    dailyMinutes,
    times: TIMES,
    rules: RULES,
    ...extra,
  });
}

/**
 * Lo mismo que calcula el motor, hecho aparte con projectLoad directo sobre todas las tarjetas y
 * sin atajos, para comparar
 */
function peakFor(
  cards: readonly QueueCard[],
  newPerDay: number,
  options: { now?: Date; config?: SchedulerConfig; days?: number } = {},
) {
  const base = options.config ?? config;
  const load = projectLoad({
    cards,
    now: options.now ?? NOW,
    config: { ...base, thresholds: { ...base.thresholds, newCardsPerDay: newPerDay } },
    days: options.days ?? RULES.suggestionHorizonDays,
  });
  let peak = { minutes: 0, day: null as string | null };
  for (const day of load) {
    const minutes =
      (day.reviews * TIMES.secondsPerReview + day.newCards * TIMES.secondsPerNew) / 60;
    if (minutes > peak.minutes) peak = { minutes, day: day.day };
  }
  return peak;
}

function ready(result: ReturnType<typeof suggestNewPerDay>) {
  if (result.status !== 'ready') throw new Error(`Se esperaba ready y salió ${result.status}`);
  return result;
}

describe('suggestNewPerDay', () => {
  it('sin minutos diarios pide los minutos', () => {
    expect(suggest([...history(10), ...fresh(10)], null)).toEqual({ status: 'needs_minutes' });
    // Unos minutos que no son un número positivo tampoco sirven de presupuesto
    for (const minutes of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(suggest(fresh(10), minutes)).toEqual({ status: 'needs_minutes' });
    }
  });

  it('sin tarjetas nuevas lo dice, y los minutos van primero', () => {
    expect(suggest(history(10), 120)).toEqual({ status: 'no_new_cards', unseen: 0 });
    expect(suggest([], 120)).toEqual({ status: 'no_new_cards', unseen: 0 });
    expect(suggest(history(10), null)).toEqual({ status: 'needs_minutes' });
  });

  it('una tarjeta en estado nuevo cuenta como nueva igual que una sin estado', () => {
    const withNewState: QueueCard = { cardId: 'x', noteId: 'nx', state: newCardState(NOW) };
    expect(suggest([withNewState], 120).status).toBe('ready');
  });

  it('con mucho presupuesto llega al máximo y no pasa de él', () => {
    const cards = [...history(20), ...fresh(12)];
    const result = ready(suggest(cards, 2000));
    expect(result.suggested).toBe(DEFAULT_MAX_NEW);
    expect(result.suggested).toBe(200);
    expect(result.budgetMinutes).toBeCloseTo(1400, 8);
    expect(result.backlogOverBudget).toBe(false);
    expect(ready(suggest(cards, 2000, { maxNew: 35 })).suggested).toBe(35);
    // Un máximo de 0 o negativo no deja ninguna, y uno con decimales se redondea hacia abajo
    expect(ready(suggest(cards, 2000, { maxNew: 0 })).suggested).toBe(0);
    expect(ready(suggest(cards, 2000, { maxNew: -4 })).suggested).toBe(0);
    expect(ready(suggest(cards, 2000, { maxNew: 7.9 })).suggested).toBe(7);
  });

  it('con poco presupuesto sugiere el mayor número que cabe y uno más ya no cabe', () => {
    const cards = [...history(40), ...fresh(80)];
    const maxNew = 60;
    for (const dailyMinutes of [10, 25, 40, 60, 90]) {
      const result = ready(suggest(cards, dailyMinutes, { maxNew }));
      const budget = dailyMinutes * RULES.cardsTimeShare;
      expect(result.budgetMinutes).toBeCloseTo(budget, 8);
      expect(peakFor(cards, result.suggested).minutes).toBeLessThanOrEqual(budget + 1e-9);
      if (result.suggested < maxNew) {
        expect(peakFor(cards, result.suggested + 1).minutes).toBeGreaterThan(budget);
      }
    }
  });

  it('coincide con probar uno por uno todos los candidatos', () => {
    const cards = [...history(25), ...fresh(40)];
    const maxNew = 45;
    for (const dailyMinutes of [8, 15, 30, 45, 70]) {
      const budget = dailyMinutes * RULES.cardsTimeShare;
      let best = 0;
      for (let candidate = 0; candidate <= maxNew; candidate += 1) {
        if (peakFor(cards, candidate).minutes <= budget + 1e-9) best = candidate;
      }
      expect(ready(suggest(cards, dailyMinutes, { maxNew })).suggested).toBe(best);
    }
  });

  it('el pico y su día son los de la carga con la cantidad sugerida', () => {
    const cards = [...history(30), ...fresh(60)];
    const result = ready(suggest(cards, 45, { maxNew: 50 }));
    const expected = peakFor(cards, result.suggested);
    expect(result.peakMinutes).toBeCloseTo(expected.minutes, 10);
    expect(result.peakDay).toBe(expected.day);
    expect(result.peakMinutes).toBeLessThanOrEqual(result.budgetMinutes + 1e-9);
    expect(result.peakDay).not.toBeNull();
  });

  it('el atraso que ya rebasa el presupuesto sugiere 0 y lo avisa', () => {
    // 300 vencidas hoy son 300 × 8 s = 40 minutos, y el presupuesto es de 15
    const overdue = Array.from({ length: 300 }, (_, index) => seen(index, -1));
    const result = ready(
      suggest([...overdue, ...fresh(50)], 30, { rules: { ...RULES, cardsTimeShare: 0.5 } }),
    );
    expect(result).toMatchObject({
      suggested: 0,
      backlogOverBudget: true,
      budgetMinutes: 15,
      peakDay: TODAY,
    });
    expect(result.peakMinutes).toBeCloseTo(40, 8);
  });

  it('si el atraso cabe justo pero ninguna nueva cabe, sugiere 0 sin avisar de atraso', () => {
    const overdue = Array.from({ length: 300 }, (_, index) => seen(index, -1));
    // 40 minutos de presupuesto exactos y 40 de atraso
    const result = ready(
      suggest([...overdue, ...fresh(50)], 80, { rules: { ...RULES, cardsTimeShare: 0.5 } }),
    );
    expect(result).toMatchObject({ suggested: 0, backlogOverBudget: false, budgetMinutes: 40 });
    expect(result.peakMinutes).toBeCloseTo(40, 8);
  });

  it('más minutos nunca dan menos nuevas', () => {
    const cards = [...history(60), ...fresh(150)];
    let previous = -1;
    for (let dailyMinutes = 5; dailyMinutes <= 200; dailyMinutes += 10) {
      const { suggested } = ready(suggest(cards, dailyMinutes, { maxNew: 80 }));
      expect(suggested).toBeGreaterThanOrEqual(previous);
      previous = suggested;
    }
    // Y el recorrido sirvió de algo, no fue todo cero ni todo el máximo
    expect(previous).toBeGreaterThan(0);
  });

  it('tiempos más largos por tarjeta nunca dan más nuevas', () => {
    const cards = [...history(60), ...fresh(150)];
    const slower = (factor: number): TimeEstimate => ({
      ...TIMES,
      secondsPerReview: TIMES.secondsPerReview * factor,
      secondsPerNew: TIMES.secondsPerNew * factor,
    });
    const fast = ready(suggest(cards, 60, { times: slower(0.5), maxNew: 80 })).suggested;
    const normal = ready(suggest(cards, 60, { times: slower(1), maxNew: 80 })).suggested;
    const slow = ready(suggest(cards, 60, { times: slower(2), maxNew: 80 })).suggested;
    expect(fast).toBeGreaterThanOrEqual(normal);
    expect(normal).toBeGreaterThanOrEqual(slow);
  });

  it('un horizonte más corto no baja la sugerencia y uno menor a 1 día cuenta como 1', () => {
    const cards = [...history(60), ...fresh(150)];
    const long = ready(suggest(cards, 60, { maxNew: 80 })).suggested;
    const short = ready(
      suggest(cards, 60, { maxNew: 80, rules: { ...RULES, suggestionHorizonDays: 7 } }),
    ).suggested;
    expect(short).toBeGreaterThanOrEqual(long);
    const zero = suggest(cards, 60, { maxNew: 80, rules: { ...RULES, suggestionHorizonDays: 0 } });
    const one = suggest(cards, 60, { maxNew: 80, rules: { ...RULES, suggestionHorizonDays: 1 } });
    expect(zero).toEqual(one);
  });

  it('pasa measured tal cual para que la interfaz diga si es una estimación de referencia', () => {
    const cards = [...history(10), ...fresh(30)];
    expect(ready(suggest(cards, 60)).measured).toBe(true);
    const reference: TimeEstimate = { ...TIMES, measured: false, reviews: 3 };
    const result = ready(suggest(cards, 60, { times: reference }));
    expect(result.measured).toBe(false);
    // Los tiempos de referencia cuentan igual que los medidos para calcular la carga
    expect(result.suggested).toBe(ready(suggest(cards, 60)).suggested);
  });

  it('ignora el límite de nuevas que el alumno tiene hoy en su configuración', () => {
    const cards = [...history(30), ...fresh(100)];
    const base = suggest(cards, 45, { maxNew: 60 });
    for (const newCardsPerDay of [0, 5, 500]) {
      const other = suggest(cards, 45, {
        maxNew: 60,
        config: { ...config, thresholds: { ...config.thresholds, newCardsPerDay } },
      });
      expect(other).toEqual(base);
    }
  });

  it('con menos nuevas que el máximo da lo mismo que probar todos los candidatos', () => {
    // Con 8 sin ver, cualquier candidato de 8 en adelante carga igual y gana el máximo si cabe
    const cards = [...history(10), ...fresh(8)];
    expect(ready(suggest(cards, 300, { maxNew: 50 })).suggested).toBe(50);
    expect(peakFor(cards, 8)).toEqual(peakFor(cards, 50));
  });

  it('no modifica las tarjetas ni la configuración que recibe', () => {
    const cards = [...history(5), ...fresh(5)];
    const cardsBefore = JSON.stringify(cards);
    const configBefore = JSON.stringify(config);
    suggest(cards, 45);
    expect(JSON.stringify(cards)).toBe(cardsBefore);
    expect(JSON.stringify(config)).toBe(configBefore);
  });
});

describe('equivalencia con projectLoad directo', () => {
  // El motor no simula las nuevas una por una en cada candidato, las reparte con perfiles por día
  // de entrada. Aquí se comprueba que el resultado es el de projectLoad con todas las tarjetas
  const capped: SchedulerConfig = {
    ...config,
    maxIntervalDays: 10,
    spacing: { hard: 0.8, good: 0.9, easy: 1.3 },
  };
  const scenarios: { name: string; now: Date; config: SchedulerConfig }[] = [
    { name: 'configuración por defecto', now: NOW, config },
    { name: 'con tope de intervalo y separación propios', now: NOW, config: capped },
    {
      name: 'con el examen dentro del horizonte',
      now: NOW,
      config: { ...config, examDate: '2026-11-12' },
    },
    // 23:30 locales del 8 de octubre. Las nuevas de hoy entran de inmediato
    { name: 'tarde por la noche', now: new Date('2026-10-09T05:30:00.000Z'), config },
    // 02:00 locales, antes del corte de las 4 a. m. Todavía es el día de estudio anterior
    { name: 'de madrugada', now: new Date('2026-10-08T08:00:00.000Z'), config },
  ];
  const cards = [...history(25), ...fresh(50)];
  const maxNew = 45;

  it.each(scenarios)('$name', ({ now, config: scenarioConfig }) => {
    const peaks = Array.from({ length: maxNew + 1 }, (_, candidate) =>
      peakFor(cards, candidate, { now, config: scenarioConfig }),
    );
    const at = (candidate: number) => peaks[candidate] ?? { minutes: 0, day: null };
    // Presupuestos arbitrarios y justo los que miden las cargas de algunos candidatos
    const budgets = [
      4,
      9,
      14,
      20,
      ...[0, 1, 3, 10, 25, 45].map((candidate) => at(candidate).minutes),
    ];
    for (const budgetMinutes of budgets) {
      let best = -1;
      peaks.forEach((peak, candidate) => {
        if (peak.minutes <= budgetMinutes + 1e-9) best = candidate;
      });
      const result = ready(
        suggestNewPerDay({
          cards,
          now,
          config: scenarioConfig,
          dailyMinutes: budgetMinutes / RULES.cardsTimeShare,
          times: TIMES,
          rules: RULES,
          maxNew,
        }),
      );
      expect(result.suggested, `presupuesto ${budgetMinutes}`).toBe(Math.max(0, best));
      expect(result.backlogOverBudget).toBe(best === -1);
      expect(result.peakMinutes).toBeCloseTo(at(result.suggested).minutes, 9);
      expect(result.peakDay).toBe(at(result.suggested).day);
    }
  });
});

describe('rendimiento', () => {
  it('con 4,000 nuevas y 2,000 con historial a 30 días tarda menos de 2 segundos', () => {
    const cards = [...history(2000), ...fresh(4000)];
    // Mucho presupuesto, que es el peor caso porque cada candidato proyecta miles de tarjetas
    const start = performance.now();
    const heavy = ready(suggest(cards, 3000));
    const heavyMs = performance.now() - start;
    expect(heavy.suggested).toBe(DEFAULT_MAX_NEW);
    expect(heavyMs).toBeLessThan(2000);

    // Un presupuesto intermedio, donde la búsqueda recorre varios candidatos distintos
    const middleStart = performance.now();
    const middle = ready(suggest(cards, 150));
    const middleMs = performance.now() - middleStart;
    expect(middle.suggested).toBeGreaterThanOrEqual(0);
    expect(middle.suggested).toBeLessThan(DEFAULT_MAX_NEW);
    expect(middleMs).toBeLessThan(2000);
  }, 20_000);
});
