import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { FACTORY_MODEL_SETTINGS } from '@/config/modelSettings';
import { FACTORY_THRESHOLDS } from '@/config/thresholds';
import {
  parseActivityPage,
  parseAnswersPage,
  parseBank,
  parseBegin,
  parseExposuresPage,
  parseFinish,
  parseLabelPairs,
  parseMotivesPage,
  parsePeople,
} from './wire.ts';

const V = '0b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';
const Q = '1b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';
const O1 = '2b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';
const O2 = '3b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';
const P1 = '3f9a0c1d2e4b5a69';
const P2 = 'a1b2c3d4e5f60718';

describe('lo que devuelve la base, validado', () => {
  it('begin trae los ajustes con sus respaldos y los umbrales con los cambios del admin', () => {
    const begin = parseBegin({
      runId: V,
      status: 'running',
      reason: null,
      mode: 'dry_run',
      studyDay: '2026-10-15',
      asOfSeq: 812345,
      settings: {
        model: { thresholds: { minGroupSize: 10, comparisonWindowDays: 28 } },
        thresholds: { difficulty: { provisionalResponses: 25 } },
      },
      counts: { consenters: 412 },
    });
    expect(begin).toMatchObject({ runId: V, mode: 'dry_run', asOfSeq: 812345, consenters: 412 });
    // minGroupSize en 10 se lee como 30, y 28 días se respeta
    expect(begin.settings.thresholds.minGroupSize).toBe(30);
    expect(begin.settings.thresholds.comparisonWindowDays).toBe(28);
    expect(begin.thresholds.difficulty.provisionalResponses).toBe(25);
    expect(begin.thresholds.difficulty.calibratedResponses).toBe(100);
    expect(begin.thresholdsFallback).toBe(false);
  });

  it('begin saltado trae solo el motivo y usa lo de fábrica', () => {
    const begin = parseBegin({
      runId: V,
      status: 'skipped',
      reason: 'disabled',
      mode: 'dry_run',
      studyDay: '2026-10-15',
      asOfSeq: null,
      settings: null,
      counts: {},
    });
    expect(begin).toMatchObject({
      status: 'skipped',
      reason: 'disabled',
      asOfSeq: null,
      consenters: 0,
    });
    expect(begin.settings).toEqual(FACTORY_MODEL_SETTINGS);
    expect(begin.thresholds).toEqual(FACTORY_THRESHOLDS);
  });

  it('un cambio del admin que rompe una regla cae a los umbrales de fábrica', () => {
    const begin = parseBegin({
      runId: V,
      status: 'running',
      reason: null,
      mode: 'apply',
      studyDay: '2026-10-15',
      asOfSeq: 1,
      settings: { model: {}, thresholds: { confidence: { level: 7 } } },
      counts: { consenters: 1 },
    });
    expect(begin.thresholdsFallback).toBe(true);
    expect(begin.thresholds).toEqual(FACTORY_THRESHOLDS);
  });

  it('el banco, los alumnos y las páginas se convierten a los tipos de los motores', () => {
    const bank = parseBank({
      items: [
        {
          v: V,
          vUlid: 'X'.repeat(26),
          q: Q,
          branch: 'pediatrics',
          topic: 'neonatology',
          subtopic: 'jaundice',
          lang: 'es',
          physician: 3,
          variantOf: null,
          words: 112,
          current: true,
          canonical: [O1, O2],
          options: [
            { o: O1, ovUlid: 'X'.repeat(26), correct: true, tag: null, w: 3 },
            { o: O2, ovUlid: 'X'.repeat(26), correct: false, tag: 'anchoring', w: 4 },
          ],
          prev: { d: -0.4, se: 0.2, st: 'provisional' },
        },
      ],
    });
    expect(bank[0]).toMatchObject({
      versionId: V,
      questionId: Q,
      language: 'es',
      options: [
        { id: O1, correct: true, tag: null, words: 3 },
        { id: O2, correct: false, tag: 'anchoring', words: 4 },
      ],
      previous: { difficulty: -0.4, se: 0.2, state: 'provisional' },
    });
    expect(
      parsePeople({
        people: [
          [P1, 'general_surgery'],
          [P2, null],
        ],
      }),
    ).toEqual([
      { person: P1, specialty: 'general_surgery' },
      { person: P2, specialty: null },
    ]);
    const answers = parseAnswersPage({
      rows: [[P1, P2, V, O1, 1, 'practice', 3, 41, 52000, 'sure', 0, 812001]],
      next: 812001,
      done: false,
      dropped: 2,
    });
    expect(answers.rows[0]).toEqual({
      person: P1,
      session: P2,
      versionId: V,
      optionId: O1,
      correct: true,
      sessionKind: 'practice',
      daysBefore: 3,
      minute: 41,
      ms: 52000,
      confidence: 'sure',
      changes: 0,
      seq: 812001,
    });
    expect(answers).toMatchObject({ next: 812001, done: false, dropped: 2 });
    expect(
      parseExposuresPage({ rows: [[P1, V, [O1, O2], 7]], next: 7, done: true }).rows[0],
    ).toEqual({
      person: P1,
      versionId: V,
      options: [O1, O2],
      seq: 7,
    });
    expect(
      parseMotivesPage({ rows: [[P1, 2, 'pediatrics', 'fatigue', 1]], next: 5, done: true })
        .rows[0],
    ).toEqual({
      person: P1,
      daysBefore: 2,
      branch: 'pediatrics',
      motive: 'fatigue',
      lastThird: true,
    });
    expect(parseActivityPage({ rows: [[P1, 3, 40, 12]], next: `${P1}:3`, done: false })).toEqual({
      rows: [{ person: P1, daysBefore: 3, reviews: 40, answers: 12 }],
      next: `${P1}:3`,
      done: false,
    });
    expect(parseLabelPairs({ pairs: [[O1, 'anchoring', 'framing_effect']] })).toEqual([
      { optionId: O1, authorTag: 'anchoring', reviewerTag: 'framing_effect' },
    ]);
    expect(parseFinish({ status: 'ok', applied: true, counts: { catalogUpdated: 2 } })).toEqual({
      status: 'ok',
      applied: true,
      counts: { catalogUpdated: 2 },
    });
  });

  it('una fila rota falla con ZodError y no entra a los motores', () => {
    const row = [P1, P2, V, O1, 1, 'practice', 3, 41, 52000, 'sure', 0, 812001];
    const page = (changes: Record<number, unknown>) => ({
      rows: [row.map((value, index) => (index in changes ? changes[index] : value))],
      next: 1,
      done: true,
      dropped: 0,
    });
    for (const changes of [
      { 0: 'Ana López' },
      { 0: 'ABCDEF0123456789' },
      { 2: '01HZX8Q6N7V3M4K5P6R7S8T9WA' },
      { 4: 2 },
      { 5: 'mock' },
      { 6: -1 },
      { 9: 'seguro' },
      { 11: 1.5 },
    ]) {
      expect(() => parseAnswersPage(page(changes))).toThrow(ZodError);
    }
    expect(() =>
      parseAnswersPage({ rows: [row.slice(0, 11)], next: 1, done: true, dropped: 0 }),
    ).toThrow(ZodError);
    expect(() => parsePeople({ people: [['no-es-seudonimo', null]] })).toThrow(ZodError);
    expect(() => parseBank({ items: [{ v: 'no-uuid' }] })).toThrow(ZodError);
    expect(() => parseFinish({ status: 'listo', applied: true, counts: {} })).toThrow(ZodError);
    expect(() => parseBegin({ runId: V, status: 'running' })).toThrow(ZodError);
  });
});
