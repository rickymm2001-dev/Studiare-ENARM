// Adaptador del banco demo a entidades de la base con IDs estables (D-052).
import { describe, expect, it } from 'vitest';
import { ClinicalCaseSchema, OptionSchema, QuestionSchema } from '@/data/schemas/bank';
import { rankedUlid, stableUlid, ULID_RANKS } from '../stableId';
import { buildDemoBank, demoIds } from './bank';
import { questionBatches } from './questions';

describe('IDs estables', () => {
  it('la misma clave da el mismo ULID y claves distintas dan IDs distintos', () => {
    expect(stableUlid('a', 0)).toBe(stableUlid('a', 0));
    expect(stableUlid('a', 0)).not.toBe(stableUlid('b', 0));
    expect(stableUlid('a', 0)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(stableUlid('a', 1000) > stableUlid('a', 0)).toBe(true);
  });

  it('rechaza tiempos fuera del rango de un ULID', () => {
    expect(() => stableUlid('a', -1)).toThrow(RangeError);
    expect(() => stableUlid('a', 1.5)).toThrow(RangeError);
  });

  it('con rango, los IDs del mismo milisegundo se ordenan por su rango y se repiten', () => {
    const ids = Array.from({ length: ULID_RANKS }, (_, rank) => rankedUlid('a', 5000, rank));
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ULID_RANKS);
    expect(rankedUlid('a', 5000, 3)).toBe(rankedUlid('a', 5000, 3));
    expect(rankedUlid('a', 5000, 3)).not.toBe(rankedUlid('b', 5000, 3));
    expect(rankedUlid('a', 5000, 0)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // El tiempo manda sobre el rango
    expect(rankedUlid('a', 5001, 0) > rankedUlid('a', 5000, ULID_RANKS - 1)).toBe(true);
  });

  it('rechaza un rango fuera de lo que se puede ordenar', () => {
    expect(() => rankedUlid('a', 0, -1)).toThrow(RangeError);
    expect(() => rankedUlid('a', 0, ULID_RANKS)).toThrow(RangeError);
    expect(() => rankedUlid('a', 0, 1.5)).toThrow(RangeError);
  });
});

describe('banco demo como entidades', () => {
  const bank = buildDemoBank();
  const total = questionBatches.reduce((sum, batch) => sum + batch.questions.length, 0);

  it('convierte cada pregunta con sus 10 opciones y valida con los esquemas de la base', () => {
    expect(bank.questions).toHaveLength(total);
    for (const entry of bank.questions) {
      expect(QuestionSchema.safeParse(entry.question).success).toBe(true);
      expect(entry.options).toHaveLength(10);
      for (const option of entry.options) expect(OptionSchema.safeParse(option).success).toBe(true);
      expect(entry.question.isDemo).toBe(true);
      expect(entry.question.editorialStatus).toBe('draft');
      expect(entry.question.canonicalOptionIds).toHaveLength(4);
      const ids = new Set(entry.options.map((option) => option.id));
      for (const id of entry.question.canonicalOptionIds) expect(ids.has(id)).toBe(true);
    }
    for (const item of bank.cases) expect(ClinicalCaseSchema.safeParse(item).success).toBe(true);
  });

  it('los IDs no cambian entre corridas y no se repiten', () => {
    const again = buildDemoBank();
    expect(again.questions.map((entry) => entry.question.id)).toEqual(
      bank.questions.map((entry) => entry.question.id),
    );
    const all = bank.questions.flatMap((entry) => [
      entry.question.id,
      entry.question.questionId,
      ...entry.options.flatMap((option) => [option.id, option.optionId]),
    ]);
    expect(new Set(all).size).toBe(all.length);
    expect(bank.byKey.get('b1-q01')?.question.id).toBe(demoIds.questionVersion('b1-q01'));
  });

  it('las preguntas de un caso seriado apuntan a su caso y cuentan sus palabras', () => {
    const serial = bank.questions.filter((entry) => entry.question.caseId !== null);
    expect(serial.length).toBeGreaterThan(0);
    const caseIds = new Set(bank.cases.map((item) => item.id));
    for (const entry of serial) {
      expect(caseIds.has(entry.question.caseId ?? '')).toBe(true);
      expect(entry.question.structure.format).toBe('serial_case');
      expect(entry.stemWords).toBeGreaterThan(20);
    }
    const direct = bank.questions.find((entry) => entry.question.structure.format === 'direct');
    expect(direct?.question.vignette).toBe('');
  });
});

describe('tipos de reactivo de V2 en un lote (D-080)', () => {
  it('un lote con kinds y clues llega a la pregunta, y uno sin ellos no los trae', () => {
    const [first] = questionBatches;
    if (!first) throw new Error('faltan lotes');
    const [item, ...rest] = first.questions;
    if (!item) throw new Error('faltan preguntas');
    const special = {
      ...item,
      kinds: ['control', 'patient_perspective'] as const,
      clues: [{ text: 'Dato que define el diagnóstico', strength: 'pathognomonic' as const }],
    };
    const bank = buildDemoBank([
      {
        ...first,
        cases: first.cases,
        questions: [{ ...special, kinds: [...special.kinds] }, ...rest],
      },
    ]);
    const [withKinds, plain] = bank.questions;
    expect(withKinds?.question.itemKinds).toEqual(['control', 'patient_perspective']);
    expect(withKinds?.question.clues?.[0]?.strength).toBe('pathognomonic');
    expect(plain?.question.itemKinds).toBeUndefined();
    expect(plain?.question.clues).toBeUndefined();
  });
});
