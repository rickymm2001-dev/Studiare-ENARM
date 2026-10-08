// @vitest-environment jsdom
// Editor de apuntes. Escribir, partir líneas con Enter, meter con Tab y las insignias de marca.
import type { Editor } from '@tiptap/core';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { countNodes, type OutlineNode, type ParsedLine } from '@/engines/outline';
import { t } from '@/i18n/es-MX';
import { OutlineEditor } from './OutlineEditor';

// ProseMirror mide rectángulos que jsdom no calcula
beforeAll(() => {
  const rect = {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => ({
    length: 0,
    item: () => null,
    [Symbol.iterator]: [][Symbol.iterator],
  });
  document.elementFromPoint = () => null;
});
afterEach(() => {
  cleanup();
});

const badgeOf = (line: ParsedLine) => (line.mark.type === 'none' ? null : 'Tarjeta');
const node = (id: string, text: string, ...children: OutlineNode[]): OutlineNode => ({
  id,
  text,
  children,
});

function lastCall(spy: ReturnType<typeof vi.fn>): OutlineNode[] {
  const call = spy.mock.calls.at(-1);
  return (call?.[0] ?? []) as OutlineNode[];
}

describe('OutlineEditor', () => {
  /** Muestra el editor y entrega su instancia, que en jsdom se maneja por comandos y no por teclas */
  async function mount(nodes: OutlineNode[], onChange = vi.fn()) {
    let instance: Editor | undefined;
    render(
      <OutlineEditor
        nodes={nodes}
        onChange={onChange}
        badgeOf={badgeOf}
        onReady={(editor) => {
          instance = editor;
        }}
      />,
    );
    const view = await screen.findByRole('textbox', { name: t.outlines.editor.label });
    await waitFor(() => {
      expect(instance).toBeDefined();
    });
    return { view, editor: instance as Editor, onChange };
  }

  it('muestra las líneas que recibe, con su estructura', async () => {
    const { view } = await mount([node('a', 'Cardiología', node('b', 'FA >> Arritmia'))]);
    expect(view).toHaveTextContent('Cardiología');
    expect(view.querySelectorAll('li')).toHaveLength(2);
    expect(view.querySelectorAll('ul ul li')).toHaveLength(1);
    // La línea con marca lleva su insignia y su separador resaltado
    expect(view.querySelector('.outline-badge')).toHaveTextContent('Tarjeta');
    expect(view.querySelector('.outline-token--separator')).toHaveTextContent('>>');
  });

  it('al escribir avisa con el árbol de líneas y conserva el id de la que ya existía', async () => {
    const { editor, onChange } = await mount([node('a', 'Hola')]);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 3, ' mundo');
    });
    await waitFor(() => {
      expect(lastCall(onChange)[0]?.text).toBe('Hola mundo');
    });
    expect(lastCall(onChange)[0]?.id).toBe('a');
  });

  it('partir una línea deja la primera con su id y la nueva con uno propio', async () => {
    const { editor, onChange } = await mount([node('a', 'Uno')]);
    act(() => {
      editor
        .chain()
        .setTextSelection(editor.state.doc.content.size - 3)
        .splitListItem('listItem')
        .insertContent('Dos')
        .run();
    });
    await waitFor(() => {
      expect(lastCall(onChange)).toHaveLength(2);
    });
    const [first, second] = lastCall(onChange);
    expect(first?.id).toBe('a');
    expect(second?.text).toBe('Dos');
    expect(second?.id).toBeTruthy();
    expect(second?.id).not.toBe('a');
    // También dentro del editor, así el id nuevo no se vuelve a inventar en cada cambio
    const ids: string[] = [];
    editor.state.doc.descendants((child) => {
      if (child.type.name === 'listItem') ids.push(child.attrs.nodeId as string);
    });
    expect(new Set(ids).size).toBe(2);
  });

  it('meter y sacar una línea cambia su nivel sin perder el id', async () => {
    const { editor, onChange } = await mount([node('a', 'Uno'), node('b', 'Dos')]);
    act(() => {
      editor
        .chain()
        .setTextSelection(editor.state.doc.content.size - 3)
        .sinkListItem('listItem')
        .run();
    });
    await waitFor(() => {
      expect(lastCall(onChange)).toHaveLength(1);
    });
    expect(lastCall(onChange)[0]?.children[0]).toMatchObject({ id: 'b', text: 'Dos' });
    act(() => {
      editor.chain().liftListItem('listItem').run();
    });
    await waitFor(() => {
      expect(lastCall(onChange)).toHaveLength(2);
    });
    expect(countNodes(lastCall(onChange))).toBe(2);
    expect(lastCall(onChange)[1]?.id).toBe('b');
  });

  it('los botones de la barra sirven en el teléfono, donde no hay tecla Tab', async () => {
    const typing = userEvent.setup();
    const { editor, onChange } = await mount([node('a', 'Uno'), node('b', 'Dos')]);
    act(() => {
      editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    });
    await typing.click(screen.getByRole('button', { name: t.outlines.editor.indent }));
    await waitFor(() => {
      expect(lastCall(onChange)[0]?.children).toHaveLength(1);
    });
    // Insertar una marca escribe el separador en la línea donde está el cursor
    await typing.click(screen.getByRole('button', { name: t.outlines.editor.insertForward }));
    await waitFor(() => {
      expect(lastCall(onChange)[0]?.children[0]?.text).toContain('>>');
    });
  });

  it('el botón de hueco envuelve el texto seleccionado', async () => {
    const typing = userEvent.setup();
    const { editor, onChange } = await mount([node('a', 'El corazón bombea')]);
    // Selecciona la palabra corazón. La línea empieza en la posición 3 del documento
    act(() => {
      editor.commands.setTextSelection({ from: 6, to: 13 });
    });
    await typing.click(screen.getByRole('button', { name: t.outlines.editor.insertCloze }));
    await waitFor(() => {
      expect(lastCall(onChange)[0]?.text).toBe('El {{corazón}} bombea');
    });
  });

  it('Esc lleva el foco a la barra de herramientas', async () => {
    const { view } = await mount([node('a', 'Uno')]);
    fireEvent.keyDown(view, { key: 'Escape' });
    expect(screen.getByRole('button', { name: t.outlines.editor.indent })).toHaveFocus();
  });
});
