// @vitest-environment jsdom
// La hoja de respuestas del examen (V4-B5). Una fila por pregunta y un alveolo por opción, con la
// letra por posición. Solo se llenan las preguntas que ya se vieron.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { AnswerSheet, optionLetter, type SheetRow } from './AnswerSheet';

afterEach(() => {
  cleanup();
});

const rows: SheetRow[] = [
  { number: 1, optionIds: ['a', 'b', 'c', 'd'], chosenId: 'b', marked: true },
  { number: 2, optionIds: ['e', 'f', 'g', 'h'], chosenId: null, marked: false },
  { number: 3, optionIds: null, chosenId: null, marked: false },
];

describe('optionLetter', () => {
  it('da A para la primera opción y sigue en orden', () => {
    expect([0, 1, 4].map(optionLetter)).toEqual(['A', 'B', 'E']);
  });
});

describe('AnswerSheet', () => {
  it('muestra un alveolo por opción, con el llenado marcado y la pregunta marcada dicha', () => {
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    const first = screen.getByRole('radiogroup', { name: t.answerSheet.rowLabel(1) });
    expect(within(first).getAllByRole('radio')).toHaveLength(4);
    expect(within(first).getByRole('radio', { name: t.answerSheet.bubble(1, 'B') })).toBeChecked();
    expect(
      within(first).getByRole('radio', { name: t.answerSheet.bubble(1, 'A') }),
    ).not.toBeChecked();
    expect(screen.getByText(t.answerSheet.marked)).toBeTruthy();
  });

  it('llenar un alveolo avisa de qué pregunta y qué opción, y se puede en una que no es la actual', async () => {
    const onChoose = vi.fn();
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={onChoose} onGo={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('radio', { name: t.answerSheet.bubble(2, 'C') }));
    expect(onChoose).toHaveBeenCalledWith(1, 'g');
  });

  it('una pregunta que todavía no se ve no se puede llenar', () => {
    const onChoose = vi.fn();
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={onChoose} onGo={vi.fn()} />,
    );
    const third = screen.getByRole('radiogroup', { name: t.answerSheet.rowLabel(3) });
    for (const bubble of within(third).getAllByRole('radio')) expect(bubble).toBeDisabled();
  });

  it('con el examen cerrado ningún alveolo responde', () => {
    render(<AnswerSheet rows={rows} current={0} disabled onChoose={vi.fn()} onGo={vi.fn()} />);
    for (const bubble of screen.getAllByRole('radio')) expect(bubble).toBeDisabled();
  });

  it('el número de la pregunta lleva a ella', async () => {
    const onGo = vi.fn();
    render(<AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={onGo} />);
    await userEvent.click(screen.getByRole('button', { name: t.answerSheet.goTo(3) }));
    expect(onGo).toHaveBeenCalledWith(2);
  });
});
