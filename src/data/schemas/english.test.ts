// Lo que cambia en los esquemas con Inglés médico (B13, 1.4 y 1.8 del plan de B13). El idioma de una
// pregunta es opcional y sin él es español, y el diccionario de estructura puede traer un bloque en
// inglés. Todo lo que ya existía sigue pasando igual.
import { describe, expect, it } from 'vitest';
import { makeQuestionWithOptions } from '../testing/fixtures';
import { QuestionLanguageSchema, QuestionSchema } from './bank';
import { StructureDictionarySchema } from './content';

describe('idioma de una pregunta', () => {
  it('sin el campo es una pregunta de siempre y con es o en pasa', () => {
    const { question } = makeQuestionWithOptions();
    expect(QuestionSchema.parse(question).language).toBeUndefined();
    expect(QuestionSchema.parse({ ...question, language: 'en' }).language).toBe('en');
    expect(QuestionSchema.parse({ ...question, language: 'es' }).language).toBe('es');
    expect(QuestionLanguageSchema.options).toEqual(['es', 'en']);
    expect(() => QuestionSchema.parse({ ...question, language: 'fr' })).toThrow();
    expect(() => QuestionSchema.parse({ ...question, language: null })).toThrow();
  });
});

describe('bloque en inglés del diccionario de estructura', () => {
  const base = {
    version: 1,
    status: 'pending_physician_review',
    negations: [{ id: 'no', pattern: 'no', kind: 'negation' }],
    falsePositives: [],
    tasks: [{ task: 'diagnosis', patterns: ['diagnostico'] }],
  };

  it('es opcional, así un diccionario de antes sigue pasando', () => {
    expect(StructureDictionarySchema.parse(base).english).toBeUndefined();
  });

  it('trae sus negaciones y falsos positivos con las mismas reglas', () => {
    const english = {
      negations: [{ id: 'not', pattern: 'not', kind: 'negation' }],
      falsePositives: ['not only'],
    };
    expect(StructureDictionarySchema.parse({ ...base, english }).english).toEqual(english);
    expect(() =>
      StructureDictionarySchema.parse({ ...base, english: { ...english, negations: [] } }),
    ).toThrow();
    expect(() =>
      StructureDictionarySchema.parse({
        ...base,
        english: { ...english, negations: [{ id: 'x', pattern: 'x', kind: 'otro' }] },
      }),
    ).toThrow();
    expect(() =>
      StructureDictionarySchema.parse({ ...base, english: { ...english, tasks: [] } }),
    ).toThrow();
  });
});
