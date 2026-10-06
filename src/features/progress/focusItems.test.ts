import { describe, expect, it } from 'vitest';
import type { Insight, InsightReport, InsightState } from '@/engines/insights';
import { biasCalibration, biasProfileRows } from './focusItems';

const insight = (id: string, state: InsightState): Insight => ({
  id,
  area: 'traps',
  weight: 1,
  state,
});
const reportOf = (...insights: Insight[]): InsightReport => ({
  insights,
  strengths: [],
  focus: [],
  totals: { answers: 0, reviews: 0, taggedErrors: 0, sessions: 0 },
});
const profile = insight('bias_profile', {
  kind: 'ready',
  level: 'watch',
  values: { share0: 0.6, share1: 0.3 },
  refs: { tag0: 'anchoring', tag1: 'premature_closure' },
});

describe('perfil de sesgos del alumno', () => {
  it('lista los tipos de distractor que más lo atraen con su nombre y su proporción', () => {
    const rows = biasProfileRows(reportOf(profile));
    expect(rows.map((row) => [row.tag, row.share, row.pattern])).toEqual([
      ['anchoring', 0.6, false],
      ['premature_closure', 0.3, false],
    ]);
    // El nombre sale de la taxonomía y si no está se usa la clave
    expect(rows.every((row) => row.name.length > 0)).toBe(true);
  });

  it('marca como patrón los que ya llegaron a patrón', () => {
    const pattern = insight('bias:anchoring', {
      kind: 'ready',
      level: 'focus',
      values: { attraction: 0.6, baseline: 0.25, choices: 12 },
      refs: { tag: 'anchoring' },
    });
    const rows = biasProfileRows(reportOf(pattern, profile));
    expect(rows.find((row) => row.tag === 'anchoring')?.pattern).toBe(true);
    expect(rows.find((row) => row.tag === 'premature_closure')?.pattern).toBe(false);
  });

  it('un nombre desconocido no rompe y se queda con su clave', () => {
    const odd = insight('bias_profile', {
      kind: 'ready',
      level: 'watch',
      values: { share0: 0.5 },
      refs: { tag0: 'sesgo_que_no_existe' },
    });
    expect(biasProfileRows(reportOf(odd))[0]?.name).toBe('sesgo_que_no_existe');
  });

  it('mientras calibra no hay perfil y dice cuánto falta', () => {
    const waiting = insight('biases', {
      kind: 'calibrating',
      have: 12,
      need: 40,
      unit: 'tagged_errors',
    });
    const report = reportOf(waiting);
    expect(biasProfileRows(report)).toEqual([]);
    expect(biasCalibration(report)).toEqual({ have: 12, need: 40 });
  });

  it('con errores etiquetados suficientes ya no calibra', () => {
    expect(biasCalibration(reportOf(profile))).toBeNull();
    expect(biasCalibration(reportOf())).toBeNull();
  });
});
