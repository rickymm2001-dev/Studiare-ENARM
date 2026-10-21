import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS } from '@/config/thresholds';
import { newId } from '@/data/testing/fixtures';
import type { Insight, InsightReport, InsightState } from '@/engines/insights';
import { answered, minute, option, question } from '../tutor/testing/fixtures';
import { buildAnalysis } from './analysis';
import { biasCalibration, biasProfileRows, describeInsight, weeklyFocusItems } from './focusItems';

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

describe('consejos por sesgo como borrador', () => {
  const pattern = insight('bias:anchoring', {
    kind: 'ready',
    level: 'focus',
    values: { attraction: 0.6, baseline: 0.25, choices: 12 },
    refs: { tag: 'anchoring' },
  });
  const negation: Insight = {
    id: 'negation',
    area: 'exam',
    weight: 3,
    state: { kind: 'ready', level: 'focus', values: { negative: 0.4, affirmative: 0.8 }, refs: {} },
  };

  it('la acción de un patrón de sesgo es un consejo base y lo dice', () => {
    expect(describeInsight(pattern).draft).toBe(true);
    expect(describeInsight(pattern).action.length).toBeGreaterThan(0);
  });

  it('las demás lecturas no son borrador', () => {
    expect(describeInsight(negation).draft).toBe(false);
  });

  it('el foco que sale de un patrón de sesgo lleva la marca y el que sale de un tema no', () => {
    const report = { ...reportOf(pattern, negation), focus: [pattern, negation] };
    const weak = [
      {
        key: 'cardiology',
        name: 'Cardiología',
        branch: 'internal_medicine',
        branchName: 'Medicina interna',
        mastery: 0.4,
      },
    ];
    const items = weeklyFocusItems(report, weak);
    expect(items.map((entry) => [entry.key, entry.draft])).toEqual([
      ['bias:anchoring', true],
      ['negation', false],
      ['cardiology', false],
    ]);
  });
});

describe('temas débiles sin Inglés médico (B13, 2.8)', () => {
  it('un tema de la sección de inglés no entra aunque su dominio sea bajo', () => {
    // 30 respuestas con 27 fallos en un tema clínico y en dos de inglés
    const right = option(newId(), true, 'Correcta');
    const wrong = option(newId(), false, 'Mala');
    const make = (branch: string, topic: string) =>
      Array.from({ length: 30 }, () => question({ id: newId(), branch, topic }));
    const questions = [
      ...make('internal_medicine', 'cardiology'),
      ...make('medical_english', 'reading_comprehension'),
      ...make('medical_english', 'medical_vocabulary'),
    ];
    const events = questions.map((q, index) =>
      answered(q, index % 10 === 0 ? right.id : wrong.id, index % 10 === 0, minute(index)),
    );
    const { weakTopics } = buildAnalysis({
      events,
      bank: {
        questions: new Map(questions.map((q) => [q.id, q])),
        options: new Map([right, wrong].map((o) => [o.id, o])),
        cases: new Map(),
      },
      timeZone: 'America/Merida',
      today: '2026-10-02',
      desiredRetention: 0.9,
      thresholds: DEFAULT_THRESHOLDS,
    });
    expect(weakTopics.map((topic) => topic.key)).toEqual(['cardiology']);
    expect(weakTopics.every((topic) => topic.branch !== 'medical_english')).toBe(true);
  });
});
