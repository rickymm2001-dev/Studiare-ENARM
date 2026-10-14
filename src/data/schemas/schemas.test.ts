import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { storesFor, TABLES, TABLE_NAMES } from '../db/tables';
import { makeQuestionWithOptions, makeUser, newId } from '../testing/fixtures';
import { AiArtifactSchema } from './activity';
import { OptionSchema, QuestionSchema } from './bank';
import { UtcDateTimeSchema } from './common';
import { CardSchema, NoteSchema } from './decks';
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

  it('hay un esquema para los 30 tipos de evento de 6.3, el cambio de suscripción simulada, reabrir un artefacto y suspender o reanudar tarjetas, cambiar su fecha de repaso y atender una controversia', () => {
    expect(EVENT_TYPES).toHaveLength(36);
    expect(AppEventSchema.options).toHaveLength(36);
  });

  it('un cambio de fecha de repaso lleva sus tarjetas con la fecha de antes y la nueva', () => {
    const base = {
      id: newId(),
      userId: newId(),
      at: '2026-10-08T12:00:00.000Z',
      tz: 'America/Merida',
      schemaVersion: 1,
      sessionId: null,
      type: 'cards_rescheduled',
    };
    const entry = {
      cardId: newId(),
      from: '2026-10-01T10:00:00.000Z',
      to: '2026-10-09T10:00:00.000Z',
    };
    const payload = { kind: 'spread', cards: [entry], days: 3, undoes: null };
    expect(AppEventSchema.parse({ ...base, payload }).type).toBe('cards_rescheduled');
    // Sin tarjetas, con más de 500, con un tipo que no existe o con una fecha sin zona no pasa
    expect(() => AppEventSchema.parse({ ...base, payload: { ...payload, cards: [] } })).toThrow();
    expect(() =>
      AppEventSchema.parse({
        ...base,
        payload: { ...payload, cards: Array.from({ length: 501 }, () => entry) },
      }),
    ).toThrow();
    expect(() =>
      AppEventSchema.parse({ ...base, payload: { ...payload, kind: 'delete' } }),
    ).toThrow();
    expect(() =>
      AppEventSchema.parse({
        ...base,
        payload: { ...payload, cards: [{ ...entry, to: '2026-10-09' }] },
      }),
    ).toThrow();
    // Deshacer apunta al cambio que revierte y no lleva días
    expect(
      AppEventSchema.parse({
        ...base,
        payload: { kind: 'undo', cards: [entry], days: null, undoes: newId() },
      }).type,
    ).toBe('cards_rescheduled');
    // Un deshacer sin el cambio que deshace, o un repartir que dice deshacer algo, no son válidos
    expect(() =>
      AppEventSchema.parse({
        ...base,
        payload: { kind: 'undo', cards: [entry], days: null, undoes: null },
      }),
    ).toThrow();
    expect(() =>
      AppEventSchema.parse({ ...base, payload: { ...payload, undoes: newId() } }),
    ).toThrow();
    // Repartir y posponer llevan días. Adelantar y deshacer no
    expect(() => AppEventSchema.parse({ ...base, payload: { ...payload, days: null } })).toThrow();
    expect(() =>
      AppEventSchema.parse({ ...base, payload: { ...payload, kind: 'advance', days: 3 } }),
    ).toThrow();
    expect(
      AppEventSchema.parse({ ...base, payload: { ...payload, kind: 'advance', days: null } }).type,
    ).toBe('cards_rescheduled');
  });

  it('los ajustes por defecto siguen la especificación', () => {
    expect(UserSettingsSchema.parse({})).toEqual({
      desiredRetention: 0.9,
      maxIntervalDays: 21,
      spacing: { hard: 1, good: 1, easy: 1 },
      newCardsPerDay: 20,
      reviewsPerDay: 200,
      unlimitedNewCards: false,
      // Temporizador apagado y todos los días normales (D-085)
      cardTimer: { enabled: false, seconds: 30, autoReveal: false },
      easyDays: {
        mon: 'normal',
        tue: 'normal',
        wed: 'normal',
        thu: 'normal',
        fri: 'normal',
        sat: 'normal',
        sun: 'normal',
      },
      cardConfidenceStep: false,
      practiceFeedback: 'end',
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
    // También vale citar un texto o PDF del alumno, con su título (D-085)
    const fromText = { ...note, sourceQuote: 'Frase exacta del texto', sourceTitle: 'Guía.pdf' };
    expect(NoteSchema.parse(fromText).sourceTitle).toBe('Guía.pdf');
    // Sin título ni pregunta no hay fuente aunque haya frase
    expect(() => NoteSchema.parse({ ...note, sourceQuote: 'Frase exacta' })).toThrow();
  });

  it('la señal de controversia solo cita textos de la lista cerrada y no trae texto corregido', () => {
    const note = {
      id: newId(),
      deckId: newId(),
      kind: 'basic',
      front: 'Frente',
      back: 'Reverso',
      tags: [],
      origin: 'generated',
      editorialStatus: 'draft',
      sourceQuote: 'Frase exacta del texto',
      sourceQuestionVersionId: null,
      sourceTitle: 'Guía.pdf',
      isDemo: false,
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    const controversy = {
      reason: 'La frase es una afirmación absoluta y las guías la matizan, así que se revisa.',
      sources: [{ key: 'gpc_cenetec', locator: null }],
      simulated: true,
      flaggedAt: '2026-10-01T10:00:00.000Z',
    };
    expect(NoteSchema.parse({ ...note, controversy }).controversy?.sources).toHaveLength(1);
    // Una fuente fuera de la lista, una explicación corta o un campo de más se rechazan
    expect(() =>
      NoteSchema.parse({
        ...note,
        controversy: { ...controversy, sources: [{ key: 'wiki', locator: null }] },
      }),
    ).toThrow();
    expect(() =>
      NoteSchema.parse({ ...note, controversy: { ...controversy, reason: 'corta' } }),
    ).toThrow();
    expect(() =>
      NoteSchema.parse({ ...note, controversy: { ...controversy, suggestedText: 'otra cosa' } }),
    ).toThrow();
    expect(NoteSchema.parse({ ...note, controversy: null }).controversy).toBeNull();
  });

  it('una básica con tarjeta inversa lleva los mismos campos que la básica y la misma regla de cita', () => {
    const note = {
      id: newId(),
      deckId: newId(),
      kind: 'basic_reverse',
      front: 'Frente',
      back: 'Reverso',
      tags: [],
      origin: 'manual',
      editorialStatus: 'draft',
      sourceQuote: null,
      sourceQuestionVersionId: null,
      isDemo: false,
      createdAt: '2026-10-01T10:00:00.000Z',
    };
    expect(NoteSchema.parse(note)).toMatchObject({ kind: 'basic_reverse', front: 'Frente' });
    // Es estricta, no mezcla los campos de las cloze
    expect(() => NoteSchema.parse({ ...note, text: 'x' })).toThrow();
    expect(() => NoteSchema.parse({ ...note, back: undefined })).toThrow();
    // Una generada cita su fuente igual que la básica
    expect(() => NoteSchema.parse({ ...note, origin: 'generated' })).toThrow();
    // Sus dos cartas son la 0 y la 1
    const card = { id: newId(), noteId: note.id, deckId: note.deckId, createdAt: note.createdAt };
    expect(CardSchema.parse({ ...card, ordinal: 0 }).ordinal).toBe(0);
    expect(CardSchema.parse({ ...card, ordinal: 1 }).ordinal).toBe(1);
  });

  it('los esquemas rechazan campos desconocidos', () => {
    expect(() => UserSchema.parse({ ...makeUser(), email: 'alguien@example.com' })).toThrow();
  });
});
