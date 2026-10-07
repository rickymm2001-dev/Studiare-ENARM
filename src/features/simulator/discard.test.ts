import { describe, expect, it } from 'vitest';
import { discardReview } from './discard';

const shown = [
  { id: 'a', isCorrect: false },
  { id: 'b', isCorrect: true },
  { id: 'c', isCorrect: false },
  { id: 'd', isCorrect: false },
];

describe('qué se podía descartar', () => {
  it('sin descartes lista todas las incorrectas que no eligió', () => {
    expect(discardReview({ shown, eliminated: [], chosenId: 'a' })).toEqual({
      couldDiscard: ['c', 'd'],
      discardedWrong: 0,
      wrongShown: 3,
      discardedCorrect: false,
    });
  });

  it('cuenta las incorrectas que descartó bien', () => {
    expect(discardReview({ shown, eliminated: ['c', 'd'], chosenId: 'b' })).toEqual({
      couldDiscard: ['a', 'c', 'd'],
      discardedWrong: 2,
      wrongShown: 3,
      discardedCorrect: false,
    });
  });

  it('avisa si descartó la correcta', () => {
    const review = discardReview({ shown, eliminated: ['b', 'c'], chosenId: 'a' });
    expect(review.discardedCorrect).toBe(true);
    expect(review.discardedWrong).toBe(1);
  });

  it('con la pregunta en blanco todas las incorrectas se podían descartar', () => {
    expect(discardReview({ shown, eliminated: [], chosenId: null }).couldDiscard).toEqual([
      'a',
      'c',
      'd',
    ]);
  });

  it('ignora descartes de opciones que no se mostraron', () => {
    const review = discardReview({ shown, eliminated: ['z'], chosenId: 'b' });
    expect(review.discardedWrong).toBe(0);
    expect(review.discardedCorrect).toBe(false);
  });
});
