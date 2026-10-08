import { describe, expect, it } from 'vitest';
import {
  ACADEMIC_SOURCES,
  academicSourceTitle,
  isAcademicSourceId,
} from '@/config/academicSources';
import {
  DraftCardSchema,
  GENERATE_LIMITS,
  GenerateRequestSchema,
  GenerateResponseSchema,
} from './cardTypes';

const passage = {
  id: 'p1',
  page: 3,
  text: 'La metformina es el tratamiento de primera línea en la diabetes tipo 2.',
};
const basic = {
  kind: 'basic' as const,
  front: '¿Tratamiento de primera línea de la diabetes tipo 2?',
  back: 'Metformina',
  passageId: 'p1',
  quote: 'La metformina es el tratamiento de primera línea',
  controversy: null,
};

describe('contrato de tarjetas con IA', () => {
  it('acepta una petición y una respuesta bien formadas', () => {
    expect(
      GenerateRequestSchema.parse({ title: 'Guía de diabetes', passages: [passage], maxCards: 5 }),
    ).toBeTruthy();
    expect(GenerateResponseSchema.parse({ cards: [basic] }).cards).toHaveLength(1);
  });

  it('rechaza lo que pasa de los topes o trae campos de más', () => {
    expect(() => GenerateRequestSchema.parse({ title: 'x', passages: [], maxCards: 5 })).toThrow();
    expect(() =>
      GenerateRequestSchema.parse({
        title: 'x',
        passages: [{ ...passage, id: 'tema1' }],
        maxCards: 5,
      }),
    ).toThrow();
    expect(() =>
      GenerateRequestSchema.parse({
        title: 'x',
        passages: [passage],
        maxCards: GENERATE_LIMITS.maxCards + 1,
      }),
    ).toThrow();
    expect(() =>
      GenerateRequestSchema.parse({ title: 'x', passages: [passage], maxCards: 5, nombre: 'Ana' }),
    ).toThrow();
    expect(() => DraftCardSchema.parse({ ...basic, quote: '' })).toThrow();
    expect(() => DraftCardSchema.parse({ ...basic, extraField: 1 })).toThrow();
  });

  it('una señal de controversia lleva su motivo y al menos un texto', () => {
    const flagged = {
      ...basic,
      controversy: { reason: 'La dosis cambió en la guía vigente', sources: ['gpc_cenetec'] },
    };
    expect(DraftCardSchema.parse(flagged)).toBeTruthy();
    expect(() =>
      DraftCardSchema.parse({ ...basic, controversy: { reason: '', sources: ['nom'] } }),
    ).toThrow();
    expect(() =>
      DraftCardSchema.parse({ ...basic, controversy: { reason: 'x', sources: [] } }),
    ).toThrow();
  });
});

describe('lista cerrada de textos académicos', () => {
  it('tiene ids únicos y nombres, y solo reconoce los suyos', () => {
    const ids = ACADEMIC_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ACADEMIC_SOURCES.every((source) => source.title.length > 5)).toBe(true);
    expect(isAcademicSourceId('harrison')).toBe(true);
    expect(isAcademicSourceId('wikipedia')).toBe(false);
    expect(academicSourceTitle('nelson')).toContain('Nelson');
    expect(academicSourceTitle('blog')).toBeNull();
  });
});
