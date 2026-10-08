// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { ReviewCounters } from './ReviewCounters';

describe('contadores del repaso', () => {
  it('muestran los tres con su nombre y marcan el de la tarjeta actual', () => {
    render(<ReviewCounters counters={{ new: 12, learning: 3, review: 1200 }} current="learning" />);
    const list = screen.getByRole('list', { name: t.review.counters.label });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      `${t.review.counters.new}12`,
      `${t.review.counters.learning}3`,
      `${t.review.counters.review}1,200`,
    ]);
    expect(items.filter((item) => item.getAttribute('aria-current') === 'true')).toHaveLength(1);
    expect(items[1]).toHaveAttribute('aria-current', 'true');
  });

  it('sin tarjeta actual ninguno queda marcado', () => {
    render(<ReviewCounters counters={{ new: 0, learning: 0, review: 0 }} current={null} />);
    expect(
      screen.getAllByRole('listitem').some((item) => item.getAttribute('aria-current') === 'true'),
    ).toBe(false);
  });
});
