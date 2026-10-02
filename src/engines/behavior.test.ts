import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import {
  negationSignal,
  accuracyBy,
  calibrationReport,
  fatigueSignal,
  hourBand,
  MIN_RESPONSES_FOR_PACE,
  personalPace,
  responseSignals,
  summarizeChanges,
  summarizeDistraction,
  type ResponseRecord,
} from './behavior';
import { createRng } from './random';

const thresholds = DEFAULT_THRESHOLDS.behavior;

function response(overrides: Partial<ResponseRecord> = {}): ResponseRecord {
  return {
    id: 'r',
    sessionId: 's',
    at: '2026-10-01T15:00:00.000Z',
    msToAnswer: 60000,
    words: 120,
    correct: true,
    confidence: 'sure',
    expected: 0.6,
    changes: [],
    minuteInSession: 0,
    ...overrides,
  };
}

describe('ritmo y adivinanza rápida (7.6)', () => {
  it('con pocas respuestas solo usa el mínimo plausible de lectura', () => {
    const pace = personalPace([response()], thresholds);
    expect(pace.ready).toBe(false);
    // 120 palabras a 6 por segundo son 20 segundos
    const fast = responseSignals({ msToAnswer: 15000, words: 120 }, pace, thresholds);
    expect(fast).toMatchObject({
      rapidGuess: true,
      fasterThanP25: false,
      timeZ: null,
      minReadingMs: 20000,
    });
    expect(responseSignals({ msToAnswer: 25000, words: 120 }, pace, thresholds).rapidGuess).toBe(
      false,
    );
  });

  it('con ritmo personal usa sus percentiles 10 y 25 y da puntaje z', () => {
    const rng = createRng('ritmo');
    const history = Array.from({ length: 200 }, () =>
      response({ msToAnswer: Math.exp(rng.normal(Math.log(60000), 0.3)) }),
    );
    const pace = personalPace(history, thresholds);
    expect(pace.ready).toBe(true);
    expect(pace.responses).toBe(200);
    const slowForThisStudent = responseSignals({ msToAnswer: 40000, words: 120 }, pace, thresholds);
    expect(slowForThisStudent.rapidGuess).toBe(true);
    expect(slowForThisStudent.timeZ).toBeLessThan(-1);
    const typical = responseSignals({ msToAnswer: 60000, words: 120 }, pace, thresholds);
    expect(typical.rapidGuess).toBe(false);
    expect(Math.abs(typical.timeZ ?? 99)).toBeLessThan(0.5);
    const quickButFine = responseSignals({ msToAnswer: 45000, words: 120 }, pace, thresholds);
    expect(quickButFine.fasterThanP25).toBe(true);
    expect(MIN_RESPONSES_FOR_PACE).toBe(20);
  });
});

describe('cambios de respuesta', () => {
  it('cuenta la dirección de cada cambio', () => {
    const summary = summarizeChanges([
      response({ changes: [{ fromCorrect: true, toCorrect: false }] }),
      response({
        changes: [
          { fromCorrect: false, toCorrect: true },
          { fromCorrect: false, toCorrect: false },
        ],
      }),
      response(),
    ]);
    expect(summary).toEqual({
      total: 3,
      correctToIncorrect: 1,
      incorrectToCorrect: 1,
      incorrectToIncorrect: 1,
      responsesWithChanges: 2,
    });
  });
});

/** Sesiones de 60 minutos con 30 respuestas. Si fatigued, el último tercio cae y se alarga */
function sessions(count: number, fatigued: boolean, seed: string): ResponseRecord[] {
  const rng = createRng(seed);
  const result: ResponseRecord[] = [];
  for (let s = 0; s < count; s += 1) {
    for (let index = 0; index < 30; index += 1) {
      const late = index >= 20;
      const p = fatigued && late ? 0.35 : 0.7;
      result.push(
        response({
          id: `s${s}-${index}`,
          sessionId: `s${s}`,
          minuteInSession: index * 2,
          correct: rng.chance(p),
          expected: 0.7,
          msToAnswer: Math.exp(rng.normal(Math.log(fatigued && late ? 80000 : 60000), 0.2)),
        }),
      );
    }
  }
  return result;
}

describe('fatiga', () => {
  it('detecta la caída del último tercio en sesiones largas', () => {
    const signal = fatigueSignal(sessions(6, true, 'fatiga-si'), thresholds);
    expect(signal.sessions).toBe(6);
    expect(signal.accuracyDrop).toBeLessThan(-0.2);
    expect(signal.timeIncrease).toBeGreaterThan(0);
    expect(signal.fatigued).toBe(true);
  });

  it('no marca fatiga si no la hay', () => {
    expect(fatigueSignal(sessions(6, false, 'fatiga-no'), thresholds).fatigued).toBe(false);
  });

  it('calibra hasta tener 3 sesiones largas y no cuenta sesiones cortas', () => {
    const signal = fatigueSignal(sessions(2, true, 'fatiga-pocas'), thresholds);
    expect(signal).toMatchObject({ sessions: 2, fatigued: null, sessionsNeeded: 1 });
    const short = sessions(4, true, 'cortas').map((item) => ({
      ...item,
      minuteInSession: item.minuteInSession / 4,
    }));
    expect(fatigueSignal(short, thresholds).sessions).toBe(0);
  });
});

describe('distracción, franjas y exactitud por grupo', () => {
  it('resume salidas de pestaña y pausas largas', () => {
    expect(
      summarizeDistraction({
        awayMs: [30000, 90000],
        responses: [response({ msToAnswer: 30000 }), response({ msToAnswer: 150000 })],
        thresholds,
      }),
    ).toEqual({ tabSwitches: 2, minutesAway: 2, longPauses: 1 });
  });

  it('franjas horarias y exactitud con intervalo', () => {
    expect([0, 5, 6, 11, 12, 18, 19, 23].map(hourBand)).toEqual([
      'madrugada',
      'madrugada',
      'manana',
      'manana',
      'tarde',
      'tarde',
      'noche',
      'noche',
    ]);
    const responses = [
      response({ correct: true }),
      response({ correct: false }),
      response({ correct: true }),
    ];
    const byBand = accuracyBy(responses, (index) => (index < 2 ? 'manana' : 'noche'));
    expect(byBand.manana).toMatchObject({ estimate: 0.5, n: 2 });
    expect(byBand.noche).toMatchObject({ estimate: 1, n: 1 });
  });
});

describe('calibración metacognitiva', () => {
  const build = (sure: [number, number], unsure: [number, number], guessed: [number, number]) => [
    ...Array.from({ length: sure[1] }, (_, i) =>
      response({ confidence: 'sure', correct: i < sure[0] }),
    ),
    ...Array.from({ length: unsure[1] }, (_, i) =>
      response({ confidence: 'unsure', correct: i < unsure[0] }),
    ),
    ...Array.from({ length: guessed[1] }, (_, i) =>
      response({ confidence: 'guessed', correct: i < guessed[0] }),
    ),
  ];

  it('marca sobreconfianza si acierta mucho menos de lo que dice', () => {
    const report = calibrationReport(build([30, 50], [10, 20], [3, 10]));
    expect(report.label).toBe('overconfident');
    expect(report.sureErrors).toBe(20);
    expect(report.calibrationGap).toBeGreaterThan(0);
  });

  it('marca subconfianza si al dudar o adivinar acierta mucho más', () => {
    expect(calibrationReport(build([45, 48], [18, 20], [18, 20])).label).toBe('underconfident');
  });

  it('calibrado cuando coincide y calibrando con pocas respuestas', () => {
    expect(calibrationReport(build([45, 50], [12, 20], [3, 10])).label).toBe('calibrated');
    const few = calibrationReport(build([5, 10], [2, 5], [1, 5]));
    expect(few).toMatchObject({ ready: false, responsesNeeded: 10, label: null });
    expect(calibrationReport([]).calibrationGap).toBe(0);
  });
});

describe('mala lectura de negaciones (7.5, 14.2)', () => {
  const block = (polarity: 'affirmative' | 'negative', n: number, rate: number) =>
    Array.from({ length: n }, (_, index) => ({
      polarity,
      correct: index < Math.round(n * rate),
      expected: 0.7,
    }));

  it('calibra hasta tener el mínimo en ambas polaridades', () => {
    const signal = negationSignal(
      [...block('negative', 10, 0.2), ...block('affirmative', 40, 0.7)],
      20,
    );
    expect(signal.misreads).toBeNull();
    expect(signal.negativeNeeded).toBe(10);
  });

  it('marca el patrón cuando rinde claramente peor en las negativas', () => {
    const signal = negationSignal(
      [...block('negative', 40, 0.35), ...block('affirmative', 120, 0.7)],
      20,
    );
    expect(signal.misreads).toBe(true);
    expect(signal.difference).toBeCloseTo(-0.35, 2);
  });

  it('no marca nada con el mismo rendimiento en ambas', () => {
    const signal = negationSignal(
      [...block('negative', 40, 0.7), ...block('affirmative', 120, 0.7)],
      20,
    );
    expect(signal.misreads).toBe(false);
  });

  it('tolera listas vacías', () => {
    const signal = negationSignal([], 20);
    expect(signal.misreads).toBeNull();
    expect(signal.difference).toBe(0);
  });
});
