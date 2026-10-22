// @vitest-environment jsdom
// Recall sprint (V4-B4 y su revisión en V4-B10). Con un apunte sin líneas no corre el reloj, al acabarse
// el tiempo se anuncia y el foco pasa al título de lo escrito, y reintentar después de un fallo no
// duplica las tarjetas que ya se guardaron.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Outline } from '@/data/schemas/outlines';
import { saveManualNote } from '@/data/usecases/manualDecks';
import { RECALL_SECONDS } from '@/engines/recall';
import { t } from '@/i18n/es-MX';
import type { ReadySession } from '../shared/RequireSession';
import { RecallSprint } from './RecallSprint';

vi.mock('@/data/context', () => ({ useDataApi: () => ({}) }));
vi.mock('@/data/usecases/manualDecks', () => ({ saveManualNote: vi.fn() }));

const session = { user: { id: 'u1' } } as unknown as ReadySession;

function outlineWith(nodes: Outline['nodes']): Outline {
  return { id: 'o1', deckId: 'd1', title: 'Sepsis', nodes } as unknown as Outline;
}

const NODES: Outline['nodes'] = [
  { id: 'a', text: 'Líquidos', children: [] },
  { id: 'b', text: 'Antibióticos', children: [] },
];

const save = vi.mocked(saveManualNote);

beforeEach(() => {
  save.mockReset();
  save.mockResolvedValue(undefined as never);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Recall sprint', () => {
  it('con un apunte sin líneas avisa y no corre el reloj', () => {
    render(<RecallSprint session={session} outline={outlineWith([])} onClose={vi.fn()} />);
    expect(screen.getByText(t.recallSprint.emptyOutline)).toBeVisible();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByLabelText(t.recallSprint.writeLabel)).toBeNull();
  });

  it('al acabarse el tiempo lo anuncia y pasa el foco al título de lo escrito', () => {
    vi.useFakeTimers();
    render(<RecallSprint session={session} outline={outlineWith(NODES)} onClose={vi.fn()} />);
    expect(screen.getByRole('timer')).toBeVisible();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(RECALL_SECONDS * 1000);
    });
    expect(screen.getByRole('status')).toHaveTextContent(t.recallSprint.timeUp);
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByRole('heading', { name: t.recallSprint.yours })).toHaveFocus();
  });

  it('reintentar después de un fallo no repite las tarjetas ya guardadas', async () => {
    const typing = userEvent.setup();
    save.mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error('falló'));
    render(<RecallSprint session={session} outline={outlineWith(NODES)} onClose={vi.fn()} />);
    await typing.click(screen.getByRole('button', { name: t.recallSprint.done }));
    await typing.click(screen.getByLabelText(t.recallSprint.missed('Líquidos')));
    await typing.click(screen.getByLabelText(t.recallSprint.missed('Antibióticos')));
    await typing.click(screen.getByRole('button', { name: t.recallSprint.create(2) }));

    // La primera se guardó y la segunda falló
    expect(await screen.findByRole('alert')).toHaveTextContent(t.recallSprint.failed);
    expect(save).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(t.recallSprint.missed('Líquidos'))).not.toBeChecked();
    expect(screen.getByLabelText(t.recallSprint.missed('Antibióticos'))).toBeChecked();
    expect(screen.getAllByText(t.recallSprint.alreadyCard)).toHaveLength(1);

    // Al reintentar solo se guarda la que faltaba
    await typing.click(screen.getByRole('button', { name: t.recallSprint.create(1) }));
    expect(await screen.findByText(t.recallSprint.created(1, 0))).toBeVisible();
    expect(save).toHaveBeenCalledTimes(3);
    const lastFront = save.mock.calls.at(-1)?.[2];
    expect(lastFront?.draft).toMatchObject({ back: 'Antibióticos' });

    // Marcar de nuevo una línea ya creada no la duplica
    await typing.click(screen.getByLabelText(t.recallSprint.missed('Líquidos')));
    expect(screen.queryByRole('button', { name: t.recallSprint.create(1) })).toBeNull();
    const list = screen.getAllByRole('list')[0];
    expect(within(list as HTMLElement).getAllByText(t.recallSprint.alreadyCard)).toHaveLength(2);
  });
});
