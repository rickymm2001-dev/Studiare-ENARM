import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { storesFor, TABLES, TABLE_NAMES } from '../db/tables';
import { makeQuestionWithOptions, makeUser, newId } from '../testing/fixtures';
import { AiArtifactSchema } from './activity';
import { OptionSchema, QuestionSchema } from './bank';
import { UtcDateTimeSchema } from './common';
import { NoteSchema } from './decks';
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

  it('hay un esquema para los 30 tipos de evento de 6.3 más el cambio de suscripción simulada', () => {
    expect(EVENT_TYPES).toHaveLength(31);
    expect(AppEventSchema.options).toHaveLength(31);
  });

  it('los ajustes por defecto siguen la especificación', () => {
    expect(UserSettingsSchema.parse({})).toEqual({
      desiredRetention: 0.9,
      maxIntervalDays: 21,
      spacing: { hard: 1, good: 1, easy: 1 },
      newCardsPerDay: 20,
      reviewsPerDay: 200,
      cardConfidenceStep: true,
      negationHighlightPractice: true,
      negationHighlightExam: false,
      errorsToReview: true,
      optionsShown: 4,
      branches: ['internal_medicine', 'pediatrics', 'obstetrics_gynecology', 'general_surgery'],
      // Racha con 20 tarjetas (9.4) y Pomodoro de 25, 5 y 15 cada 4 ciclos (9.2)
      dailyGoal: { metric: 'cards', value: 20 },
      followedDecks: [],
      pomodoro: {
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        cyclesBeforeLong: 4,
        sound: true,
        notifications: false,
      },
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

  it('las fechas UTC usan un solo formato, el de toISOString', () => {
    const now = new Date('2026-10-01T10:00:00.500Z');
    expect(UtcDateTimeSchema.parse(now.toISOString())).toBe('2026-10-01T10:00:00.500Z');
    for (const other of [
      '2026-10-01T10:00:00Z',
      '2026-10-01T10:00:00.5Z',
      '2026-10-01T10:00:00.123456Z',
      '2026-10-01T10:00:00.000-06:00',
    ]) {
      expect(UtcDateTimeSchema.safeParse(other).success, other).toBe(false);
    }
  });

  it('un artefacto de IA sale de borrador solo con decisión y validador aprobado (4.1, 4.2)', () => {
    const draft = {
      id: newId(),
      userId: newId(),
      kind: 'flashcard',
      status: 'draft',
      mode: 'mock',
      model: 'fixture',
      promptVersion: 'flashcards.v1',
      content: {},
      validatorResult: { passed: false, issues: ['cifra sin respaldo'] },
      sourceIds: [newId()],
      createdAt: '2026-10-01T10:00:00.000Z',
      decidedAt: null,
      decidedBy: null,
    };
    expect(AiArtifactSchema.parse(draft).status).toBe('draft');
    const decided = { ...draft, decidedAt: '2026-10-01T11:00:00.000Z', decidedBy: newId() };
    expect(() => AiArtifactSchema.parse({ ...draft, status: 'approved' })).toThrow();
    expect(() => AiArtifactSchema.parse({ ...decided, status: 'approved' })).toThrow();
    expect(AiArtifactSchema.parse({ ...decided, status: 'rejected' }).status).toBe('rejected');
    const passed = { ...decided, validatorResult: { passed: true, issues: [] } };
    expect(AiArtifactSchema.parse({ ...passed, status: 'approved' }).status).toBe('approved');
  });

  it('una tarjeta generada cita su fuente (4.1)', () => {
    const note = {
      id: newId(),
      deckId: newId(),
      kind: 'basic',
      front: 'Frente',
      back: 'Reverso',
      tags: [],
      origin: 'generated',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    expect(() => NoteSchema.parse(note)).toThrow();
    const anchored = {
      ...note,
      sourceQuote: 'Frase exacta de la explicación',
      sourceQuestionVersionId: newId(),
    };
    expect(NoteSchema.parse(anchored).origin).toBe('generated');
    expect(NoteSchema.parse({ ...note, origin: 'manual' }).origin).toBe('manual');
  });

  it('los esquemas rechazan campos desconocidos', () => {
    expect(() => UserSchema.parse({ ...makeUser(), email: 'alguien@example.com' })).toThrow();
  });
});
