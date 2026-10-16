import { describe, expect, it } from 'vitest';
import type { ComparisonCell, ComparisonSnapshot } from '@/data/model/contracts';
import type { AppEvent } from '@/data/schemas/events';
import { newId } from '@/data/testing/fixtures';
import { distributionCuts, type ComparisonFact } from '@/engines/comparison';
import { answered, event, minute, option, question, state } from '../tutor/testing/fixtures';
import { buildComparisonView, comparisonFactsFrom, nightOf } from './comparisonView';

/** El corte es el 15. La ventana de 30 días va del 15 de septiembre al 14 de octubre */
const AS_OF = '2026-10-15';

/** Cortes de un grupo de 60 con acierto repartido parejo entre 0.30 y 0.89 */
const accuracyCuts = distributionCuts(
  Array.from({ length: 60 }, (_, index) => Math.round((0.3 + index * 0.01) * 100) / 100),
  'sim_accuracy',
);
const reviewCuts = distributionCuts(
  Array.from({ length: 60 }, (_, index) => index * 10),
  'reviews',
);
const consistencyCuts = distributionCuts(
  Array.from({ length: 60 }, (_, index) => Math.floor(index / 2)),
  'consistency',
);

const cell = (
  overrides: Partial<ComparisonCell> & Pick<ComparisonCell, 'metric' | 'branch'>,
): ComparisonCell => ({
  cohort: 'all',
  students: 60,
  state: 'ready',
  cuts: null,
  ...overrides,
});

const snapshot = (
  cells: ComparisonCell[],
  over: Partial<ComparisonSnapshot> = {},
): ComparisonSnapshot => ({
  available: true,
  runAt: '2026-10-15T10:23:00.000Z',
  studyDay: AS_OF,
  windowDays: 30,
  minGroupSize: 30,
  specialty: null,
  cells,
  ...over,
});

const answer = (day: string, branch: string, correct: boolean): ComparisonFact => ({
  day,
  kind: 'answer',
  branch,
  correct,
  sessionKind: 'practice',
});
const review = (day: string, count = 1): ComparisonFact => ({ day, kind: 'review', count });

/** 25 respuestas de práctica en una rama, 18 correctas, repartidas en días de la ventana */
const pediatricsFacts: ComparisonFact[] = Array.from({ length: 25 }, (_, index) =>
  answer(`2026-10-${String(1 + (index % 10)).padStart(2, '0')}`, 'pediatrics', index < 18),
);

const base = {
  cohort: 'all' as const,
  minBranchAnswers: 20,
  branchOrder: ['pediatrics', 'internal_medicine'],
};

describe('hechos de la bitácora para la comparación', () => {
  const q = question({ id: newId(), branch: 'pediatrics' });
  const right = option(newId(), true, 'Buena');
  const bank = new Map([[q.id, q]]);
  const sessionId = newId();
  const events: AppEvent[] = [
    event('session_started', { kind: 'exam', config: {} }, minute(0), sessionId),
    answered(q, right.id, true, minute(5), {}, sessionId),
    // Sin sesión conocida, el tipo no se sabe y no cuenta para el acierto
    answered(q, right.id, false, minute(6), {}, newId()),
    // Una pregunta que ya no está en el banco no cuenta
    answered(question({ id: newId() }), right.id, true, minute(7), {}, sessionId),
    event(
      'card_reviewed',
      {
        cardId: newId(),
        deckId: newId(),
        source: 'card',
        rating: 'good',
        confidence: null,
        msToReveal: 1000,
        msToRate: 1000,
        stateBefore: null,
        stateAfter: state(),
      },
      minute(8),
    ),
  ];

  it('cada respuesta lleva su rama y el tipo de su sesión, y cada repaso su día', () => {
    expect(comparisonFactsFrom(events, bank)).toEqual([
      {
        day: '2026-10-01',
        kind: 'answer',
        branch: 'pediatrics',
        correct: true,
        sessionKind: 'exam',
      },
      {
        day: '2026-10-01',
        kind: 'answer',
        branch: 'pediatrics',
        correct: false,
        sessionKind: null,
      },
      { day: '2026-10-01', kind: 'review' },
    ]);
  });

  it('el día de estudio corta a las 4 de la mañana de la zona del evento', () => {
    const early = answered(q, right.id, true, Date.UTC(2026, 9, 2, 8, 0)); // 2:00 en Mérida
    expect(comparisonFactsFrom([early], bank)[0]?.day).toBe('2026-10-01');
  });

  it('una sesión de repaso no es de simulador', () => {
    const reviewing = [
      event('session_started', { kind: 'review', config: {} }, minute(0), sessionId),
      answered(q, right.id, true, minute(1), {}, sessionId),
    ];
    expect(comparisonFactsFrom(reviewing, bank)[0]?.sessionKind).toBeNull();
  });
});

describe('percentil contra los cortes publicados (5.3)', () => {
  const snap = snapshot([
    cell({ metric: 'sim_accuracy', branch: '*', cuts: accuracyCuts }),
    cell({ metric: 'sim_accuracy', branch: 'pediatrics', cuts: accuracyCuts }),
    cell({ metric: 'reviews', branch: '*', cuts: reviewCuts }),
    cell({ metric: 'consistency', branch: '*', cuts: consistencyCuts }),
  ]);

  it('arma una fila lista por celda con el percentil de lo que ya hizo el alumno', () => {
    const facts = [
      ...pediatricsFacts,
      review('2026-10-02', 300),
      review('2026-10-03', 100),
      review('2026-10-09', 50),
    ];
    const view = buildComparisonView({ ...base, snapshot: snap, facts });
    // 18 de 25 son 0.72 y lo redondea como la noche
    const pediatrics = view.rows.find((row) => row.branch === 'pediatrics');
    expect(pediatrics).toMatchObject({
      kind: 'ready',
      metric: 'sim_accuracy',
      value: 0.72,
      students: 60,
    });
    expect(pediatrics?.kind === 'ready' ? pediatrics.percentile : null).toMatchObject({
      band: 70,
      below5: false,
      above95: false,
    });
    const reviews = view.rows.find((row) => row.metric === 'reviews');
    expect(reviews).toMatchObject({ kind: 'ready', value: 450 });
    // Las respuestas caen en 10 días distintos y los repasos en tres de ellos
    const consistency = view.rows.find((row) => row.metric === 'consistency');
    expect(consistency).toMatchObject({ kind: 'ready', value: 10 });
  });

  it('va primero el total, luego las ramas en el orden de la taxonomía, luego repasos y constancia', () => {
    const view = buildComparisonView({ ...base, snapshot: snap, facts: pediatricsFacts });
    expect(view.rows.map((row) => `${row.metric}|${row.branch}`)).toEqual([
      'sim_accuracy|*',
      'sim_accuracy|pediatrics',
      'reviews|*',
      'consistency|*',
    ]);
  });

  it('debajo del primer corte dice menos del 5 y arriba del último más del 95', () => {
    const low = buildComparisonView({
      ...base,
      snapshot: snap,
      facts: Array.from({ length: 25 }, (_, i) => answer('2026-10-01', 'pediatrics', i < 2)),
    });
    const high = buildComparisonView({
      ...base,
      snapshot: snap,
      facts: Array.from({ length: 25 }, () => answer('2026-10-01', 'pediatrics', true)),
    });
    const pick = (view: typeof low) => {
      const row = view.rows.find((item) => item.branch === 'pediatrics');
      return row?.kind === 'ready' ? row.percentile : null;
    };
    expect(pick(low)).toMatchObject({ below5: true, above95: false });
    expect(pick(high)).toMatchObject({ below5: false, above95: true });
  });

  it('con pocas respuestas en la rama calibra y dice cuántas lleva y cuántas pide', () => {
    const view = buildComparisonView({
      ...base,
      snapshot: snap,
      facts: pediatricsFacts.slice(0, 7),
    });
    expect(view.rows.find((row) => row.branch === 'pediatrics')).toEqual({
      kind: 'own_calibrating',
      metric: 'sim_accuracy',
      branch: 'pediatrics',
      have: 7,
      need: 20,
    });
  });

  it('una rama donde nunca ha contestado calibra con cero respuestas', () => {
    const view = buildComparisonView({ ...base, snapshot: snap, facts: [review('2026-10-02')] });
    expect(view.rows.find((row) => row.branch === 'pediatrics')).toMatchObject({
      kind: 'own_calibrating',
      have: 0,
      need: 20,
    });
  });

  it('sin actividad en la ventana, repasos y constancia calibran sin números de respuestas', () => {
    const view = buildComparisonView({ ...base, snapshot: snap, facts: [] });
    const reviews = view.rows.find((row) => row.metric === 'reviews');
    expect(reviews).toEqual({
      kind: 'own_calibrating',
      metric: 'reviews',
      branch: '*',
      have: null,
      need: null,
    });
  });

  it('la actividad de antes de la ventana o del mismo día del corte no entra', () => {
    const view = buildComparisonView({
      ...base,
      snapshot: snap,
      facts: [review('2026-09-01', 500), review(AS_OF, 500)],
    });
    expect(view.rows.find((row) => row.metric === 'reviews')?.kind).toBe('own_calibrating');
  });
});

describe('grupos chicos y grupos distintos', () => {
  it('una celda con menos alumnos que el mínimo calibra y dice cuántos faltan, sin cortes', () => {
    const snap = snapshot([
      cell({ metric: 'sim_accuracy', branch: '*', students: 18, state: 'calibrating', cuts: null }),
    ]);
    const view = buildComparisonView({ ...base, snapshot: snap, facts: pediatricsFacts });
    expect(view.rows).toEqual([
      { kind: 'group_calibrating', metric: 'sim_accuracy', branch: '*', students: 18, missing: 12 },
    ]);
  });

  it('una celda que llega como lista pero sin cortes también calibra', () => {
    const snap = snapshot([cell({ metric: 'reviews', branch: '*', cuts: null })]);
    const view = buildComparisonView({ ...base, snapshot: snap, facts: [review('2026-10-02')] });
    expect(view.rows[0]).toMatchObject({ kind: 'group_calibrating', missing: 0 });
  });

  it('cada grupo trae solo sus celdas', () => {
    const snap = snapshot(
      [
        cell({ metric: 'sim_accuracy', branch: '*', cuts: accuracyCuts }),
        cell({
          cohort: 'specialty',
          metric: 'sim_accuracy',
          branch: '*',
          students: 40,
          cuts: accuracyCuts,
        }),
        cell({
          cohort: 'specialty',
          metric: 'reviews',
          branch: '*',
          students: 12,
          state: 'calibrating',
        }),
      ],
      { specialty: 'general_surgery' },
    );
    const all = buildComparisonView({ ...base, snapshot: snap, facts: pediatricsFacts });
    const specialty = buildComparisonView({
      ...base,
      cohort: 'specialty',
      snapshot: snap,
      facts: pediatricsFacts,
    });
    expect(all.rows).toHaveLength(1);
    expect(specialty.rows.map((row) => row.kind)).toEqual(['ready', 'group_calibrating']);
  });

  it('una rama que no es de la taxonomía o repasos por rama no se pintan', () => {
    const snap = snapshot([
      cell({ metric: 'sim_accuracy', branch: 'rama_rara', cuts: accuracyCuts }),
      cell({ metric: 'reviews', branch: 'pediatrics', cuts: reviewCuts }),
    ]);
    expect(buildComparisonView({ ...base, snapshot: snap, facts: pediatricsFacts }).rows).toEqual(
      [],
    );
  });

  it('sin foto disponible no hay filas', () => {
    const snap = snapshot([], { available: false, studyDay: null });
    expect(buildComparisonView({ ...base, snapshot: snap, facts: pediatricsFacts }).rows).toEqual(
      [],
    );
  });
});

describe('la noche que calculó la foto', () => {
  it('es el día anterior al día de estudio del corte', () => {
    expect(nightOf({ studyDay: '2026-10-15' })).toBe('2026-10-14');
    expect(nightOf({ studyDay: '2026-03-01' })).toBe('2026-02-28');
    expect(nightOf({ studyDay: null })).toBeNull();
  });
});
