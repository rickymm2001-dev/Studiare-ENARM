import { describe, expect, it } from 'vitest';
import type { Note } from '@/data/schemas/decks';
import { cardLabel } from './cardLabel';

const base = {
  id: '01JAA6S0000000000000000001',
  deckId: '01JAA6S0000000000000000002',
  tags: [],
  origin: 'manual' as const,
  editorialStatus: 'draft' as const,
  sourceQuote: null,
  sourceQuestionVersionId: null,
  isDemo: false,
  createdAt: '2026-10-08T12:00:00.000Z',
};

describe('nombre de una tarjeta como evidencia', () => {
  it('una básica se nombra por su frente', () => {
    const note: Note = {
      ...base,
      kind: 'basic',
      front: '<p>¿Qué es la <b>FEVI</b>?</p>',
      back: 'x',
    };
    expect(cardLabel(note, 0)).toBe('¿Qué es la FEVI ?');
  });

  it('en una inversa la carta 1 pregunta el reverso y se nombra por él', () => {
    const note: Note = { ...base, kind: 'basic_reverse', front: 'Pregunta', back: 'Respuesta' };
    expect(cardLabel(note, 0)).toBe('Pregunta');
    expect(cardLabel(note, 1)).toBe('Respuesta');
  });

  it('una cloze oculta todos sus huecos y un texto largo se corta', () => {
    const cloze: Note = {
      ...base,
      kind: 'cloze',
      text: 'El {{c1::bisoprolol}} y el {{c2::carvedilol}}',
      extra: '',
    };
    expect(cardLabel(cloze, 1)).toBe('El […] y el […]');
    const long: Note = { ...base, kind: 'basic', front: 'a'.repeat(300), back: 'x' };
    expect(cardLabel(long, 0)).toHaveLength(108);
    expect(cardLabel(long, 0).endsWith('…')).toBe(true);
  });
});
