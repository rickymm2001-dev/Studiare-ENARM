// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { t } from '@/i18n/es-MX';
import { SessionStatsCard } from './SessionStatsCard';

const text = t.review.sessionStats;

describe('Esta sesión', () => {
  it('muestra hechas, bien y otra vez con su nombre y los minutos activos reales', () => {
    render(
      <SessionStatsCard
        done={14}
        good={11}
        again={3}
        counters={{ new: 4, learning: 2, review: 18 }}
        current="review"
        activeMs={() => 9 * 60_000 + 20_000}
        xpText=""
      />,
    );
    const card = screen.getByRole('region', { name: text.title });
    expect(within(card).getByText('14').nextSibling).toHaveTextContent(text.done);
    expect(within(card).getByText('11').nextSibling).toHaveTextContent(text.good);
    expect(within(card).getByText('3').nextSibling).toHaveTextContent(text.again);
    // 14 hechas en 9 minutos y faltan 24, a ese ritmo son 16 más
    expect(within(card).getByText(`${text.elapsed(9)} ${text.estimate(16)}`)).toBeVisible();
    // Los tres contadores de Anki siguen ahí, con el de la tarjeta actual marcado
    const list = within(card).getByRole('list', { name: t.review.counters.label });
    expect(within(list).getAllByRole('listitem')[2]).toHaveAttribute('aria-current', 'true');
  });

  it('con pocos repasos dice los minutos sin estimar cuánto falta', () => {
    render(
      <SessionStatsCard
        done={1}
        good={1}
        again={0}
        counters={{ new: 0, learning: 0, review: 5 }}
        current="review"
        activeMs={() => 30_000}
        xpText={t.review.xpGained(12)}
      />,
    );
    const card = screen.getByRole('region', { name: text.title });
    expect(within(card).getByText(text.elapsed(0))).toBeVisible();
    expect(within(card).queryByText(/A este ritmo/)).toBeNull();
    expect(within(card).getByText(t.review.xpGained(12))).toBeVisible();
  });
});
