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
  // Pegar necesita el portapapeles, que jsdom no trae
  class FakeDataTransfer {
    private readonly data = new Map<string, string>();
    readonly files: File[] = [];
    get types() {
      return [...this.data.keys()];
    }
    setData(type: string, value: string) {
      this.data.set(type, value);
    }
    getData(type: string) {
      return this.data.get(type) ?? '';
    }
  }
  class FakeClipboardEvent extends Event {
    readonly clipboardData: FakeDataTransfer | null;
    constructor(type: string, init?: { clipboardData?: FakeDataTransfer } & EventInit) {
      super(type, init);
      this.clipboardData = init?.clipboardData ?? null;
    }
  }
  Object.assign(globalThis, { DataTransfer: FakeDataTransfer, ClipboardEvent: FakeClipboardEvent });
});
afterEach(() => {
  cleanup();
});

const badgeOf = (line: ParsedLine) => (line.mark.type === 'none' ? null : 'Tarjeta');
/** Un id con la forma que exige el guardado, para que el editor no lo cambie */
const uid = (n: number) => `01J${String(n).padStart(23, '0')}`;
const [A, B, C, E] = [uid(1), uid(2), uid(3), uid(5)] as const;
/** El árbol en una cadena por línea, con sangría por nivel, para comparar */
const outline = (nodes: readonly OutlineNode[], depth = 0): string[] =>
  nodes.flatMap((entry) => [
    `${'  '.repeat(depth)}${entry.id.slice(-1)} ${entry.text}`,
    ...outline(entry.children, depth + 1),
  ]);
/** Posición dentro del texto de la línea número lineIndex, contando de arriba abajo */
function posIn(editor: Editor, lineIndex: number, offset: number): number {
  let seen = 0;
  let found = -1;
  editor.state.doc.descendants((child, pos) => {
    if (child.type.name !== 'paragraph') return;
    if (seen === lineIndex) found = pos + 1 + offset;
    seen += 1;
  });
  return found;
}
const node = (id: string, text: string, ...children: OutlineNode[]): OutlineNode => ({
  id,
  text,
  children,
});

function lastCall(spy: ReturnType<typeof vi.fn>): OutlineNode[] {
  const call = spy.mock.calls.at(-1);
  return (call?.[0] ?? []) as OutlineNode[];
}

/** Pone el cursor en una línea y teclea una tecla del editor, como Enter o Backspace */
function press(editor: Editor, line: number, offset: number, key: string) {
  act(() => {
    editor.commands.setTextSelection(posIn(editor, line, offset));
    editor.commands.keyboardShortcut(key);
  });
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
    const { view } = await mount([node(A, 'Cardiología', node(B, 'FA >> Arritmia'))]);
    expect(view).toHaveTextContent('Cardiología');
    expect(view.querySelectorAll('li')).toHaveLength(2);
    expect(view.querySelectorAll('ul ul li')).toHaveLength(1);
    // La línea con marca lleva su insignia y su separador resaltado
    expect(view.querySelector('.outline-badge')).toHaveTextContent('Tarjeta');
    expect(view.querySelector('.outline-token--separator')).toHaveTextContent('>>');
  });

  it('al escribir avisa con el árbol de líneas y conserva el id de la que ya existía', async () => {
    const { editor, onChange } = await mount([node(A, 'Hola')]);
    act(() => {
      editor.commands.insertContentAt(editor.state.doc.content.size - 3, ' mundo');
    });
    await waitFor(() => {
      expect(lastCall(onChange)[0]?.text).toBe('Hola mundo');
    });
    expect(lastCall(onChange)[0]?.id).toBe(A);
  });

  it('partir una línea deja la primera con su id y la nueva con uno propio', async () => {
    const { editor, onChange } = await mount([node(A, 'Uno')]);
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
    expect(first?.id).toBe(A);
    expect(second?.text).toBe('Dos');
    expect(second?.id).toBeTruthy();
    expect(second?.id).not.toBe(A);
    // También dentro del editor, así el id nuevo no se vuelve a inventar en cada cambio
    const ids: string[] = [];
    editor.state.doc.descendants((child) => {
      if (child.type.name === 'listItem') ids.push(child.attrs.nodeId as string);
    });
    expect(new Set(ids).size).toBe(2);
  });

  it('meter y sacar una línea cambia su nivel sin perder el id', async () => {
    const { editor, onChange } = await mount([node(A, 'Uno'), node(B, 'Dos')]);
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
    expect(lastCall(onChange)[0]?.children[0]).toMatchObject({ id: B, text: 'Dos' });
    act(() => {
      editor.chain().liftListItem('listItem').run();
    });
    await waitFor(() => {
      expect(lastCall(onChange)).toHaveLength(2);
    });
    expect(countNodes(lastCall(onChange))).toBe(2);
    expect(lastCall(onChange)[1]?.id).toBe(B);
  });

  it('los botones de la barra sirven en el teléfono, donde no hay tecla Tab', async () => {
    const typing = userEvent.setup();
    const { editor, onChange } = await mount([node(A, 'Uno'), node(B, 'Dos')]);
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
    const { editor, onChange } = await mount([node(A, 'El corazón bombea')]);
    // Selecciona la palabra corazón. La línea empieza en la posición 3 del documento
    act(() => {
      editor.commands.setTextSelection({ from: 6, to: 13 });
    });
    await typing.click(screen.getByRole('button', { name: t.outlines.editor.insertCloze }));
    await waitFor(() => {
      expect(lastCall(onChange)[0]?.text).toBe('El {{corazón}} bombea');
    });
  });

  describe('el id sigue al contenido', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

    it('Enter al inicio de una línea con marca deja el id con el texto y no con el renglón vacío', async () => {
      const { editor, onChange } = await mount([node(A, 'Pregunta >> Respuesta')]);
      press(editor, 0, 0, 'Enter');
      await waitFor(() => {
        expect(lastCall(onChange)).toHaveLength(2);
      });
      const [blank, kept] = lastCall(onChange);
      expect(blank?.text).toBe('');
      expect(blank?.id).not.toBe(A);
      expect(kept).toMatchObject({ id: A, text: 'Pregunta >> Respuesta' });
    });

    it('Enter en medio o al final deja el id en la primera parte', async () => {
      const { editor, onChange } = await mount([node(A, 'Pregunta >> Respuesta')]);
      press(editor, 0, 8, 'Enter');
      await waitFor(() => {
        expect(lastCall(onChange)).toHaveLength(2);
      });
      expect(lastCall(onChange)[0]).toMatchObject({ id: A, text: 'Pregunta' });
      expect(lastCall(onChange)[1]?.id).not.toBe(A);
    });

    it('Backspace al inicio de una línea con un renglón vacío encima conserva el id de la de abajo', async () => {
      const { editor, onChange } = await mount([node(E, ''), node(A, 'Pregunta >> Respuesta')]);
      press(editor, 1, 0, 'Backspace');
      await waitFor(() => {
        expect(lastCall(onChange)).toHaveLength(1);
      });
      expect(lastCall(onChange)[0]).toMatchObject({ id: A, text: 'Pregunta >> Respuesta' });
    });

    it('Delete en un renglón vacío con una línea debajo no vacía a la de abajo', async () => {
      const { editor, onChange } = await mount([node(E, ''), node(A, 'Pregunta >> Respuesta')]);
      press(editor, 0, 0, 'Delete');
      await waitFor(() => {
        expect(lastCall(onChange)).toHaveLength(1);
      });
      expect(lastCall(onChange)[0]).toMatchObject({ id: A, text: 'Pregunta >> Respuesta' });
    });

    it('Backspace en un renglón vacío lo borra y el cursor pasa a la línea de arriba', async () => {
      const { editor, onChange } = await mount([node(A, 'Uno', node(B, 'Hijo')), node(E, '')]);
      press(editor, 2, 0, 'Backspace');
      await waitFor(() => {
        expect(lastCall(onChange)).toHaveLength(1);
      });
      expect(outline(lastCall(onChange))).toEqual([`1 Uno`, `  2 Hijo`]);
      const { $from } = editor.state.selection;
      expect($from.parent.textContent).toBe('Hijo');
    });

    it('Backspace al inicio de una línea metida la saca un nivel y no la pega con su padre', async () => {
      const { editor, onChange } = await mount([node(A, 'Tema', node(B, 'Pregunta >> Respuesta'))]);
      press(editor, 1, 0, 'Backspace');
      await waitFor(() => {
        expect(lastCall(onChange)).toHaveLength(2);
      });
      expect(outline(lastCall(onChange))).toEqual([`1 Tema`, `2 Pregunta >> Respuesta`]);
      expect(lastCall(onChange)[1]?.id).toBe(B);
    });

    it('Backspace al inicio de una línea después de un grupo nunca deja sin texto a la de arriba', async () => {
      const { editor, onChange } = await mount([node(A, 'Uno', node(B, 'Dos')), node(C, 'Tres')]);
      press(editor, 2, 0, 'Backspace');
      await settle();
      const text = outline(lastCall(onChange)).join('\n');
      // Unir dos líneas es lo que se pidió. Lo que no puede pasar es que se coma a la que no era
      expect(text).toContain('Uno');
      expect(lastCall(onChange)[0]?.id).toBe(A);
      expect(lastCall(onChange)[0]?.children[0]?.id).toBe(B);
    });

    it('copiar una línea y pegarla arriba deja el id en la original', async () => {
      const { editor, onChange } = await mount([
        node(B, 'Antes'),
        node(A, 'Pregunta >> Respuesta'),
      ]);
      act(() => {
        editor.commands.setTextSelection(posIn(editor, 0, 0));
        editor.view.pasteHTML(`<ul><li data-node-id="${A}"><p>Pregunta >> Respuesta</p></li></ul>`);
      });
      await settle();
      const nodes = lastCall(onChange);
      const owners = nodes.filter((entry) => entry.id === A);
      expect(owners).toHaveLength(1);
      // Todas las líneas tienen id propio
      expect(new Set(nodes.map((entry) => entry.id)).size).toBe(nodes.length);
    });

    it('un id pegado que no es un ULID se cambia por uno propio', async () => {
      const { editor, onChange } = await mount([node(A, 'uno')]);
      act(() => {
        editor.commands.setTextSelection(posIn(editor, 0, 3));
        editor.view.pasteHTML(
          '<ul><li data-node-id="x"><p>pegado</p></li><li data-node-id="no es ulid"><p>otro</p></li></ul>',
        );
      });
      await settle();
      const ids = lastCall(onChange).flatMap((entry) => [entry.id]);
      expect(ids.length).toBeGreaterThan(1);
      for (const id of ids) expect(id).toMatch(/^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/);
    });
  });

  describe('pegar', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

    it('varias líneas de texto plano se vuelven varias líneas con su propia tarjeta', async () => {
      const { editor, onChange } = await mount([node(A, '')]);
      act(() => {
        editor.commands.setTextSelection(posIn(editor, 0, 0));
        editor.view.pasteText('Q1 >> A1\nQ2 >> A2\nQ3 >> A3');
      });
      await settle();
      const nodes = lastCall(onChange);
      expect(nodes.map((entry) => entry.text)).toEqual(['Q1 >> A1', 'Q2 >> A2', 'Q3 >> A3']);
      expect(new Set(nodes.map((entry) => entry.id)).size).toBe(3);
    });

    it('varios párrafos de HTML se vuelven varias líneas', async () => {
      const { editor, onChange } = await mount([node(A, '')]);
      act(() => {
        editor.commands.setTextSelection(posIn(editor, 0, 0));
        editor.view.pasteHTML('<p>Q1 >> A1</p><p>Q2 >> A2</p>');
      });
      await settle();
      expect(lastCall(onChange).map((entry) => entry.text)).toEqual(['Q1 >> A1', 'Q2 >> A2']);
    });
  });

  describe('topes del apunte', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

    it('no deja meter una línea más allá de 8 niveles y explica por qué', async () => {
      // Una cadena de 8 niveles con una hermana del último, que al meterse sería el nivel 9
      const chain = (level: number): OutlineNode =>
        node(
          uid(100 + level),
          `Nivel ${String(level)}`,
          ...(level < 8 ? [chain(level + 1)] : []),
          ...(level === 7 ? [node(uid(200), 'Hermana')] : []),
        );
      const { editor, onChange } = await mount([chain(1)]);
      // Las líneas en orden son los niveles 1 a 8 y luego Hermana, la novena
      act(() => {
        editor.commands.setTextSelection(posIn(editor, 8, 0));
        editor.commands.sinkListItem('listItem');
      });
      await settle();
      expect(await screen.findByText(t.outlines.editor.limits.depth)).toBeInTheDocument();
      // Nada cambió ni se guardó
      expect(onChange).not.toHaveBeenCalled();
    });

    it('no deja que una línea pase de 3,000 caracteres', async () => {
      const { editor, onChange } = await mount([node(A, 'a'.repeat(2999))]);
      act(() => {
        editor.commands.insertContentAt(posIn(editor, 0, 2999), 'bcd');
      });
      await settle();
      expect(await screen.findByText(t.outlines.editor.limits.length)).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
      expect(editor.state.doc.textContent).toHaveLength(2999);
    });

    it('no deja pasar de 2,000 líneas', async () => {
      const lines = Array.from({ length: 2000 }, (_unused, index) => node(uid(1000 + index), 'x'));
      const { editor, onChange } = await mount(lines);
      press(editor, 1999, 1, 'Enter');
      await settle();
      expect(await screen.findByText(t.outlines.editor.limits.lines)).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  it('Esc lleva el foco a la barra de herramientas', async () => {
    const { view } = await mount([node(A, 'Uno')]);
    fireEvent.keyDown(view, { key: 'Escape' });
    expect(screen.getByRole('button', { name: t.outlines.editor.indent })).toHaveFocus();
  });
});
