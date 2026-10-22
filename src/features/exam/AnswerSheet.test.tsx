// @vitest-environment jsdom
// La hoja de respuestas del examen (V4-B5). Una fila por pregunta y una burbuja por opción, con la
// letra por posición. Solo se llenan las preguntas que ya se vieron. Con teclado la hoja es una sola
// parada de Tab y las flechas mueven el foco (V4-B10).
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/es-MX';
import { AnswerSheet, type SheetRow } from './AnswerSheet';
import { optionLetter } from './optionLetter';

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
  it('muestra una burbuja por opción, con el llenado marcado y la pregunta marcada dicha', () => {
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

  it('llenar una burbuja avisa de qué pregunta y qué opción, y se puede en una que no es la actual', async () => {
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

  it('con el examen cerrado ninguna burbuja responde', () => {
    render(<AnswerSheet rows={rows} current={0} disabled onChoose={vi.fn()} onGo={vi.fn()} />);
    for (const bubble of screen.getAllByRole('radio')) expect(bubble).toBeDisabled();
  });

  it('el número de la pregunta lleva a ella', async () => {
    const onGo = vi.fn();
    render(<AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={onGo} />);
    await userEvent.click(screen.getByRole('button', { name: t.answerSheet.goTo(3) }));
    expect(onGo).toHaveBeenCalledWith(2);
  });

  it('el número de la pregunta lleva a ella y no suma una parada de Tab', () => {
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    for (const number of [1, 2, 3]) {
      expect(screen.getByRole('button', { name: t.answerSheet.goTo(number) })).toHaveAttribute(
        'tabindex',
        '-1',
      );
    }
  });

  it('toda la hoja es una sola parada de Tab, la burbuja llena de la pregunta que se ve', async () => {
    render(
      <>
        <button type="button">antes</button>
        <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />
        <button type="button">después</button>
      </>,
    );
    const stops = screen.getAllByRole('radio').filter((bubble) => bubble.tabIndex === 0);
    expect(stops).toEqual([screen.getByRole('radio', { name: t.answerSheet.bubble(1, 'B') })]);
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('radio', { name: t.answerSheet.bubble(1, 'B') }),
    );
    // Una Tab más sale de la hoja, sin recorrer sus más de mil burbujas
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'después' }));
  });

  it('en una pregunta sin llenar la parada es su primera burbuja', () => {
    render(
      <AnswerSheet rows={rows} current={1} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    const stops = screen.getAllByRole('radio').filter((bubble) => bubble.tabIndex === 0);
    expect(stops).toEqual([screen.getByRole('radio', { name: t.answerSheet.bubble(2, 'A') })]);
  });

  it('izquierda y derecha mueven el foco dentro de la fila sin llenar ni cambiar de pregunta', () => {
    const onChoose = vi.fn();
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={onChoose} onGo={vi.fn()} />,
    );
    const bubble = (letter: string) =>
      screen.getByRole('radio', { name: t.answerSheet.bubble(1, letter) });
    bubble('B').focus();
    // El evento lo atiende la hoja y pide que no llegue al examen, que con las flechas cambia de pregunta
    expect(fireEvent.keyDown(bubble('B'), { key: 'ArrowRight' })).toBe(false);
    expect(document.activeElement).toBe(bubble('C'));
    expect(fireEvent.keyDown(bubble('C'), { key: 'ArrowLeft' })).toBe(false);
    expect(document.activeElement).toBe(bubble('B'));
    // En el borde se queda donde está
    bubble('A').focus();
    fireEvent.keyDown(bubble('A'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(bubble('A'));
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('arriba y abajo saltan a la misma opción de la fila vecina que ya se puede llenar', () => {
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    const bubble = (row: number, letter: string) =>
      screen.getByRole('radio', { name: t.answerSheet.bubble(row, letter) });
    bubble(1, 'C').focus();
    fireEvent.keyDown(bubble(1, 'C'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(bubble(2, 'C'));
    // La tercera fila no se ve todavía, así que no se puede llenar y el foco no pasa a ella
    fireEvent.keyDown(bubble(2, 'C'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(bubble(2, 'C'));
    fireEvent.keyDown(bubble(2, 'C'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(bubble(1, 'C'));
  });

  it('Inicio y Fin van a la primera y a la última burbuja de la fila', () => {
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    const bubble = (letter: string) =>
      screen.getByRole('radio', { name: t.answerSheet.bubble(1, letter) });
    bubble('B').focus();
    fireEvent.keyDown(bubble('B'), { key: 'End' });
    expect(document.activeElement).toBe(bubble('D'));
    fireEvent.keyDown(bubble('D'), { key: 'Home' });
    expect(document.activeElement).toBe(bubble('A'));
  });

  it('la parada de Tab sigue a la última burbuja con el foco mientras no cambie la pregunta', () => {
    const view = render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    const second = screen.getByRole('radio', { name: t.answerSheet.bubble(2, 'C') });
    act(() => {
      second.focus();
    });
    expect(second).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: t.answerSheet.bubble(1, 'B') })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    // Al pasar a otra pregunta vuelve a la burbuja de la pregunta que se ve
    view.rerender(
      <AnswerSheet rows={rows} current={1} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    expect(screen.getByRole('radio', { name: t.answerSheet.bubble(2, 'A') })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('Espacio y Enter llenan la burbuja con el foco', async () => {
    const onChoose = vi.fn();
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={onChoose} onGo={vi.fn()} />,
    );
    screen.getByRole('radio', { name: t.answerSheet.bubble(2, 'B') }).focus();
    await userEvent.keyboard(' ');
    expect(onChoose).toHaveBeenLastCalledWith(1, 'f');
    await userEvent.keyboard('{Enter}');
    expect(onChoose).toHaveBeenCalledTimes(2);
  });

  it('con el examen cerrado ninguna burbuja entra en el orden de Tab y la lista se puede recorrer', () => {
    render(<AnswerSheet rows={rows} current={0} disabled onChoose={vi.fn()} onGo={vi.fn()} />);
    expect(screen.getAllByRole('radio').filter((bubble) => bubble.tabIndex === 0)).toHaveLength(0);
    expect(screen.getByRole('list', { name: t.answerSheet.listLabel })).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('la pregunta marcada lo dice con un ícono y un texto para el lector de pantalla', () => {
    render(
      <AnswerSheet rows={rows} current={0} disabled={false} onChoose={vi.fn()} onGo={vi.fn()} />,
    );
    expect(screen.getByText(t.answerSheet.marked)).toHaveClass('sr-only');
  });
});
