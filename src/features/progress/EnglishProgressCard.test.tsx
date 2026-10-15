// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { summarizeEnglish, type EnglishAnswer } from '@/engines/englishSection';
import { englishText } from '@/i18n/english';
import { t } from '@/i18n/es-MX';
import { EnglishProgressCard } from './EnglishProgressCard';

afterEach(cleanup);

const THRESHOLDS = { minAnswersForStats: 20, secondsPerItem: 90 };
const copy = englishText.progress;

function answers(n: number, correct: number, seconds: number): EnglishAnswer[] {
  return Array.from({ length: n }, (_, index) => ({
    questionId: `q${index}`,
    correct: index < correct,
    msSpent: seconds * 1000,
  }));
}

function card(list: EnglishAnswer[], texts: number) {
  return render(
    <MemoryRouter>
      <EnglishProgressCard summary={summarizeEnglish(list, THRESHOLDS)} texts={texts} />
    </MemoryRouter>,
  );
}

describe('tarjeta de Inglés médico en Progreso (B13, 2.7)', () => {
  it('sin respuestas calibra, dice cuánto falta y no muestra ninguna cifra', () => {
    card([], 0);
    const region = screen.getByRole('region', { name: copy.title });
    expect(within(region).getByText(t.states.calibrating.title)).toBeVisible();
    expect(
      within(region).getByText(/0 de 20 reactivos de inglés\. Faltan 20 reactivos de inglés/),
    ).toBeVisible();
    expect(within(region).getByText(copy.calibrating(20, 0))).toBeVisible();
    expect(within(region).queryByText(copy.accuracyLabel)).toBeNull();
    expect(within(region).queryByText(copy.paceLabel)).toBeNull();
    expect(within(region).getByRole('link', { name: copy.goPractice })).toHaveAttribute(
      'href',
      '/simular',
    );
  });

  it('con 19 respuestas sigue calibrando, dice cuántas lleva y cuántos textos', () => {
    card(answers(19, 15, 60), 7);
    expect(screen.getByText(copy.calibrating(20, 19))).toBeVisible();
    expect(screen.getByText(copy.texts(7))).toBeVisible();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('con 20 respuestas muestra el porcentaje con su intervalo, el ritmo contra lo sugerido y los textos', () => {
    card(answers(20, 15, 60), 8);
    const stats = screen.getByLabelText(copy.statsLabel);
    expect(within(stats).getByText(copy.accuracyLabel)).toBeVisible();
    const accuracy = within(stats).getByText(/^\d+% \(entre \d+% y \d+%\)$/);
    // 15 de 20 con un prior uniforme es 16/22, o sea 73%, con un intervalo que lo contiene
    expect(accuracy).toHaveTextContent(/^73% \(entre \d+% y \d+%\)$/);
    const [, low, high] = /entre (\d+)% y (\d+)%/.exec(accuracy.textContent) ?? [];
    expect(Number(low)).toBeLessThan(73);
    expect(Number(high)).toBeGreaterThan(73);
    expect(within(stats).getByText(copy.accuracyCaption(15, 20))).toBeVisible();
    // 60 s contra 90 s sugeridos
    expect(within(stats).getByText(copy.pace(60))).toBeVisible();
    expect(
      within(stats).getByText(new RegExp(`${copy.paceCaption(90)} · ${copy.paceBelow(30)}`)),
    ).toBeVisible();
    expect(within(stats).getByText('8')).toBeVisible();
    expect(screen.queryByText(t.states.calibrating.title)).toBeNull();
    expect(screen.getByText(copy.intervalNote)).toBeVisible();
  });

  it('dice si el ritmo va arriba, abajo o justo en lo sugerido', () => {
    card(answers(20, 10, 120), 5);
    expect(screen.getByText(new RegExp(copy.paceAbove(30)))).toBeVisible();
    cleanup();
    card(answers(20, 10, 92), 5);
    expect(screen.getByText(new RegExp(copy.paceOn))).toBeVisible();
  });
});
