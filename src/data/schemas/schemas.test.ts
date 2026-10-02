import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { storesFor, TABLES, TABLE_NAMES } from '../db/tables';
import { makeQuestionWithOptions, makeUser, newId } from '../testing/fixtures';
import { OptionSchema, QuestionSchema } from './bank';
import { AppEventSchema, EVENT_TYPES } from './events';
import { UserSchema, UserSettingsSchema } from './people';

/** Campos de primer nivel de un esquema de objeto o de cada opción de una unión */
function topLevelKeys(schema: z.ZodType): Set<string> {
  if (schema instanceof z.ZodObject) return new Set(Object.keys(schema.shape));
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const keys = new Set<string>();
    for (const option of schema.options as z.ZodType[]) {
      for (const key of topLevelKeys(option)) keys.add(key);
    }
    return keys;
  }
  throw new Error('Esquema de tabla no soportado en la prueba');
}

function indexedFields(indexes: string): string[] {
  return indexes
    .split(',')
    .map((part) => part.trim().replace(/^[&*]/, ''))
    .flatMap((part) => (part.startsWith('[') ? part.slice(1, -1).split('+') : [part]));
}

describe('esquemas y tablas', () => {
  it('cada campo indexado en Dexie existe en el esquema zod de su tabla', () => {
    for (const name of TABLE_NAMES) {
      const keys = topLevelKeys(TABLES[name].schema);
      for (const field of indexedFields(TABLES[name].indexes)) {
        expect(keys.has(field), `${name}.${field}`).toBe(true);
      }
    }
  });

  it('enarm_real no tiene SimTruth y enarm_demo sí (D-024)', () => {
    expect(storesFor('real')).not.toHaveProperty('simTruth');
    expect(storesFor('demo')).toHaveProperty('simTruth');
    expect(Object.keys(storesFor('demo'))).toHaveLength(TABLE_NAMES.length);
  });

  it('hay un esquema para cada uno de los 30 tipos de evento de 6.3', () => {
    expect(EVENT_TYPES).toHaveLength(30);
    expect(AppEventSchema.options).toHaveLength(30);
  });

  it('los ajustes por defecto siguen la especificación', () => {
    expect(UserSettingsSchema.parse({})).toEqual({
      desiredRetention: 0.9,
      newCardsPerDay: 20,
      reviewsPerDay: 200,
      cardConfidenceStep: true,
      negationHighlightPractice: true,
      negationHighlightExam: false,
      errorsToReview: true,
      optionsShown: 4,
    });
    expect(() => UserSettingsSchema.parse({ desiredRetention: 0.99 })).toThrow();
    expect(UserSchema.parse(makeUser()).timeZone).toBe('America/Merida');
  });

  it('una pregunta y sus opciones válidas pasan', () => {
    const { question, options } = makeQuestionWithOptions();
    expect(QuestionSchema.parse(question)).toEqual(question);
    for (const option of options) expect(OptionSchema.parse(option)).toEqual(option);
  });

  it('cada distractor lleva etiqueta primaria y la correcta no (D-029)', () => {
    const { options } = makeQuestionWithOptions();
    const [correct, distractor] = options;
    if (!correct || !distractor) throw new Error('faltan opciones');
    expect(() => OptionSchema.parse({ ...distractor, biasTag: null })).toThrow();
    expect(() => OptionSchema.parse({ ...correct, biasTag: 'anchoring' })).toThrow();
    expect(
      OptionSchema.parse({ ...distractor, secondaryBiasTags: ['framing_effect'] })
        .secondaryBiasTags,
    ).toEqual(['framing_effect']);
    expect(() => OptionSchema.parse({ ...distractor, secondaryBiasTags: ['anchoring'] })).toThrow();
  });

  it('caso seriado lleva caseId y caseOrder juntos', () => {
    const { question } = makeQuestionWithOptions();
    expect(() => QuestionSchema.parse({ ...question, caseId: newId(), caseOrder: null })).toThrow();
    expect(QuestionSchema.parse({ ...question, caseId: newId(), caseOrder: 2 }).caseOrder).toBe(2);
  });

  it('los esquemas rechazan campos desconocidos', () => {
    expect(() => UserSchema.parse({ ...makeUser(), email: 'alguien@example.com' })).toThrow();
  });
});
