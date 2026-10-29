import { describe, expect, it } from 'vitest';
import type { Insight, InsightReport } from '@/engines/insights';
import { t } from '@/i18n/es-MX';
import { INDICATOR_KEYS, indicatorRows, MASTERY_GOAL } from './indicatorsView';

const text = t.progress.indicators;

const ready = (
  id: string,
  level: 'strength' | 'watch' | 'focus',
  values: Record<string, number>,
  refs: Record<string, string> = {},
): Insight => ({
  id,
  area: 'exam',
  weight: 1,
  state: { kind: 'ready', level, values, refs },
});

const calibrating = (
  id: string,
  have: number,
  need: number,
  unit: 'answers' | 'reviews' | 'sessions' | 'changes',
): Insight => ({ id, area: 'exam', weight: 1, state: { kind: 'calibrating', have, need, unit } });

const reportWith = (insights: Insight[]): InsightReport => ({
  insights,
  strengths: [],
  focus: [],
  totals: { answers: 0, reviews: 0, taggedErrors: 0, sessions: 0 },
});

describe('indicadores clave de Progreso (D-150)', () => {
  it('con todo listo da los seis en orden con su cifra, su estado en palabras y su nota', () => {
    const report = reportWith([
      ready('retention', 'strength', { retention: 0.91, desired: 0.9, reviews: 80 }),
      ready('pace', 'watch', { seconds: 84, target: 77 }),
      ready(
        'confidence',
        'focus',
        { sure: 0.7, unsure: 0.5, guessed: 0.3, sureErrors: 6 },
        {
          label: 'overconfident',
        },
      ),
      ready('fatigue', 'focus', { drop: -0.12, sessions: 4 }),
      ready('changes', 'strength', { total: 20, toCorrect: 12, toIncorrect: 3 }),
    ]);
    const rows = indicatorRows({
      report,
      answers: { total: 100, correct: 68 },
      desiredRetention: 0.9,
    });
    expect(rows.map((row) => row.key)).toEqual(INDICATOR_KEYS);
    expect(rows[0]).toMatchObject({
      kind: 'ready',
      value: '91',
      unit: '%',
      state: text.states.optimal,
      tone: 'good',
      note: text.notes.retention(90),
      position: 91,
    });
    // 68 queda entre 60 y 75, cerca de la meta
    expect(rows[1]).toMatchObject({
      kind: 'ready',
      value: '68',
      state: text.states.near,
      tone: 'near',
      note: text.notes.accuracy(MASTERY_GOAL),
    });
    // El tiempo llena la barra al doble del ritmo, así 84 s queda poco después de la mitad
    expect(rows[2]).toMatchObject({
      kind: 'ready',
      value: '84',
      unit: 's',
      state: text.states.slow,
    });
    if (rows[2]?.kind === 'ready') expect(Math.round(rows[2].position)).toBe(55);
    expect(rows[3]).toMatchObject({
      kind: 'ready',
      value: '70',
      state: text.states.overconfident,
      tone: 'near',
      note: text.notes.confidence(90),
    });
    // La caída se dice en puntos positivos y empuja el marcador hacia la zona mala
    expect(rows[4]).toMatchObject({
      kind: 'ready',
      value: '12',
      unit: 'pts',
      state: text.states.likely,
      position: 80,
      note: text.notes.fatigue(4),
    });
    expect(rows[5]).toMatchObject({
      kind: 'ready',
      value: '15',
      state: text.states.optimalM,
      tone: 'good',
      note: text.notes.changes(3, 20),
      position: 15,
    });
  });

  it('con todo calibrando dice cuánto falta en cada uno y no inventa cifras', () => {
    const report = reportWith([
      calibrating('retention', 10, 50, 'reviews'),
      calibrating('pace', 5, 20, 'answers'),
      calibrating('confidence', 5, 30, 'answers'),
      calibrating('fatigue', 1, 3, 'sessions'),
      calibrating('changes', 2, 10, 'changes'),
    ]);
    const rows = indicatorRows({
      report,
      answers: { total: 5, correct: 5 },
      desiredRetention: 0.9,
    });
    expect(rows.every((row) => row.kind === 'calibrating')).toBe(true);
    expect(rows[0]).toMatchObject({
      have: 10,
      need: 50,
      note: t.insights.calibrating(10, 50, 'reviews'),
    });
    // Los aciertos calibran con el mismo mínimo que Conócete, aunque todas sean correctas
    expect(rows[1]).toMatchObject({
      have: 5,
      need: 20,
      note: t.insights.calibrating(5, 20, 'answers'),
    });
    expect(rows[4]).toMatchObject({ have: 1, need: 3 });
    expect(rows[5]).toMatchObject({ have: 2, need: 10 });
  });

  it('sin el hallazgo en el informe calibra desde cero con el mínimo del motor', () => {
    const rows = indicatorRows({
      report: reportWith([]),
      answers: { total: 0, correct: 0 },
      desiredRetention: 0.85,
    });
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({ kind: 'calibrating', have: 0, need: 50 });
    expect(rows[2]).toMatchObject({ kind: 'calibrating', have: 0, need: 20 });
  });

  it('la fatiga sin detector validado explica el motivo en lugar de contar sesiones', () => {
    const rows = indicatorRows({
      report: reportWith([calibrating('fatigue', 3, 3, 'sessions')]),
      answers: { total: 0, correct: 0 },
      desiredRetention: 0.9,
      fatigueValidation: 'calibrating',
    });
    expect(rows[4]).toMatchObject({ kind: 'calibrating', note: text.notes.fatigueUnvalidated });
  });

  it('la confianza que falta y los otros niveles toman su palabra y su tono', () => {
    const report = reportWith([
      ready('retention', 'focus', { retention: 0.7, desired: 0.9, reviews: 80 }),
      ready('pace', 'focus', { seconds: 200, target: 77 }),
      ready('confidence', 'watch', { sure: 0.95 }, { label: 'underconfident' }),
      ready('fatigue', 'strength', { drop: 0.02, sessions: 3 }),
      ready('changes', 'focus', { total: 10, toCorrect: 2, toIncorrect: 6 }),
    ]);
    const rows = indicatorRows({
      report,
      answers: { total: 40, correct: 20 },
      desiredRetention: 0.9,
    });
    expect(rows[0]).toMatchObject({ state: text.states.below, tone: 'near' });
    expect(rows[1]).toMatchObject({ value: '50', state: text.states.below });
    // Al doble del ritmo o más, el marcador se queda en el tope
    expect(rows[2]).toMatchObject({ state: text.states.verySlow, position: 100 });
    expect(rows[3]).toMatchObject({ state: text.states.underconfident, tone: 'info' });
    // Sin caída no hay puntos negativos, y el marcador queda al centro o antes
    expect(rows[4]).toMatchObject({ value: '0', state: text.states.noSignal, tone: 'good' });
    if (rows[4]?.kind === 'ready') expect(rows[4].position).toBeLessThanOrEqual(50);
    expect(rows[5]).toMatchObject({ value: '60', state: text.states.harmful });
  });
});
