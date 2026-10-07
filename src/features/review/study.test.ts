import { describe, expect, it } from 'vitest';
import type { Card, Note } from '@/data/schemas/decks';
import {
  cardFaces,
  errorsFirst,
  isQuestionNote,
  renderCloze,
  reviewEndReason,
  topicFromTags,
} from './study';

describe('cloze', () => {
  it('oculta el hueco activo al frente y lo resalta al revelar', () => {
    const html = 'El {{c1::DIU de cobre}} es el método más {{c2::eficaz::calidad}}';
    expect(renderCloze(html, 1, false)).toBe('El <mark>[…]</mark> es el método más eficaz');
    expect(renderCloze(html, 2, false)).toBe(
      'El DIU de cobre es el método más <mark>[calidad]</mark>',
    );
    expect(renderCloze(html, 1, true)).toBe('El <mark>DIU de cobre</mark> es el método más eficaz');
  });

  it('un hueco dentro de otro se oculta con él y se pregunta con su propio número', () => {
    const html = '<p>{{c1::El {{c2::ventrículo izquierdo}} bombea a la aorta}}</p>';
    expect(renderCloze(html, 1, false)).toBe('<p><mark>[…]</mark></p>');
    expect(renderCloze(html, 2, false)).toBe('<p>El <mark>[…]</mark> bombea a la aorta</p>');
    expect(renderCloze(html, 1, true)).toBe(
      '<p><mark>El ventrículo izquierdo bombea a la aorta</mark></p>',
    );
    expect(renderCloze(html, 2, true)).toBe(
      '<p>El <mark>ventrículo izquierdo</mark> bombea a la aorta</p>',
    );
  });

  it('un hueco sin cerrar no deja su respuesta en la pregunta', () => {
    expect(renderCloze('La {{c1::creatinina sube', 1, false)).toBe('La <mark>[…]</mark>');
  });
});

describe('caras de una carta', () => {
  const base = {
    id: 'n1',
    deckId: 'd1',
    tags: [],
    origin: 'manual' as const,
    editorialStatus: 'draft' as const,
    sourceQuote: null,
    sourceQuestionVersionId: null,
    isDemo: false,
    createdAt: '2026-10-01T15:00:00.000Z',
  };

  it('una básica pregunta el frente y muestra el reverso', () => {
    const note: Note = { ...base, kind: 'basic', front: '<p>F</p>', back: '<p>R</p>' };
    expect(cardFaces(note, 0)).toEqual({ front: '<p>F</p>', back: '<p>R</p>' });
  });

  it('una inversa pregunta el frente en la carta 0 y el reverso en la carta 1', () => {
    const note: Note = { ...base, kind: 'basic_reverse', front: '<p>F</p>', back: '<p>R</p>' };
    expect(cardFaces(note, 0)).toEqual({ front: '<p>F</p>', back: '<p>R</p>' });
    expect(cardFaces(note, 1)).toEqual({ front: '<p>R</p>', back: '<p>F</p>' });
  });

  it('una cloze usa el número de la carta y agrega la nota extra al revelar', () => {
    const note: Note = {
      ...base,
      kind: 'cloze',
      text: '<p>{{c1::A {{c2::B}}}}</p>',
      extra: '<p>Extra</p>',
    };
    expect(cardFaces(note, 2)).toEqual({
      front: '<p>A <mark>[…]</mark></p>',
      back: '<p>A <mark>B</mark></p><br><p>Extra</p>',
    });
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
