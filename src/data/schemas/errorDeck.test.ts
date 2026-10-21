// Los dos campos opcionales de Mis errores (B14, 2.6). Sin ellos todo lo de antes se sigue leyendo igual
import { describe, expect, it } from 'vitest';
import { DeckSchema, NoteSchema } from './decks';

const deck = {
  id: '01JAA6S0000000000000000001',
  name: 'Mis errores',
  description: '',
  ownerId: '01JAA6S0000000000000000002',
  origin: 'generated',
  visibility: 'private',
  isDemo: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const note = {
  id: '01JAA6S0000000000000000003',
  deckId: deck.id,
  kind: 'basic',
  front: '<p>x</p>',
  back: '<p>y</p>',
  tags: [],
  origin: 'generated',
  editorialStatus: 'approved',
  sourceQuote: 'cita',
  sourceQuestionVersionId: '01JAA6S0000000000000000004',
  isDemo: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('system y errorKey', () => {
  it('un mazo y una nota de antes, sin los campos, siguen siendo válidos', () => {
    expect(DeckSchema.safeParse(deck).success).toBe(true);
    expect(NoteSchema.safeParse(note).success).toBe(true);
  });

  it('el mazo acepta la marca de errores y ninguna otra', () => {
    expect(DeckSchema.parse({ ...deck, system: 'errors' }).system).toBe('errors');
    expect(DeckSchema.safeParse({ ...deck, system: 'otro' }).success).toBe(false);
    expect(DeckSchema.safeParse({ ...deck, system: null }).success).toBe(false);
  });

  it('la nota acepta una clave de error corta y rechaza una vacía o muy larga', () => {
    expect(NoteSchema.parse({ ...note, errorKey: 'contraste|a|b' })).toMatchObject({
      errorKey: 'contraste|a|b',
    });
    expect(NoteSchema.safeParse({ ...note, errorKey: '' }).success).toBe(false);
    expect(NoteSchema.safeParse({ ...note, errorKey: 'x'.repeat(201) }).success).toBe(false);
  });
});
