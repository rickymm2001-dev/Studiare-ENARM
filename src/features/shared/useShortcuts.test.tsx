// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { shortcutKey, useShortcuts, type ShortcutBindings } from './useShortcuts';

function Harness({ bindings, enabled }: { bindings: ShortcutBindings; enabled?: boolean }) {
  useShortcuts(bindings, enabled);
  return (
    <div>
      <input aria-label="texto" />
      <button type="button">botón</button>
      <input type="radio" aria-label="opción" />
    </div>
  );
}

describe('nombre de las teclas', () => {
  it('pone las letras en minúscula y marca Mayús con la letra', () => {
    expect(shortcutKey({ key: 'a', shiftKey: false })).toBe('a');
    expect(shortcutKey({ key: 'A', shiftKey: true })).toBe('shift+a');
    expect(shortcutKey({ key: ' ', shiftKey: false })).toBe('space');
    expect(shortcutKey({ key: 'Enter', shiftKey: false })).toBe('enter');
    expect(shortcutKey({ key: '3', shiftKey: false })).toBe('3');
  });
});

describe('atajos de teclado', () => {
  it('llama la acción de la tecla y no las demás', () => {
    const a = vi.fn();
    const enter = vi.fn();
    render(<Harness bindings={{ a, enter }} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(a).toHaveBeenCalledTimes(1);
    expect(enter).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'z' });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('Mayús con la letra es un atajo distinto', () => {
    const plain = vi.fn();
    const shifted = vi.fn();
    render(<Harness bindings={{ b: plain, 'shift+b': shifted }} />);
    fireEvent.keyDown(window, { key: 'B', shiftKey: true });
    expect(shifted).toHaveBeenCalledTimes(1);
    expect(plain).not.toHaveBeenCalled();
  });

  it('no actúa al escribir en un campo', () => {
    const a = vi.fn();
    render(<Harness bindings={{ a }} />);
    fireEvent.keyDown(screen.getByLabelText('texto'), { key: 'a' });
    expect(a).not.toHaveBeenCalled();
  });

  it('con el foco en una opción sí actúa', () => {
    const a = vi.fn();
    render(<Harness bindings={{ a }} />);
    fireEvent.keyDown(screen.getByLabelText('opción'), { key: 'a' });
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('Enter con el foco en un botón lo deja activar el botón y no ejecuta el atajo', () => {
    const enter = vi.fn();
    const space = vi.fn();
    render(<Harness bindings={{ enter, space }} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'botón' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'botón' }), { key: ' ' });
    expect(enter).not.toHaveBeenCalled();
    expect(space).not.toHaveBeenCalled();
  });

  it('ignora Ctrl, Alt y Cmd, y mantener la tecla no repite la acción', () => {
    const a = vi.fn();
    render(<Harness bindings={{ a }} />);
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'a', metaKey: true });
    fireEvent.keyDown(window, { key: 'a', altKey: true });
    fireEvent.keyDown(window, { key: 'a', repeat: true });
    expect(a).not.toHaveBeenCalled();
  });

  it('apagado no escucha', () => {
    const a = vi.fn();
    render(<Harness bindings={{ a }} enabled={false} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(a).not.toHaveBeenCalled();
  });

  it('usa los atajos de la última pintada y deja de escuchar al salir', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Harness bindings={{ a: first }} />);
    view.rerender(<Harness bindings={{ a: second }} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    view.unmount();
    fireEvent.keyDown(window, { key: 'a' });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
