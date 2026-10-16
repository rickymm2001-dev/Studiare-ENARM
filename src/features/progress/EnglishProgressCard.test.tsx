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

function card(list: EnglishAnswer[], texts: number, practiceAvailable = true) {
  return render(
    <MemoryRouter>
      <EnglishProgressCard
        summary={summarizeEnglish(list, THRESHOLDS)}
        texts={texts}
        practiceAvailable={practiceAvailable}
      />
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

  it('sin textos publicados dice que todavía no hay, sin pedir reactivos ni mandar a practicar', () => {
    card([], 0, false);
    const region = screen.getByRole('region', { name: copy.title });
    // Sigue en Calibrando, porque no hay ni una respuesta, pero no pide contestar lo que no existe
    expect(within(region).getByText(t.states.calibrating.title)).toBeVisible();
    expect(within(region).getByText(copy.noTexts)).toBeVisible();
    expect(copy.noTexts).toBe('Todavía no hay textos de lectura. Los agregan los médicos.');
    expect(within(region).queryByText(copy.calibrating(20, 0))).toBeNull();
    expect(within(region).queryByRole('link')).toBeNull();
    expect(within(region).queryByText(copy.goPractice)).toBeNull();
    expect(within(region).queryByText(copy.accuracyLabel)).toBeNull();
  });

  it('con textos publicados pide los reactivos y manda a practicar', () => {
    card([], 0, true);
    const region = screen.getByRole('region', { name: copy.title });
    expect(within(region).getByText(copy.calibrating(20, 0))).toBeVisible();
    expect(within(region).queryByText(copy.noTexts)).toBeNull();
    expect(within(region).getByRole('link', { name: copy.goPractice })).toBeVisible();
  });

  it('con respuestas de antes y sin textos ahora sigue contando lo que lleva, sin botón', () => {
    card(answers(19, 15, 60), 7, false);
    expect(screen.getByText(copy.noTexts)).toBeVisible();
    expect(screen.getByText(copy.texts(7))).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
    // Y con 20 respuestas muestra sus cifras igual, solo que sin mandar a practicar
    card(answers(20, 15, 60), 8, false);
    expect(screen.getByLabelText(copy.statsLabel)).toBeVisible();
    expect(screen.getByText(copy.accuracyCaption(15, 20))).toBeVisible();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(copy.noTexts)).toBeNull();
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
