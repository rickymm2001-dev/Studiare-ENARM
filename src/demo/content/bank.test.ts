// Adaptador del banco demo a entidades de la base con IDs estables (D-052).
import { describe, expect, it } from 'vitest';
import { ClinicalCaseSchema, OptionSchema, QuestionSchema } from '@/data/schemas/bank';
import { stableUlid } from '../stableId';
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
