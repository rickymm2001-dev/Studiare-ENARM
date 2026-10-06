import { describe, expect, it } from 'vitest';
import type { Card } from '@/data/schemas/decks';
import { errorsFirst, isQuestionNote, renderCloze, reviewEndReason, topicFromTags } from './study';

describe('cloze', () => {
  it('oculta el hueco activo al frente y lo resalta al revelar', () => {
    const html = 'El {{c1::DIU de cobre}} es el método más {{c2::eficaz::calidad}}';
    expect(renderCloze(html, 1, false)).toBe('El <mark>[…]</mark> es el método más eficaz');
    expect(renderCloze(html, 2, false)).toBe(
      'El DIU de cobre es el método más <mark>[calidad]</mark>',
    );
    expect(renderCloze(html, 1, true)).toBe('El <mark>DIU de cobre</mark> es el método más eficaz');
  });
});

describe('reviewEndReason', () => {
  it('permite marcar completada la sesión aunque React todavía no haya actualizado la posición', () => {
    expect(reviewEndReason(4, 5, 'completed')).toBe('completed');
  });

  it('deduce abandono cuando se cierra antes del final', () => {
    expect(reviewEndReason(2, 5)).toBe('abandoned');
  });

  it('deduce completada cuando la posición ya llegó al final', () => {
    expect(reviewEndReason(5, 5)).toBe('completed');
  });
});

describe('tarjetas de preguntas falladas en la cola', () => {
  const card = (id: string, noteId: string, createdAt: string): Card => ({
    id,
    noteId,
    deckId: 'mazo',
    ordinal: 0,
    createdAt,
  });
  const notes = new Map<string, { sourceQuestionVersionId: string | null }>([
    ['n-mazo-1', { sourceQuestionVersionId: null }],
    ['n-mazo-2', { sourceQuestionVersionId: null }],
    ['n-error-tarde', { sourceQuestionVersionId: 'q2' }],
    ['n-error-temprano', { sourceQuestionVersionId: 'q1' }],
  ]);

  it('pone los errores primero, en el orden en que se fallaron, y deja el resto como estaba', () => {
    const ordered = errorsFirst(
      [
        card('c1', 'n-mazo-1', '2026-01-01T00:00:00.000Z'),
        card('c2', 'n-error-tarde', '2026-10-05T16:00:09.000Z'),
        card('c3', 'n-mazo-2', '2026-01-02T00:00:00.000Z'),
        card('c4', 'n-error-temprano', '2026-10-05T16:00:01.000Z'),
      ],
      notes,
    );
    expect(ordered.map((entry) => entry.id)).toEqual(['c4', 'c2', 'c1', 'c3']);
  });

  it('no cambia la lista original y una nota que falta cuenta como tarjeta normal', () => {
    const original = [card('c1', 'sin-nota', '2026-01-01T00:00:00.000Z')];
    expect(errorsFirst(original, notes)).toEqual(original);
    expect(errorsFirst(original, notes)).not.toBe(original);
    expect(isQuestionNote(undefined)).toBe(false);
    expect(isQuestionNote({ sourceQuestionVersionId: null })).toBe(false);
    expect(isQuestionNote({ sourceQuestionVersionId: 'q1' })).toBe(true);
  });

  it('lee la subespecialidad de las etiquetas', () => {
    expect(topicFromTags(['topic:cardiology'])).toBe('cardiology');
    expect(topicFromTags(['otra', 'topic:nephrology'])).toBe('nephrology');
    expect(topicFromTags(['otra'])).toBeNull();
    expect(topicFromTags(undefined)).toBeNull();
  });
});
