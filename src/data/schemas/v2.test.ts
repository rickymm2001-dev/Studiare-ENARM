// Directrices V2 (D-080). El esquema acepta los tipos de reactivo raros y ningún validador los
// rechaza por ser imperfectos. La confianza puede faltar en una respuesta de examen y el descarte
// de opciones queda en el evento.
import { describe, expect, it } from 'vitest';
import { createEvent } from '../events/createEvent';
import { makeQuestionWithOptions, newId } from '../testing/fixtures';
import { QuestionSchema } from './bank';
import { ItemKindSchema } from './common';
import { DemoQuestionSchema } from './content';
import { AppEventSchema } from './events';

describe('tipos de reactivo de V2 (D-080)', () => {
  it('una pregunta estándar sigue pasando sin tipos ni pistas', () => {
    const { question } = makeQuestionWithOptions();
    const parsed = QuestionSchema.parse(question);
    expect(parsed.itemKinds).toBeUndefined();
    expect(parsed.clues).toBeUndefined();
  });

  it('acepta cada tipo de reactivo raro, solo o combinado', () => {
    const { question } = makeQuestionWithOptions();
    for (const kind of ItemKindSchema.options) {
      expect(QuestionSchema.parse({ ...question, itemKinds: [kind] }).itemKinds).toEqual([kind]);
    }
    const mixed = ['inverse_resolution', 'patient_perspective'] as const;
    expect(QuestionSchema.parse({ ...question, itemKinds: [...mixed] }).itemKinds).toEqual(mixed);
    expect(() => QuestionSchema.parse({ ...question, itemKinds: ['inventado'] })).toThrow();
  });

  it('distingue patognomónico de característico en los datos del caso', () => {
    const { question } = makeQuestionWithOptions();
    const clues = [
      { text: 'Cuerpos de Auer en los blastos', strength: 'pathognomonic' },
      { text: 'Fiebre y pancitopenia', strength: 'characteristic' },
      { text: 'Fatiga', strength: 'nonspecific' },
    ] as const;
    const parsed = QuestionSchema.parse({ ...question, clues: [...clues] });
    expect(parsed.clues?.map((clue) => clue.strength)).toEqual([
      'pathognomonic',
      'characteristic',
      'nonspecific',
    ]);
    expect(() =>
      QuestionSchema.parse({ ...question, clues: [{ text: 'x', strength: 'casi' }] }),
    ).toThrow();
  });

  it('un reactivo con incoherencias o de control no tiene que ser perfecto para pasar', () => {
    // Sigue pidiendo una sola correcta por opción, pero no pide coherencia clínica ni nada más
    const { question } = makeQuestionWithOptions();
    const control = QuestionSchema.parse({
      ...question,
      prompt: 'Para esta pregunta de control marque la opción que dice control',
      itemKinds: ['control', 'incoherent'],
    });
    expect(control.itemKinds).toEqual(['control', 'incoherent']);
  });

  it('el formato de lotes de contenido acepta tipos y pistas opcionales', () => {
    const shape = DemoQuestionSchema.shape;
    expect(Object.keys(shape)).toEqual(expect.arrayContaining(['kinds', 'clues']));
    expect(shape.kinds.safeParse(['control']).success).toBe(true);
    expect(shape.kinds.safeParse(undefined).success).toBe(true);
    expect(shape.clues.safeParse([{ text: 'dato', strength: 'characteristic' }]).success).toBe(
      true,
    );
  });
});

describe('respuesta de examen (D-080)', () => {
  const base = {
    questionVersionId: newId(),
    optionVersionId: newId(),
    correct: true,
    msToAnswer: 51_000,
    changeCount: 1,
    highlightEnabled: false,
  };
  const ctx = { userId: newId(), tz: 'America/Merida', sessionId: newId() };

  it('la confianza puede faltar y el descarte y la marca quedan guardados', () => {
    const event = createEvent(
      'question_answered',
      {
        ...base,
        confidence: null,
        eliminatedOptionVersionIds: [newId(), newId()],
        markedForReview: true,
      },
      ctx,
    );
    const parsed = AppEventSchema.parse(event);
    expect(parsed.type === 'question_answered' && parsed.payload.confidence).toBeNull();
    expect(
      parsed.type === 'question_answered' && parsed.payload.eliminatedOptionVersionIds,
    ).toHaveLength(2);
  });

  it('un evento de práctica sin los campos nuevos sigue siendo válido', () => {
    const event = createEvent('question_answered', { ...base, confidence: 'sure' }, ctx);
    expect(AppEventSchema.safeParse(event).success).toBe(true);
  });

  it('una confianza inventada se rechaza', () => {
    const event = createEvent('question_answered', { ...base, confidence: 'sure' }, ctx);
    expect(
      AppEventSchema.safeParse({ ...event, payload: { ...event.payload, confidence: 'seguro' } })
        .success,
    ).toBe(false);
  });
});
